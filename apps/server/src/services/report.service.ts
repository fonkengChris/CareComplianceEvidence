import type { Outcome, ReportData, ServiceUser } from '@care/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { activityTypes, dayEntries, serviceUsers, weekPlans } from '../db/schema';
import { getComplianceSettings } from './compliance.service';
import { toPublicServiceUser } from './service-user.service';
import { buildWeeklySummaryRow } from './summary.service';

/**
 * Report service (Phase 8) — assembles the `ReportData` for a single week plan's commissioner
 * PDF. Like the summary service it aggregates existing data rather than computing anything new:
 * compliance, outcome counts and the per-activity breakdown all come from the shared, already
 * unit-tested `buildWeeklySummaryRow`, so the report can never disagree with the manager summary
 * (CLAUDE.md: calculations are backend-owned). The client renders the PDF from this shape.
 */

/** The only day-entry fields the report reads — matches the summary builder, keeps tests light. */
type ReportEntry = {
  activityTypeId: string | null;
  timeSpent: number | null;
  outcome: Outcome | null;
  comment: string | null;
};

/**
 * Compose a `ReportData` from a plan and its entries. Pure (no DB) and mirrors
 * `buildWeeklySummaryRow`: it reuses that row builder for the compliance/counts/breakdown and
 * layers on the week, notes, bands and `generatedAt` the PDF footer needs. A plan is always
 * present here, so `compliance` is non-null by construction.
 */
export function buildWeekPlanReport(
  serviceUser: ServiceUser,
  plan: { id: string; weekCommencing: string; notes: string | null },
  entries: readonly ReportEntry[],
  activityNameById: ReadonlyMap<string, string>,
  settings: ReportData['settings'],
  generatedAt: string,
): ReportData {
  const row = buildWeeklySummaryRow(serviceUser, { id: plan.id }, entries, activityNameById, settings);
  if (!row.compliance) {
    // Unreachable: buildWeeklySummaryRow only nulls compliance when the plan is null.
    throw new Error('Expected compliance for a plan-backed report');
  }
  return {
    serviceUser,
    weekCommencing: plan.weekCommencing,
    notes: plan.notes,
    compliance: row.compliance,
    missedCount: row.missedCount,
    refusedCount: row.refusedCount,
    reviewHintCount: row.reviewHintCount,
    activityBreakdown: row.activityBreakdown,
    settings,
    generatedAt,
  };
}

/**
 * The report data for one week plan, or null if the plan id is unknown (→ 404). Batches the
 * reads — plan joined to its service user, that plan's day entries, all activity types (incl.
 * inactive, so historical entries still resolve a name), and the compliance settings — then fans
 * out through the pure builder.
 */
export async function getWeekPlanReport(planId: string): Promise<ReportData | null> {
  const [planRow] = await db
    .select({ plan: weekPlans, serviceUser: serviceUsers })
    .from(weekPlans)
    .innerJoin(serviceUsers, eq(serviceUsers.id, weekPlans.serviceUserId))
    .where(eq(weekPlans.id, planId))
    .limit(1);
  if (!planRow) return null;

  const [entryRows, activityRows, settings] = await Promise.all([
    db.select().from(dayEntries).where(eq(dayEntries.weekPlanId, planId)),
    db.select().from(activityTypes),
    getComplianceSettings(),
  ]);
  const activityNameById = new Map(activityRows.map((a) => [a.id, a.name]));

  return buildWeekPlanReport(
    toPublicServiceUser(planRow.serviceUser),
    planRow.plan,
    entryRows,
    activityNameById,
    settings,
    new Date().toISOString(),
  );
}
