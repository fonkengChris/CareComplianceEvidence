import { z } from 'zod';
import { complianceSettingsSchema, weekComplianceSchema } from './compliance';
import { serviceUserSchema } from './service-user';

/** A calendar date with no time-of-day, e.g. `2026-08-17`. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

/**
 * One activity type's slice of a service user's week: how many recorded lines used it
 * and how many minutes were delivered under it. `activityTypeId` is null for planned
 * lines that never had an activity assigned — surfaced as `"Unassigned"`.
 */
export const activityBreakdownItemSchema = z.object({
  activityTypeId: z.string().uuid().nullable(),
  activityName: z.string(),
  entryCount: z.number().int().min(0),
  deliveredMinutes: z.number().int().min(0),
});

/**
 * Minutes delivered on each weekday of a service user's week (Mon–Sun), so the summary can
 * show the per-day breakdown that mirrors the commissioner spreadsheet. Zero for days with no
 * recorded time; the seven values sum to the row's compliance `deliveredMinutes`.
 */
export const dailyDeliveredMinutesSchema = z.object({
  MON: z.number().int().min(0),
  TUE: z.number().int().min(0),
  WED: z.number().int().min(0),
  THU: z.number().int().min(0),
  FRI: z.number().int().min(0),
  SAT: z.number().int().min(0),
  SUN: z.number().int().min(0),
});

/**
 * One row of the manager weekly summary: an active service user and, for the selected
 * week, their plan status at a glance. `weekPlanId`/`compliance` are null when no plan
 * exists for that week (nothing to drill into yet). `missed`/`refused` count day-entry
 * outcomes; `reviewHint` counts lines whose comment tripped the keyword scan — a review
 * nudge, never a status (CLAUDE.md). `activityBreakdown` and `dailyMinutes` are per service
 * user; `notes` is the plan's weekly note (null when there is no plan, or none was written).
 */
export const weeklySummaryRowSchema = z.object({
  serviceUser: serviceUserSchema,
  weekPlanId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  compliance: weekComplianceSchema.nullable(),
  missedCount: z.number().int().min(0),
  refusedCount: z.number().int().min(0),
  reviewHintCount: z.number().int().min(0),
  activityBreakdown: z.array(activityBreakdownItemSchema),
  dailyMinutes: dailyDeliveredMinutesSchema,
});

/**
 * The manager summary for one week across every active service user. `settings` are the
 * 🟢/🟡/🔴 thresholds that produced the statuses, so the UI can show which bands applied.
 * Backend-owned aggregation — the client displays these, never derives them.
 */
export const weeklySummarySchema = z.object({
  weekCommencing: isoDate,
  settings: complianceSettingsSchema,
  rows: z.array(weeklySummaryRowSchema),
});

export type ActivityBreakdownItem = z.infer<typeof activityBreakdownItemSchema>;
export type DailyDeliveredMinutes = z.infer<typeof dailyDeliveredMinutesSchema>;
export type WeeklySummaryRow = z.infer<typeof weeklySummaryRowSchema>;
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
