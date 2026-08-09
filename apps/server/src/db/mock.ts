import { WEEKDAYS } from '@care/shared';
import { eq, inArray } from 'drizzle-orm';
import { client, db } from './index';
import {
  activityTypes,
  dayEntries,
  serviceUsers,
  staffAssignments,
  users,
  weekPlans,
} from './schema';

/**
 * Rich demo data for eyeballing the UI — NOT the seed. `seed.ts` stays minimal and
 * idempotent (one plan, no recordings); this script fills every screen with fully
 * *recorded* weeks that land across all four compliance bands (🟢 on-track, 🟡
 * under-target, 🔴 attention, and over-hours), plus a few review-hint comments.
 *
 * Re-runnable: it owns a fixed set of mock service users (by name) and tears those
 * down first — dropping their week plans (day entries cascade) and staff assignments —
 * so re-running never piles up duplicates and never touches seed data.
 *
 * Prereq: run `bun run db:seed` first (needs the login users, activity types and the
 * compliance-settings singleton). Then `bun run src/db/mock.ts` from apps/server.
 */

// Mondays for the demo weeks (most recent last). Distinct per service user from the
// seed's Alice/Brian, so the (serviceUserId, weekCommencing) unique index is happy.
const WEEKS = ['2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03'] as const;

// One mock service user per row. `deliveryByWeek` is the fraction of contracted hours
// actually delivered that week — this is what drives the compliance colour so the
// manager summary shows a spread of statuses and a per-user trend across weeks.
const MOCK_USERS: {
  name: string;
  address: string;
  contractedHours: number;
  assignToStaff: boolean;
  deliveryByWeek: number[]; // one fraction per WEEKS entry
}[] = [
  {
    name: 'Grace Thompson',
    address: '8 Willow Lane, Riverside',
    contractedHours: 20,
    assignToStaff: true,
    deliveryByWeek: [0.98, 1.02, 0.95, 1.0], // 🟢 steady on-track
  },
  {
    name: 'Daniel Reyes',
    address: '22 Maple Drive, Hillview',
    contractedHours: 15,
    assignToStaff: true,
    deliveryByWeek: [0.8, 0.78, 0.85, 0.82], // 🟡 chronically under target
  },
  {
    name: 'Priya Patel',
    address: '5 Birch Close, Eastgate',
    contractedHours: 25,
    assignToStaff: false,
    deliveryByWeek: [0.6, 0.55, 0.68, 0.62], // 🔴 needs attention
  },
  {
    name: 'Marcus Bell',
    address: '17 Cedar Road, Westpark',
    contractedHours: 10,
    assignToStaff: false,
    deliveryByWeek: [1.05, 1.2, 1.15, 1.18], // over-hours (above red ceiling)
  },
  {
    name: 'Nadia Hassan',
    address: '3 Rowan Street, Northfield',
    contractedHours: 18,
    assignToStaff: true,
    deliveryByWeek: [0.62, 0.8, 0.97, 1.0], // recovering: 🔴 → 🟡 → 🟢
  },
];

// Four planned lines per day (the sensible default). Activities are looked up by name
// from the seeded activity_types, never free-typed.
const DAY_TEMPLATE = [
  { activity: 'Personal Care', allocated: 60 },
  { activity: 'Shopping', allocated: 45 },
  { activity: 'Social Inclusion', allocated: 90 },
  { activity: 'Wellbeing', allocated: 30 },
];

// A few review-hint comments so the "prompt to review" surfacing has something to show.
// These pair with non-COMPLETED outcomes on specific days.
const REVIEW_HINTS = [
  { day: 'WED', line: 2, comment: 'Service user declined shopping trip today.', outcome: 'REFUSED' as const },
  { day: 'SAT', line: 4, comment: 'Session missed — staff sickness, no cover.', outcome: 'MISSED' as const },
];

/** Distribute a target total (minutes) across the 28 lines of a week, weighted by
 *  planned allocation so busier activities carry more of the delivered time. Returns a
 *  map keyed "DAY:line" → spent minutes. Rounding remainder lands on the last line. */
