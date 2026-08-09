import { OUTCOMES, ROLES, WEEKDAYS } from '@care/shared';
import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Domain schema for the Care 1-to-1 Hours Tracker.
 *
 * Enums are fed from the shared value tuples in `@care/shared` so the DB enum and
 * the Zod `z.enum` can never drift. Durations are stored as integer MINUTES;
 * `contractedHours` is the one exception — a numeric contract term in hours.
 * Mutable tables carry `createdAt`/`updatedAt`; append-only / write-once tables
 * (`audit_logs`, `refresh_tokens`) carry `createdAt` only.
 */

export const roleEnum = pgEnum('role', ROLES);
export const weekdayEnum = pgEnum('weekday', WEEKDAYS);
export const outcomeEnum = pgEnum('outcome', OUTCOMES);

const createdAt = timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const activityTypes = pgTable('activity_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Selected, never free-typed; unique by name and soft-disabled via `active`.
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt,
  updatedAt,
});

export const homes = pgTable('homes', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  // Soft-disabled via `active` (never hard deleted) so service-user history survives.
  active: boolean('active').notNull().default(true),
  createdAt,
  updatedAt,
});

export const serviceUsers = pgTable('service_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  // Contract term in HOURS (not row-summed). numeric → JS string via Drizzle;
  // the service layer coerces to a number for the API contract.
  contractedHours: numeric('contracted_hours', { precision: 6, scale: 2 }).notNull(),
  // The home this service user belongs to (nullable). `set null` on delete keeps the
  // service user if its home is ever removed — but homes are soft-deleted in practice.
  homeId: uuid('home_id').references(() => homes.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  createdAt,
  updatedAt,
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // Unique login handle.
  email: text('email').notNull().unique(),
  role: roleEnum('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  // Deactivation revokes outstanding refresh tokens (Phase 2).
  active: boolean('active').notNull().default(true),
  createdAt,
  updatedAt,
});

export const weekPlans = pgTable(
  'week_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Preserve plan history: deactivate the service user rather than delete.
    serviceUserId: uuid('service_user_id')
      .notNull()
      .references(() => serviceUsers.id, { onDelete: 'restrict' }),
    // Calendar Monday; `date` (no time-of-day) avoids timezone drift on the boundary.
    weekCommencing: date('week_commencing').notNull(),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [unique('week_plans_service_user_week').on(t.serviceUserId, t.weekCommencing)],
);

export const dayEntries = pgTable(
  'day_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    weekPlanId: uuid('week_plan_id')
      .notNull()
      .references(() => weekPlans.id, { onDelete: 'cascade' }),
    day: weekdayEnum('day').notNull(),
    // Ordering within a day — NOT a fixed count. Lines can be added/removed freely.
    lineNumber: integer('line_number').notNull(),
    // Nullable: a blank line can exist before an activity is chosen. The FK (not
    // NOT NULL) is what enforces "never free-typed".
    activityTypeId: uuid('activity_type_id').references(() => activityTypes.id, {
      onDelete: 'restrict',
    }),
    // Manager's planned text. Staff's "what happened" note lives in `comment`
    // (kept separate so neither overwrites the other).
    description: text('description'),
    comment: text('comment'),
    // Minutes. timeSpent + outcome (+ comment) are recorded later by staff (Phase 5).
    timeAllocated: integer('time_allocated'),
    timeSpent: integer('time_spent'),
    outcome: outcomeEnum('outcome'),
    createdAt,
    updatedAt,
  },
  // Deterministic line slots; leads with weekPlanId so it also serves the
  // per-plan fetch used by the Phase 6 aggregation. Does not cap rows per day.
  (t) => [unique('day_entries_plan_day_line').on(t.weekPlanId, t.day, t.lineNumber)],
);

