import {
  type ActivityBreakdownItem,
  type Outcome,
  type PeriodReport,
  type PeriodSummary,
  type PeriodWeek,
  type ReportData,
  type ReportNote,
  type ServiceUser,
  WEEKDAYS,
  type Weekday,
} from '@care/shared';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../db';
import { activityTypes, dayEntries, serviceUsers, weekPlans } from '../db/schema';
import { computeCompliance, getComplianceSettings } from './compliance.service';
import { toPublicServiceUser } from './service-user.service';
import { buildWeeklySummaryRow } from './summary.service';

/**
 * Report service (Phase 8) — assembles report data for a single week plan's commissioner PDF and
 * for the longer-period (weeks/months/up to a year) per-service-user report. Like the summary
 * service it aggregates existing data rather than computing anything new: compliance, outcome
 * counts and the per-activity breakdown all come from the shared, already unit-tested
 * `buildWeeklySummaryRow` (CLAUDE.md: calculations are backend-owned), and the staff-narrative
 * notes are the raw `DayEntry.comment`s carried verbatim. The client renders every view from
 * these shapes and never recomputes any of it.
 */

/** Label for lines that were planned but never had an activity assigned. */
const UNASSIGNED = 'Unassigned';

/** Milliseconds in a week — used to count the calendar weeks a reporting range spans. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The day-entry fields the report reads: the summary set plus the notes' context. */
type ReportEntry = {
  day: Weekday;
  lineNumber: number;
  activityTypeId: string | null;
  description: string | null;
  timeSpent: number | null;
  outcome: Outcome | null;
  comment: string | null;
};

/** Weekday → 0..6 for Mon..Sun, so notes sort in the order a reader scans a week. */
const WEEKDAY_ORDER = new Map<Weekday, number>(WEEKDAYS.map((d, i) => [d, i]));

/**
 * The staff notes for one week's entries, in weekday-then-line order. Only lines that carry a
 * non-empty `comment` become notes — the report surfaces the narrative staff actually wrote,
 * never blank rows. Pure and shared by the single-week and period builders.
 */
export function buildNotes(
  weekCommencing: string,
  entries: readonly ReportEntry[],
  activityNameById: ReadonlyMap<string, string>,
): ReportNote[] {
  return entries
    .filter((e) => e.comment !== null && e.comment.trim().length > 0)
    .sort((a, b) => {
      const byDay = (WEEKDAY_ORDER.get(a.day) ?? 0) - (WEEKDAY_ORDER.get(b.day) ?? 0);
      return byDay !== 0 ? byDay : a.lineNumber - b.lineNumber;
    })
    .map((e) => ({
      weekCommencing,
      day: e.day,
      activityName: e.activityTypeId
        ? (activityNameById.get(e.activityTypeId) ?? 'Unknown activity')
        : UNASSIGNED,
      description: e.description,
      timeSpent: e.timeSpent,
      outcome: e.outcome,
      // Non-null by the filter above; trimmed so trailing whitespace never bloats the PDF.
      comment: (e.comment as string).trim(),
    }));
}

/**
 * Compose a `ReportData` from a plan and its entries. Pure (no DB) and mirrors
 * `buildWeeklySummaryRow`: it reuses that row builder for the compliance/counts/breakdown and
 * layers on the week, notes, staff comments, bands and `generatedAt` the PDF footer needs. A plan
 * is always present here, so `compliance` is non-null by construction.
 */
export function buildWeekPlanReport(
  serviceUser: ServiceUser,
  plan: { id: string; weekCommencing: string; notes: string | null },
  entries: readonly ReportEntry[],
  activityNameById: ReadonlyMap<string, string>,
  settings: ReportData['settings'],
  generatedAt: string,
): ReportData {
  const row = buildWeeklySummaryRow(
    serviceUser,
    { id: plan.id, notes: plan.notes },
    entries,
    activityNameById,
    settings,
  );
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
    staffNotes: buildNotes(plan.weekCommencing, entries, activityNameById),
    settings,
    generatedAt,
  };
}