function distribute(targetMinutes: number): Map<string, number> {
  const slots = WEEKDAYS.flatMap((day) =>
    DAY_TEMPLATE.map((l, i) => ({ key: `${day}:${i + 1}`, weight: l.allocated })),
  );
  const totalWeight = slots.reduce((s, x) => s + x.weight, 0);
  const spent = new Map<string, number>();
  let assigned = 0;
  slots.forEach((slot, idx) => {
    let value = Math.round((targetMinutes * slot.weight) / totalWeight);
    if (idx === slots.length - 1) value = targetMinutes - assigned; // absorb remainder
    spent.set(slot.key, Math.max(0, value));
    assigned += value;
  });
  return spent;
}

await db.transaction(async (tx) => {
  const activities = await tx
    .select({ id: activityTypes.id, name: activityTypes.name })
    .from(activityTypes);
  if (activities.length === 0) {
    throw new Error('No activity types found — run `bun run db:seed` before mock.ts.');
  }
  const activityIdByName = new Map(activities.map((a) => [a.name, a.id]));

  const [staff] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'staff@example.com'))
    .limit(1);

  // --- Teardown: remove any prior run's mock users (plans + assignments) ---
  const names = MOCK_USERS.map((u) => u.name);
  const existing = await tx
    .select({ id: serviceUsers.id })
    .from(serviceUsers)
    .where(inArray(serviceUsers.name, names));
  if (existing.length > 0) {
    const ids = existing.map((s) => s.id);
    // day_entries cascade from week_plans; delete plans then assignments then users.
    await tx.delete(weekPlans).where(inArray(weekPlans.serviceUserId, ids));
    await tx.delete(staffAssignments).where(inArray(staffAssignments.serviceUserId, ids));
    await tx.delete(serviceUsers).where(inArray(serviceUsers.id, ids));
    console.log(`Cleared ${ids.length} existing mock service user(s).`);
  }

  // --- Insert fresh mock service users ---
  const inserted = await tx
    .insert(serviceUsers)
    .values(
      MOCK_USERS.map((u) => ({
        name: u.name,
        address: u.address,
        contractedHours: u.contractedHours.toFixed(2),
      })),
    )
    .returning({ id: serviceUsers.id, name: serviceUsers.name });
  const idByName = new Map(inserted.map((r) => [r.name, r.id]));

  let planCount = 0;
  let entryCount = 0;

  for (const u of MOCK_USERS) {
    const serviceUserId = idByName.get(u.name)!;
    const contractedMinutes = Math.round(u.contractedHours * 60);

    for (let w = 0; w < WEEKS.length; w++) {
      const [plan] = await tx
        .insert(weekPlans)
        .values({
          serviceUserId,
          weekCommencing: WEEKS[w],
          notes: `Recorded week for ${u.name} (${WEEKS[w]}).`,
        })
        .returning({ id: weekPlans.id });
      planCount++;

      const target = Math.round(contractedMinutes * u.deliveryByWeek[w]);
      const spentByKey = distribute(target);

      const entries = WEEKDAYS.flatMap((day) =>
        DAY_TEMPLATE.map((line, i) => {
          const lineNumber = i + 1;
          const key = `${day}:${lineNumber}`;
          const hint = REVIEW_HINTS.find((h) => h.day === day && h.line === lineNumber);
          let timeSpent = spentByKey.get(key) ?? 0;
          let outcome: (typeof REVIEW_HINTS)[number]['outcome'] | 'COMPLETED' | 'PARTIALLY_COMPLETED' =
            'COMPLETED';
          let comment: string | undefined;

          if (hint) {
            // Review-hint day: nothing delivered, non-completed outcome + comment.
            timeSpent = 0;
            outcome = hint.outcome;
            comment = hint.comment;
          } else if (timeSpent < line.allocated) {
            outcome = 'PARTIALLY_COMPLETED';
          }

          return {
            weekPlanId: plan.id,
            day,
            lineNumber,
            activityTypeId: activityIdByName.get(line.activity) ?? null,
            description: line.activity,
            comment,
            timeAllocated: line.allocated,
            timeSpent,
            outcome,
          };
        }),
      );
      await tx.insert(dayEntries).values(entries);
      entryCount += entries.length;
    }

    if (u.assignToStaff && staff) {
      await tx
        .insert(staffAssignments)
        .values({ staffId: staff.id, serviceUserId })
        .onConflictDoNothing();
    }
  }

  console.log(
    `Inserted ${inserted.length} service users, ${planCount} recorded week plans, ${entryCount} day entries.`,
  );
});

await client.end();
console.log('Mock data complete.');
