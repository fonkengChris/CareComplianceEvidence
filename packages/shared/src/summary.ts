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
 * One row of the manager weekly summary: an active service user and, for the selected
 * week, their plan status at a glance. `weekPlanId`/`compliance` are null when no plan
 * exists for that week (nothing to drill into yet). `missed`/`refused` count day-entry
 * outcomes; `reviewHint` counts lines whose comment tripped the keyword scan — a review
 * nudge, never a status (CLAUDE.md). `activityBreakdown` is per service user.
 */
export const weeklySummaryRowSchema = z.object({
  serviceUser: serviceUserSchema,
  weekPlanId: z.string().uuid().nullable(),
  compliance: weekComplianceSchema.nullable(),
  missedCount: z.number().int().min(0),
  refusedCount: z.number().int().min(0),
  reviewHintCount: z.number().int().min(0),
  activityBreakdown: z.array(activityBreakdownItemSchema),
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
export type WeeklySummaryRow = z.infer<typeof weeklySummaryRowSchema>;
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
