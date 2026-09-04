import { z } from 'zod';
import { complianceSettingsSchema, weekComplianceSchema } from './compliance';
import { outcomeSchema, weekdaySchema } from './enums';
import { serviceUserSchema } from './service-user';
import { activityBreakdownItemSchema } from './summary';

/** A calendar date with no time-of-day, e.g. `2026-08-17`. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

/**
 * A single staff-recorded note for a report: the "what happened" comment a staff member wrote
 * on one activity line (`DayEntry.comment`), carried with the context a reader needs to place it
 * — which week and weekday, the activity it was recorded against, the manager's planned
 * `description`, and the recorded time/outcome. Only lines that actually carry a comment become
 * notes, so an empty week produces none. The report includes these verbatim (backend-owned
 * assembly) so both the on-screen view and the PDF surface the same staff narrative.
 */
export const reportNoteSchema = z.object({
  weekCommencing: isoDate,
  day: weekdaySchema,
  activityName: z.string(),
  description: z.string().nullable(),
  timeSpent: z.number().int().min(0).nullable(),
  outcome: outcomeSchema.nullable(),
  comment: z.string(),
});

export type ReportNote = z.infer<typeof reportNoteSchema>;

/**
 * The data for a commissioner PDF report (Phase 8): everything a one-page export for a single
 * `WeekPlan` needs, assembled server-side so all figures stay backend-owned (CLAUDE.md). It is a
 * single-plan cut of the manager summary — the same compliance, outcome counts and per-activity
 * breakdown as a `WeeklySummaryRow` — plus the week, the plan's notes, the 🟢/🟡/🔴 bands that
 * produced the status, and a `generatedAt` stamp for the footer. The client renders the PDF from
 * this shape and never recomputes any of it.
 */
export const reportDataSchema = z.object({
  serviceUser: serviceUserSchema,
  weekCommencing: isoDate,
  notes: z.string().nullable(),
  compliance: weekComplianceSchema,
  missedCount: z.number().int().min(0),
  refusedCount: z.number().int().min(0),
  reviewHintCount: z.number().int().min(0),
  activityBreakdown: z.array(activityBreakdownItemSchema),
  // Every staff comment recorded this week, in weekday then line order — distinct from the
  // plan's weekly `notes` above (CLAUDE.md: the staff narrative belongs in the report too).
  staffNotes: z.array(reportNoteSchema),
  settings: complianceSettingsSchema,
  generatedAt: z.string().datetime(),
});

export type ReportData = z.infer<typeof reportDataSchema>;

/**
 * One week's line in a period report — a compact status for a single `WeekPlan` inside a
 * longer reporting range. It is the per-week granularity a reader drills through: which week,
 * its compliance block (delivered/contracted/status), and its missed/refused/review counts.
 * Only weeks that actually have a plan appear; unplanned weeks contribute nothing but still
 * count toward the period's contracted total.
 */
export const periodWeekSchema = z.object({
  weekPlanId: z.string().uuid(),
  weekCommencing: isoDate,
  compliance: weekComplianceSchema,
  missedCount: z.number().int().min(0),
  refusedCount: z.number().int().min(0),
  reviewHintCount: z.number().int().min(0),
});

export type PeriodWeek = z.infer<typeof periodWeekSchema>;

/**
 * A per-service-user report spanning an arbitrary range of weeks (a week, a month, up to a
 * year). `from`/`to` are the first and last week-commencing Mondays covered; `weekCount` is the
 * number of calendar weeks in the range (the basis for the period's contracted total, so weeks
 * with no plan still dilute delivery %). `compliance` is the aggregate over the whole period —
 * delivered = Σ every week's delivered, contracted = weekly contracted × `weekCount` — computed
 * with the same bands as a single week. `weeks` is the per-week breakdown, `activityBreakdown`
 * the totals rolled up across the range, and `notes` every staff comment in the period. All
 * figures are backend-owned; the client (table + PDF) only displays them.
 */
export const periodReportSchema = z.object({
  serviceUser: serviceUserSchema,
  from: isoDate,
  to: isoDate,
  weekCount: z.number().int().min(1),
  compliance: weekComplianceSchema,
  missedCount: z.number().int().min(0),
  refusedCount: z.number().int().min(0),
  reviewHintCount: z.number().int().min(0),
  weeks: z.array(periodWeekSchema),
  activityBreakdown: z.array(activityBreakdownItemSchema),
  staffNotes: z.array(reportNoteSchema),
  settings: complianceSettingsSchema,
  generatedAt: z.string().datetime(),
});

export type PeriodReport = z.infer<typeof periodReportSchema>;

/**
 * The reports overview for a whole period across every active service user: one self-contained
 * `PeriodReport` per user (each directly renderable to a PDF, no follow-up fetch). The wrapper
 * repeats `from`/`to`/`weekCount`/`settings` once for the page header and the bands display.
 * Every active user is included so none go missing from the list; a user with no plan in the
 * range has empty `weeks` (the UI shows a plain "no activity" line rather than a 0% badge).
 */
export const periodSummarySchema = z.object({
  from: isoDate,
  to: isoDate,
  weekCount: z.number().int().min(1),
  settings: complianceSettingsSchema,
  rows: z.array(periodReportSchema),
});

export type PeriodSummary = z.infer<typeof periodSummarySchema>;
