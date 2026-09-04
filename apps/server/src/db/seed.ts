import { WEEKDAYS } from '@care/shared';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import { client, db } from './index';
import {
  activityTypes,
  complianceSettings,
  dayEntries,
  homes,
  serviceUsers,
  staffAssignments,
  staffHomeAssignments,
  users,
  weekPlans,
} from './schema';

/**
 * Idempotent seed: one login user per role, the standard activity list, a default
 * compliance-settings singleton, and a small set of sample service users with one
 * fully-planned week to prove the DayEntry structure. Re-running is safe (no
 * duplicate rows).
 */

// Dev/test login accounts — one per role. All share DEV_PASSWORD. Documented in
// .env.example. Idempotent via onConflictDoNothing on the unique email.
const DEV_PASSWORD = 'Password123!';
const DEV_USERS = [
  { name: 'Morgan Manager', email: 'manager@example.com', role: 'MANAGER' as const },
  { name: 'Sam Staff', email: 'staff@example.com', role: 'STAFF' as const },
  { name: 'Avery Auditor', email: 'auditor@example.com', role: 'AUDITOR' as const },
];

// Named admin account. There is no separate ADMIN role — MANAGER is the app's
// highest-privilege role (full CRUD on service users, plans, activities), so admin
// maps to MANAGER. It has its own password, hashed and inserted separately from the
// shared-password DEV_USERS above. Idempotent via onConflictDoNothing on the email.
const ADMIN_USER = {
  name: 'Chris Admin',
  email: 'chris_admin@carecompliance.com',
  role: 'MANAGER' as const,
  password: 'Password123#',
};

// The standardised, admin-maintained activity list (CLAUDE.md / implementation plan).
const ACTIVITY_NAMES = [
  'Shopping',
  'Cleaning',
  'Wellbeing',
  'Budgeting',
  'Admin',
  'Movies',
  'Cooking',
  'Walking',
  'Social Inclusion',
  'Personal Care',
  'Exercise',
  'Other',
];

// Sensible default 🟢/🟡/🔴 boundaries (percent of contracted hours delivered).
// Managers can adjust these in Phase 6; they are never hardcoded in calculations.
// `recordingGuidance` is manager-editable prose shown to staff above each comment field.
const DEFAULT_COMPLIANCE = {
  greenMin: 90,
  amberMin: 75,
  redOverPct: 110,
  recordingGuidance:
    'Record what support was provided and how the person responded. Capture: what you did, ' +
    'the person’s engagement and mood, any concerns, changes or incidents, and the outcome. ' +
    'Be factual and objective — describe what you observed, not opinions.',
};

// A fixed Monday so re-runs are deterministic regardless of the day seeded.
const SAMPLE_WEEK_COMMENCING = '2026-08-03';

// The four planned lines used for every day of the sample week (minutes).
const SAMPLE_DAY_LINES = [
  { activity: 'Personal Care', minutes: 60 },
  { activity: 'Shopping', minutes: 45 },
  { activity: 'Social Inclusion', minutes: 90 },
  { activity: 'Wellbeing', minutes: 30 },
];

await db.transaction(async (tx) => {
  // 0. Login users — one per role plus the named admin. Hash up front (admin has its
  //    own password), then insert idempotently on the unique email.
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const adminPasswordHash = await hashPassword(ADMIN_USER.password);
  await tx
    .insert(users)
    .values([
      ...DEV_USERS.map((u) => ({ ...u, passwordHash })),
      {
        name: ADMIN_USER.name,
        email: ADMIN_USER.email,
        role: ADMIN_USER.role,
        passwordHash: adminPasswordHash,
      },
    ])
    .onConflictDoNothing({ target: users.email });

  // 1. Activity types — idempotent on the unique name.
  await tx
    .insert(activityTypes)
    .values(ACTIVITY_NAMES.map((name) => ({ name })))
    .onConflictDoNothing();

  // 2. Compliance settings singleton — idempotent on the unique `singleton` flag.
  await tx.insert(complianceSettings).values(DEFAULT_COMPLIANCE).onConflictDoNothing();

  // 3. Sample home — idempotent on the (non-unique) name, so only insert if absent.
  //    Service users below belong to it; a staff member assigned to the home reaches
  //    every service user in it (group-based supervision).
  const [existingHome] = await tx
    .select({ id: homes.id })
    .from(homes)
    .where(eq(homes.name, 'Riverside House'))
    .limit(1);
  const [home] = existingHome
    ? [existingHome]
    : await tx
        .insert(homes)
        .values({ name: 'Riverside House', address: '1 Riverside Way, Riverside' })
        .returning({ id: homes.id });

  // 4. Sample service users + week plan — only when no service users exist yet, so
  //    the block as a whole stays idempotent (service_users has no natural key).
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(serviceUsers);
  if (count > 0) {
    console.log('Sample service users already present — skipping sample data.');
  } else {
    const insertedUsers = await tx
      .insert(serviceUsers)
      .values([
        {
          name: 'Alice Morgan',
          address: '12 Elm Street, Riverside',
          contractedHours: '20.00',
          homeId: home.id,
        },
        {
          name: 'Brian Okafor',
          address: '4 Oak Court, Hillview',
          contractedHours: '15.50',
          homeId: home.id,
        },
      ])
      .returning({ id: serviceUsers.id });

    const activities = await tx
      .select({ id: activityTypes.id, name: activityTypes.name })
      .from(activityTypes);
    const activityIdByName = new Map(activities.map((a) => [a.name, a.id]));

    const [plan] = await tx
      .insert(weekPlans)
      .values({
        serviceUserId: insertedUsers[0].id,
        weekCommencing: SAMPLE_WEEK_COMMENCING,
        notes: 'Sample week for demonstration.',
      })
      .returning({ id: weekPlans.id });

    // ~4 lines/day, Mon–Sun. timeSpent/outcome left null: this is a plan, not yet recorded.
    const entries = WEEKDAYS.flatMap((day) =>
      SAMPLE_DAY_LINES.map((line, i) => ({
        weekPlanId: plan.id,
        day,
        lineNumber: i + 1,
        activityTypeId: activityIdByName.get(line.activity) ?? null,
        timeAllocated: line.minutes,
      })),
    );
    await tx.insert(dayEntries).values(entries);
  }

  // 5. Supervision group — assign Sam Staff to Alice Morgan so the demo staff login
  //    has a plan to record against (Phase 5). Idempotent on the unique pair; looked
  //    up by email/name so it works whether or not sample data was just created.
  const [staff] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'staff@example.com'))
    .limit(1);
  const [alice] = await tx
    .select({ id: serviceUsers.id })
    .from(serviceUsers)
    .where(eq(serviceUsers.name, 'Alice Morgan'))
    .limit(1);
  if (staff && alice) {
    await tx
      .insert(staffAssignments)
      .values({ staffId: staff.id, serviceUserId: alice.id })
      .onConflictDoNothing();
  }

  // 6. Group-based supervision — also assign Sam Staff to Riverside House, so the demo
  //    staff login reaches every service user in the home (Brian via the home, Alice
  //    via both the home and the direct assignment above). Idempotent on the pair.
  if (staff) {
    await tx
      .insert(staffHomeAssignments)
      .values({ staffId: staff.id, homeId: home.id })
      .onConflictDoNothing();
  }
});

await client.end();
console.log('Seed complete.');