/** A plan plus its entries — the per-week input the period builder folds together. */
export type PeriodPlan = {
  id: string;
  weekCommencing: string;
  entries: readonly ReportEntry[];
};

/**
 * Compose a `PeriodReport` for one service user across a range of `weekCount` calendar weeks.
 * Pure (no DB): each plan is scored with the same `buildWeeklySummaryRow` used everywhere else,
 * then the per-week rows are rolled up — delivered/counts summed, the activity breakdown merged,
 * and every week's notes concatenated. The aggregate compliance uses the shared band logic with
 * contracted = weekly contracted × `weekCount`, so weeks with no plan still dilute delivery %.
 */
export function buildPeriodReport(
  serviceUser: ServiceUser,
  plans: readonly PeriodPlan[],
  activityNameById: ReadonlyMap<string, string>,
  settings: ReportData['settings'],
  range: { from: string; to: string; weekCount: number },
  generatedAt: string,
): PeriodReport {
  const weeks: PeriodWeek[] = [];
  const breakdown = new Map<string, ActivityBreakdownItem>();
  const notes: ReportNote[] = [];
  let deliveredMinutes = 0;
  let missedCount = 0;
  let refusedCount = 0;
  let reviewHintCount = 0;

  // Plans arrive already ordered by week; keep that order for weeks and notes.
  for (const plan of plans) {
    const row = buildWeeklySummaryRow(
      serviceUser,
      { id: plan.id, notes: null },
      plan.entries,
      activityNameById,
      settings,
    );
    if (!row.compliance) continue; // Unreachable for a real plan, but keeps the type honest.

    weeks.push({
      weekPlanId: plan.id,
      weekCommencing: plan.weekCommencing,
      compliance: row.compliance,
      missedCount: row.missedCount,
      refusedCount: row.refusedCount,
      reviewHintCount: row.reviewHintCount,
    });

    deliveredMinutes += row.compliance.deliveredMinutes;
    missedCount += row.missedCount;
    refusedCount += row.refusedCount;
    reviewHintCount += row.reviewHintCount;

    for (const item of row.activityBreakdown) {
      const key = item.activityTypeId ?? UNASSIGNED;
      const existing = breakdown.get(key);
      if (existing) {
        existing.entryCount += item.entryCount;
        existing.deliveredMinutes += item.deliveredMinutes;
      } else {
        breakdown.set(key, { ...item });
      }
    }

    notes.push(...buildNotes(plan.weekCommencing, plan.entries, activityNameById));
  }

  const contractedMinutes = Math.round(serviceUser.contractedHours * 60) * range.weekCount;

  return {
    serviceUser,
    from: range.from,
    to: range.to,
    weekCount: range.weekCount,
    compliance: computeCompliance(deliveredMinutes, contractedMinutes, settings),
    missedCount,
    refusedCount,
    reviewHintCount,
    weeks,
    activityBreakdown: [...breakdown.values()].sort((a, b) =>
      a.activityName.localeCompare(b.activityName),
    ),
    staffNotes: notes,
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

/** The Monday (as YYYY-MM-DD) of the week containing an ISO date, computed in UTC. */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Inclusive count of calendar weeks between two week-commencing Mondays (≥ 1). */
export function weekCountBetween(fromMonday: string, toMonday: string): number {
  const ms =
    new Date(`${toMonday}T00:00:00Z`).getTime() - new Date(`${fromMonday}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / WEEK_MS) + 1);
}

/** Group a flat list of day entries by their week-plan id, preserving row order. */
function groupEntriesByPlan(
  rows: readonly (ReportEntry & { weekPlanId: string })[],
): Map<string, ReportEntry[]> {
  const byPlan = new Map<string, ReportEntry[]>();
  for (const e of rows) {
    const list = byPlan.get(e.weekPlanId);
    if (list) list.push(e);
    else byPlan.set(e.weekPlanId, [e]);
  }
  return byPlan;
}

/**
 * The period report for one service user over the week range `[from, to]` (each snapped to its
 * Monday). Returns null if the service-user id is unknown (→ 404). Batches the reads — the
 * service user, their plans in range (week order), those plans' entries, all activity types and
 * the settings — then folds them through the pure builder.
 */
export async function getServiceUserPeriodReport(
  serviceUserId: string,
  from: string,
  to: string,
): Promise<PeriodReport | null> {
  const [suRow] = await db
    .select()
    .from(serviceUsers)
    .where(eq(serviceUsers.id, serviceUserId))
    .limit(1);
  if (!suRow) return null;

  const fromMonday = mondayOf(from);
  const toMonday = mondayOf(to);
  const [planRows, activityRows, settings] = await Promise.all([
    db
      .select()
      .from(weekPlans)
      .where(
        and(
          eq(weekPlans.serviceUserId, serviceUserId),
          gte(weekPlans.weekCommencing, fromMonday),
          lte(weekPlans.weekCommencing, toMonday),
        ),
      )
      .orderBy(asc(weekPlans.weekCommencing)),
    db.select().from(activityTypes),
    getComplianceSettings(),
  ]);
  const activityNameById = new Map(activityRows.map((a) => [a.id, a.name]));

  const planIds = planRows.map((p) => p.id);
  const entryRows = planIds.length
    ? await db.select().from(dayEntries).where(inArray(dayEntries.weekPlanId, planIds))
    : [];
  const entriesByPlan = groupEntriesByPlan(entryRows);

  const plans: PeriodPlan[] = planRows.map((p) => ({
    id: p.id,
    weekCommencing: p.weekCommencing,
    entries: entriesByPlan.get(p.id) ?? [],
  }));

  return buildPeriodReport(
    toPublicServiceUser(suRow),
    plans,
    activityNameById,
    settings,
    { from: fromMonday, to: toMonday, weekCount: weekCountBetween(fromMonday, toMonday) },
    new Date().toISOString(),
  );
}

/**
 * The reports overview for a whole period: a self-contained `PeriodReport` for EVERY active
 * service user (name order), so the reports page can list them all — a user with no plan in the
 * range still appears (empty `weeks`, so the UI shows "no activity" rather than a red 0% badge).
 * One batch of reads for all users — plans in range, their entries, activity types, settings —
 * then a fold per user, so there is no per-user round trip.
 */
export async function getPeriodSummary(from: string, to: string): Promise<PeriodSummary> {
  const fromMonday = mondayOf(from);
  const toMonday = mondayOf(to);
  const weekCount = weekCountBetween(fromMonday, toMonday);
  const generatedAt = new Date().toISOString();

  const [activeRows, activityRows, settings] = await Promise.all([
    db.select().from(serviceUsers).where(eq(serviceUsers.active, true)).orderBy(serviceUsers.name),
    db.select().from(activityTypes),
    getComplianceSettings(),
  ]);
  const activityNameById = new Map(activityRows.map((a) => [a.id, a.name]));

  const planRows = await db
    .select()
    .from(weekPlans)
    .where(and(gte(weekPlans.weekCommencing, fromMonday), lte(weekPlans.weekCommencing, toMonday)))
    .orderBy(asc(weekPlans.weekCommencing));

  const planIds = planRows.map((p) => p.id);
  const entryRows = planIds.length
    ? await db.select().from(dayEntries).where(inArray(dayEntries.weekPlanId, planIds))
    : [];
  const entriesByPlan = groupEntriesByPlan(entryRows);

  const plansByServiceUser = new Map<string, PeriodPlan[]>();
  for (const p of planRows) {
    const plan: PeriodPlan = {
      id: p.id,
      weekCommencing: p.weekCommencing,
      entries: entriesByPlan.get(p.id) ?? [],
    };
    const list = plansByServiceUser.get(p.serviceUserId);
    if (list) list.push(plan);
    else plansByServiceUser.set(p.serviceUserId, [plan]);
  }

  const rows = activeRows.map((su) =>
    buildPeriodReport(
      toPublicServiceUser(su),
      plansByServiceUser.get(su.id) ?? [],
      activityNameById,
      settings,
      { from: fromMonday, to: toMonday, weekCount },
      generatedAt,
    ),
  );

  return { from: fromMonday, to: toMonday, weekCount, settings, rows };
}
