import {
  type DayEntry,
  type DayEntryInput,
  type DayEntryRecord,
  type DayEntryStaffCreate,
  type WeekPlan,
  type WeekPlanCreate,
  type WeekPlanUpdate,
  type WeekPlanWithEntries,
  WEEKDAYS,
  dayEntrySchema,
  detectReviewHint,
  weekPlanSchema,
} from '@care/shared';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { dayEntries, staffAssignments, weekPlans } from '../db/schema';

/**
 * Week-plan service — the only layer that touches the DB for week plans and their
 * day entries (CLAUDE.md layering). Phase 4 is planning only: `timeSpent` and
 * `outcome` are left null here and recorded by staff in Phase 5.
 *
 * Writes that can collide with the `week_plans_service_user_week` unique constraint
 * (one plan per service user per week) return a typed `conflict` result rather than
 * throwing, so controllers can map it to a 409 without knowing about Postgres codes.
 */

type WeekPlanRow = typeof weekPlans.$inferSelect;
type DayEntryRow = typeof dayEntries.$inferSelect;

/** Map a week-plan row to the public shared shape (timestamps → ISO strings). */
export function toPublicWeekPlan(row: WeekPlanRow): WeekPlan {
  return weekPlanSchema.parse({
    id: row.id,
    serviceUserId: row.serviceUserId,
    // `date` columns come back from postgres.js already as 'YYYY-MM-DD' strings.
    weekCommencing: row.weekCommencing,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Map a day-entry row to the public shared shape. Durations are integer minutes. */
export function toPublicDayEntry(row: DayEntryRow): DayEntry {
  return dayEntrySchema.parse({
    id: row.id,
    weekPlanId: row.weekPlanId,
    day: row.day,
    lineNumber: row.lineNumber,
    activityTypeId: row.activityTypeId,
    description: row.description,
    comment: row.comment,
    timeAllocated: row.timeAllocated,
    timeSpent: row.timeSpent,
    outcome: row.outcome,
    // Derived, never persisted: a keyword scan of the staff comment that nudges a
    // manager to review. Never a status — `outcome` remains authoritative.
    reviewHint: detectReviewHint(row.comment),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Deterministic planner order: Mon→Sun (enum order), then line number within a day. */
export function sortDayEntries(entries: DayEntry[]): DayEntry[] {
  return [...entries].sort(
    (a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) || a.lineNumber - b.lineNumber,
  );
}

/**
 * Build the insert rows for a set of planner-grid inputs against a plan. Pure so it
 * can be unit-tested: `weekPlanId` is injected and `timeSpent`/`outcome` stay null
 * (staff-recorded later), regardless of what the caller sent.
 */
export function buildEntryInserts(
  weekPlanId: string,
  entries: DayEntryInput[],
): (typeof dayEntries.$inferInsert)[] {
  return entries.map((e) => ({
    weekPlanId,
    day: e.day,
    lineNumber: e.lineNumber,
    activityTypeId: e.activityTypeId ?? null,
    description: e.description ?? null,
    timeAllocated: e.timeAllocated ?? null,
  }));
}

/** List week plans, optionally for one service user, newest week first. */
export async function listWeekPlans({
  serviceUserId,
}: { serviceUserId?: string } = {}): Promise<WeekPlan[]> {
  const rows =
    serviceUserId === undefined
      ? await db.select().from(weekPlans).orderBy(asc(weekPlans.weekCommencing))
      : await db
          .select()
          .from(weekPlans)
          .where(eq(weekPlans.serviceUserId, serviceUserId))
          .orderBy(asc(weekPlans.weekCommencing));
  return rows.map(toPublicWeekPlan);
}

/**
 * List week plans a staff member may see — those of the service users in their
 * supervision group only (Phase 5). Optionally narrowed to one service user. Managers
 * and auditors use `listWeekPlans` (unscoped) instead.
 */
export async function listWeekPlansForStaff(
  staffId: string,
  serviceUserId?: string,
): Promise<WeekPlan[]> {
  const scope = eq(staffAssignments.staffId, staffId);
  const rows = await db
    .select({ plan: weekPlans })
    .from(weekPlans)
    .innerJoin(staffAssignments, eq(staffAssignments.serviceUserId, weekPlans.serviceUserId))
    .where(
      serviceUserId === undefined
        ? scope
        : and(scope, eq(weekPlans.serviceUserId, serviceUserId)),
    )
    .orderBy(asc(weekPlans.weekCommencing));
  return rows.map((r) => toPublicWeekPlan(r.plan));
}

/** The service user a plan belongs to, or null if the plan id is unknown. */
export async function serviceUserIdForPlan(weekPlanId: string): Promise<string | null> {
  const [row] = await db
    .select({ serviceUserId: weekPlans.serviceUserId })
    .from(weekPlans)
    .where(eq(weekPlans.id, weekPlanId))
    .limit(1);
  return row?.serviceUserId ?? null;
}

/** Fetch a plan with its day entries (planner order), or null if the id is unknown. */
export async function getWeekPlan(id: string): Promise<WeekPlanWithEntries | null> {
  const [plan] = await db.select().from(weekPlans).where(eq(weekPlans.id, id)).limit(1);
  if (!plan) return null;
  const entryRows = await db.select().from(dayEntries).where(eq(dayEntries.weekPlanId, id));
  return {
    ...toPublicWeekPlan(plan),
    dayEntries: sortDayEntries(entryRows.map(toPublicDayEntry)),
  };
}

export type ConflictResult<T> = { ok: true; value: T } | { ok: false; reason: 'conflict' };

/**
 * Create a week plan. Returns a `conflict` result when the service user already has
 * a plan for that week (unique constraint), for the controller to map to 409.
 */
export async function createWeekPlan(
  input: WeekPlanCreate,
): Promise<ConflictResult<WeekPlan>> {
  try {
    const [row] = await db
      .insert(weekPlans)
      .values({
        serviceUserId: input.serviceUserId,
        weekCommencing: input.weekCommencing,
        notes: input.notes ?? null,
      })
      .returning();
    return { ok: true, value: toPublicWeekPlan(row) };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'conflict' };
    throw err;
  }
}

/**
 * Update the editable fields (`weekCommencing`, `notes`) of a plan. Returns null when
 * no plan matches, or a `conflict` result if the new week collides with another plan.
 */
export async function updateWeekPlan(
  id: string,
  input: WeekPlanUpdate,
): Promise<ConflictResult<WeekPlan> | null> {
  const patch: Partial<typeof weekPlans.$inferInsert> = { updatedAt: new Date() };
  if (input.weekCommencing !== undefined) patch.weekCommencing = input.weekCommencing;
  if (input.notes !== undefined) patch.notes = input.notes;

  try {
    const [row] = await db.update(weekPlans).set(patch).where(eq(weekPlans.id, id)).returning();
    return row ? { ok: true, value: toPublicWeekPlan(row) } : null;
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'conflict' };
    throw err;
  }
}

export type ReplaceEntriesResult =
  | { ok: true; value: WeekPlanWithEntries }
  | { ok: false; reason: 'not_found' | 'conflict' };

/**
 * Bulk-replace a plan's day entries in one transaction: delete the existing set and
 * insert the new one. `not_found` if the plan is gone; `conflict` if two rows share
 * a (day, lineNumber) slot (the `day_entries_plan_day_line` unique constraint).
 */
export async function replaceDayEntries(
  weekPlanId: string,
  entries: DayEntryInput[],
): Promise<ReplaceEntriesResult> {
  try {
    const result = await db.transaction(async (tx) => {
      const [plan] = await tx
        .select()
        .from(weekPlans)
        .where(eq(weekPlans.id, weekPlanId))
        .limit(1);
      if (!plan) return null;

      await tx.delete(dayEntries).where(eq(dayEntries.weekPlanId, weekPlanId));
      const inserts = buildEntryInserts(weekPlanId, entries);
      if (inserts.length > 0) await tx.insert(dayEntries).values(inserts);

      const entryRows = await tx
        .select()
        .from(dayEntries)
        .where(eq(dayEntries.weekPlanId, weekPlanId));
      return {
        ...toPublicWeekPlan(plan),
        dayEntries: sortDayEntries(entryRows.map(toPublicDayEntry)),
      };
    });
    return result ? { ok: true, value: result } : { ok: false, reason: 'not_found' };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'conflict' };
    throw err;
  }
}

export type DuplicateResult =
  | { ok: true; value: WeekPlanWithEntries }
  | { ok: false; reason: 'not_found' | 'conflict' };

/**
 * "Duplicate Previous Week": create a new plan for the source's service user at
 * `weekCommencing`, copying each entry's activity/description/allocated time. Notes,
 * `timeSpent` and `outcome` are cleared — a duplicate is a fresh plan to record
 * against. `not_found` if the source is gone; `conflict` if the target week already
 * has a plan.
 */
export async function duplicateWeekPlan(
  sourceId: string,
  weekCommencing: string,
): Promise<DuplicateResult> {
  try {
    const result = await db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(weekPlans)
        .where(eq(weekPlans.id, sourceId))
        .limit(1);
      if (!source) return null;

      const [created] = await tx
        .insert(weekPlans)
        .values({ serviceUserId: source.serviceUserId, weekCommencing, notes: null })
        .returning();

      const sourceEntries = await tx
        .select()
        .from(dayEntries)
        .where(eq(dayEntries.weekPlanId, sourceId));
      const copies = buildEntryInserts(
        created.id,
        sourceEntries.map((e) => ({
          day: e.day,
          lineNumber: e.lineNumber,
          activityTypeId: e.activityTypeId,
          description: e.description,
          timeAllocated: e.timeAllocated,
        })),
      );
      if (copies.length > 0) await tx.insert(dayEntries).values(copies);

      const entryRows = await tx
        .select()
        .from(dayEntries)
        .where(eq(dayEntries.weekPlanId, created.id));
      return {
        ...toPublicWeekPlan(created),
        dayEntries: sortDayEntries(entryRows.map(toPublicDayEntry)),
      };
    });
    return result ? { ok: true, value: result } : { ok: false, reason: 'not_found' };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'conflict' };
    throw err;
  }
}

