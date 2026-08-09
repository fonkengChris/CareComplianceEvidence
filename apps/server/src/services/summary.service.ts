import {
  type ActivityBreakdownItem,
  type ComplianceSettings,
  type Outcome,
  type ServiceUser,
  type WeeklySummary,
  type WeeklySummaryRow,
  detectReviewHint,
} from '@care/shared';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { activityTypes, dayEntries, serviceUsers, weekPlans } from '../db/schema';
import { computeWeekCompliance, getComplianceSettings } from './compliance.service';
import { toPublicServiceUser } from './service-user.service';

/**
 * Summary service (Phase 7) — the only layer that touches the DB for the manager weekly
 * summary. It aggregates data that already exists rather than computing anything new:
 * compliance is delegated to `computeWeekCompliance` (CLAUDE.md: calculations are
 * backend-owned) and the review nudge to `detectReviewHint`. The heavy lifting per row is a
 * pure function so it is unit-testable without a DB.
 */

type DayEntryRow = typeof dayEntries.$inferSelect;
type WeekPlanRow = typeof weekPlans.$inferSelect;

/** The only day-entry fields the summary reads — keeps the pure builder easy to test. */
type SummaryEntry = {
  activityTypeId: string | null;
  timeSpent: number | null;
  outcome: Outcome | null;
  comment: string | null;
};

/** Label for lines that were planned but never had an activity assigned. */
const UNASSIGNED = 'Unassigned';

/**
 * The Monday (week-commencing date) of the week containing `now`, as `YYYY-MM-DD`. Used
 * as the default week for the summary. Computed in UTC date components so it is stable and
 * deterministic (no time-of-day / locale drift), matching how `week_commencing` is stored.
 */
export function currentWeekCommencing(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0=Sun..6=Sat → days elapsed since this week's Monday.
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Build one summary row for a service user and their plan (or null) for the week. Pure (no
 * DB), mirroring `buildWeekPlanWithEntries`: compliance is delegated, and outcome/review-hint
 * counts plus the per-activity breakdown are derived from the same entries. A null plan means
 * nothing was planned that week — counts are zero and there is nothing to drill into.
 */
export function buildWeeklySummaryRow(
  serviceUser: ServiceUser,
  plan: { id: string } | null,
  entries: readonly SummaryEntry[],
  activityNameById: ReadonlyMap<string, string>,
  settings: ComplianceSettings,
): WeeklySummaryRow {
  if (!plan) {
    return {
      serviceUser,
      weekPlanId: null,
      compliance: null,
      missedCount: 0,
      refusedCount: 0,
      reviewHintCount: 0,
      activityBreakdown: [],
    };
  }

  let missedCount = 0;
  let refusedCount = 0;
  let reviewHintCount = 0;
  // Keyed by activityTypeId; null (unassigned) lines share the `UNASSIGNED` bucket.
  const breakdown = new Map<string, ActivityBreakdownItem>();

  for (const e of entries) {
    if (e.outcome === 'MISSED') missedCount += 1;
    if (e.outcome === 'REFUSED') refusedCount += 1;
    // Review nudge only — never a status (CLAUDE.md); `outcome` stays authoritative.
    if (detectReviewHint(e.comment)) reviewHintCount += 1;

    const key = e.activityTypeId ?? UNASSIGNED;
    const delivered = e.timeSpent ?? 0;
    const existing = breakdown.get(key);
    if (existing) {
      existing.entryCount += 1;
      existing.deliveredMinutes += delivered;
    } else {
      breakdown.set(key, {
        activityTypeId: e.activityTypeId,
        activityName: e.activityTypeId
          ? (activityNameById.get(e.activityTypeId) ?? 'Unknown activity')
          : UNASSIGNED,
        entryCount: 1,
        deliveredMinutes: delivered,
      });
    }
  }

  return {
    serviceUser,
    weekPlanId: plan.id,
    compliance: computeWeekCompliance(entries, serviceUser.contractedHours, settings),
    missedCount,
    refusedCount,
    reviewHintCount,
    activityBreakdown: [...breakdown.values()].sort((a, b) =>
      a.activityName.localeCompare(b.activityName),
    ),
  };
}

/**
 * The manager weekly summary for `weekCommencing`: one row per ACTIVE service user (name
 * order), each carrying that week's plan status or a null (no plan yet). Batches the reads —
 * one query each for service users, plans, and all their day entries — then fans out through
 * the pure builder, so there is no per-service-user round trip.
 */
export async function getWeeklySummary(weekCommencing: string): Promise<WeeklySummary> {
  const [activeRows, activityRows, settings] = await Promise.all([
    db.select().from(serviceUsers).where(eq(serviceUsers.active, true)).orderBy(serviceUsers.name),
    // All activity types (incl. inactive) so historical entries still resolve a name.
    db.select().from(activityTypes),
    getComplianceSettings(),
  ]);
  const activeUsers = activeRows.map(toPublicServiceUser);
  const activityNameById = new Map(activityRows.map((a) => [a.id, a.name]));

  const planRows = await db
    .select()
    .from(weekPlans)
    .where(eq(weekPlans.weekCommencing, weekCommencing));
  const planByServiceUser = new Map<string, WeekPlanRow>(
    planRows.map((p) => [p.serviceUserId, p]),
  );

  const planIds = planRows.map((p) => p.id);
  const entryRows: DayEntryRow[] = planIds.length
    ? await db.select().from(dayEntries).where(inArray(dayEntries.weekPlanId, planIds))
    : [];
  const entriesByPlan = new Map<string, DayEntryRow[]>();
  for (const e of entryRows) {
    const list = entriesByPlan.get(e.weekPlanId);
    if (list) list.push(e);
    else entriesByPlan.set(e.weekPlanId, [e]);
  }

  const rows = activeUsers.map((su) => {
    const plan = planByServiceUser.get(su.id) ?? null;
    const entries = plan ? (entriesByPlan.get(plan.id) ?? []) : [];
    return buildWeeklySummaryRow(su, plan, entries, activityNameById, settings);
  });

  return { weekCommencing, settings, rows };
}