export const staffAssignments = pgTable(
  'staff_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // The supervision group: which service users a staff member currently covers.
    // A manager grows/shrinks the group by adding/removing rows (Phase 5). Staff
    // may view and record against the week plans of their assigned service users.
    staffId: uuid('staff_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serviceUserId: uuid('service_user_id')
      .notNull()
      .references(() => serviceUsers.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (t) => [
    // At most one row per (staff, service user) — makes assign idempotent.
    unique('staff_assignments_staff_service_user').on(t.staffId, t.serviceUserId),
    // "My assignments" read path (staff dashboard) and the assignment guard.
    index('staff_assignments_staff_idx').on(t.staffId),
  ],
);

export const staffHomeAssignments = pgTable(
  'staff_home_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Group-based supervision: a staff member assigned to a home covers every service
    // user in it. Complements `staff_assignments` (direct per-service-user) — a staff
    // member's reach is the union of both.
    staffId: uuid('staff_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    homeId: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (t) => [
    // At most one row per (staff, home) — makes assign idempotent.
    unique('staff_home_assignments_staff_home').on(t.staffId, t.homeId),
    // "My homes" / access-resolution read path keyed by staff.
    index('staff_home_assignments_staff_idx').on(t.staffId),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Store the hash only, never the raw token.
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Non-null → revoked (logout / user deactivation).
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt,
  },
  // Non-unique: rotation and multiple devices mean many tokens per user. Indexed
  // for the "revoke all tokens for a user" path on logout/deactivation.
  (t) => [index('refresh_tokens_user_idx').on(t.userId)],
);

export const complianceSettings = pgTable('compliance_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Integer percentages of contracted hours delivered. Read at runtime by the
  // Phase 6 calculation — never hardcoded there.
  greenMin: integer('green_min').notNull(),
  amberMin: integer('amber_min').notNull(),
  redOverPct: integer('red_over_pct').notNull(),
  // Enforces "at most one settings row" at the DB level.
  singleton: boolean('singleton').notNull().default(true).unique(),
  createdAt,
  updatedAt,
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Actor; keep the audit row even if the user is later deleted.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    field: text('field'),
    // Tracked fields are scalar in the MVP, so plain text from/to is sufficient.
    fromValue: text('from_value'),
    toValue: text('to_value'),
    createdAt,
  },
  // "Show the history of this record" — the primary audit read path.
  (t) => [index('audit_logs_entity_idx').on(t.entityType, t.entityId)],
);

export const homesRelations = relations(homes, ({ many }) => ({
  serviceUsers: many(serviceUsers),
  staffHomeAssignments: many(staffHomeAssignments),
}));

export const serviceUsersRelations = relations(serviceUsers, ({ one, many }) => ({
  home: one(homes, {
    fields: [serviceUsers.homeId],
    references: [homes.id],
  }),
  weekPlans: many(weekPlans),
  staffAssignments: many(staffAssignments),
}));

export const weekPlansRelations = relations(weekPlans, ({ one, many }) => ({
  serviceUser: one(serviceUsers, {
    fields: [weekPlans.serviceUserId],
    references: [serviceUsers.id],
  }),
  dayEntries: many(dayEntries),
}));

export const dayEntriesRelations = relations(dayEntries, ({ one }) => ({
  weekPlan: one(weekPlans, {
    fields: [dayEntries.weekPlanId],
    references: [weekPlans.id],
  }),
  activityType: one(activityTypes, {
    fields: [dayEntries.activityTypeId],
    references: [activityTypes.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  staffAssignments: many(staffAssignments),
  staffHomeAssignments: many(staffHomeAssignments),
}));

export const staffHomeAssignmentsRelations = relations(staffHomeAssignments, ({ one }) => ({
  staff: one(users, {
    fields: [staffHomeAssignments.staffId],
    references: [users.id],
  }),
  home: one(homes, {
    fields: [staffHomeAssignments.homeId],
    references: [homes.id],
  }),
}));

export const staffAssignmentsRelations = relations(staffAssignments, ({ one }) => ({
  staff: one(users, {
    fields: [staffAssignments.staffId],
    references: [users.id],
  }),
  serviceUser: one(serviceUsers, {
    fields: [staffAssignments.serviceUserId],
    references: [serviceUsers.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