export type RecordResult =
  | { ok: true; value: WeekPlanWithEntries }
  | { ok: false; reason: 'not_found' };

/**
 * Staff recording (Phase 5): set ONLY `timeSpent`, `outcome` and `comment` on an
 * existing planned line — never the activity, allocated time, or line position. Returns
 * the refreshed plan (so the client sees the recomputed `reviewHint`), or `not_found` if
 * the entry id is unknown.
 */
export async function recordDayEntry(
  entryId: string,
  input: DayEntryRecord,
): Promise<RecordResult> {
  const patch: Partial<typeof dayEntries.$inferInsert> = {
    updatedAt: new Date(),
    timeSpent: input.timeSpent,
    outcome: input.outcome,
  };
  // `comment` is optional in the body; only touch it when the caller sent it.
  if (input.comment !== undefined) patch.comment = input.comment;

  const [row] = await db
    .update(dayEntries)
    .set(patch)
    .where(eq(dayEntries.id, entryId))
    .returning();
  if (!row) return { ok: false, reason: 'not_found' };

  // The entry references a plan (FK), so getWeekPlan is guaranteed to resolve.
  const plan = await getWeekPlan(row.weekPlanId);
  return { ok: true, value: plan as WeekPlanWithEntries };
}

/**
 * Staff-created ad-hoc line (Phase 5): support that happened but was never planned. The
 * server picks the next `lineNumber` for that day and leaves `timeAllocated` null
 * (unplanned work was never allocated). Returns the refreshed plan, or `not_found` if the
 * plan id is unknown.
 */
