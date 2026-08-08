import { WEEKDAYS } from '@care/shared';
import { sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import { client, db } from './index';
import {
  activityTypes,
  complianceSettings,
  dayEntries,
  serviceUsers,
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

// The standardised, admin-maintained activity list (CLAUDE.md / implementation plan).
const ACTIVITY_NAMES = [
  'Shopping',
  'Cleaning',
  'Wellbeing',
  'Budgeting',
  'Admin',
  'Social Inclusion',
  'Personal Care',
  'Exercise',
  'Other',
];

// Sensible default 🟢/🟡/🔴 boundaries (percent of contracted hours delivered).
// Managers can adjust these in Phase 6; they are never hardcoded in calculations.
const DEFAULT_COMPLIANCE = { greenMin: 90, amberMin: 75, redOverPct: 110 };

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
  // 0. Login users — one per role. Hash up front, then insert idempotently.
  const passwordHash = await hashPassword(DEV_PASSWORD);
  await tx
    .insert(users)
    .values(DEV_USERS.map((u) => ({ ...u, passwordHash })))
    .onConflictDoNothing({ target: users.email });

  // 1. Activity types — idempotent on the unique name.
  await tx
    .insert(activityTypes)
    .values(ACTIVITY_NAMES.map((name) => ({ name })))
    .onConflictDoNothing();

  // 2. Compliance settings singleton — idempotent on the unique `singleton` flag.
  await tx.insert(complianceSettings).values(DEFAULT_COMPLIANCE).onConflictDoNothing();

  // 3. Sample service users + week plan — only when no service users exist yet, so
  //    the block as a whole stays idempotent (service_users has no natural key).
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(serviceUsers);
  if (count > 0) {
    console.log('Sample service users already present — skipping sample data.');
    return;
  }

  const insertedUsers = await tx
    .insert(serviceUsers)
    .values([
      { name: 'Alice Morgan', address: '12 Elm Street, Riverside', contractedHours: '20.00' },
      { name: 'Brian Okafor', address: '4 Oak Court, Hillview', contractedHours: '15.50' },
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
});

await client.end();
console.log('Seed complete.');