export async function addStaffDayEntry(
  weekPlanId: string,
  input: DayEntryStaffCreate,
): Promise<RecordResult> {
  const result = await db.transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(weekPlans)
      .where(eq(weekPlans.id, weekPlanId))
      .limit(1);
    if (!plan) return null;

    const existing = await tx
      .select({ lineNumber: dayEntries.lineNumber })
      .from(dayEntries)
      .where(and(eq(dayEntries.weekPlanId, weekPlanId), eq(dayEntries.day, input.day)));
    const nextLine = existing.reduce((max, e) => Math.max(max, e.lineNumber), 0) + 1;

    await tx.insert(dayEntries).values({
      weekPlanId,
      day: input.day,
      lineNumber: nextLine,
      activityTypeId: input.activityTypeId,
      timeAllocated: null,
      timeSpent: input.timeSpent,
      outcome: input.outcome,
      comment: input.comment ?? null,
    });

    const entryRows = await tx
      .select()
      .from(dayEntries)
      .where(eq(dayEntries.weekPlanId, weekPlanId));
    return {
      ...toPublicWeekPlan(plan),
      dayEntries: sortDayEntries(entryRows.map(toPublicDayEntry)),
    };
  });
  return result ? { ok: true, value: result } : { ok: false, reason: 'not_found' };
}
