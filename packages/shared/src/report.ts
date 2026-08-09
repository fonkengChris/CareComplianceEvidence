import { z } from 'zod';
import { complianceSettingsSchema, weekComplianceSchema } from './compliance';
import { serviceUserSchema } from './service-user';
import { activityBreakdownItemSchema } from './summary';

/** A calendar date with no time-of-day, e.g. `2026-08-17`. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

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
  settings: complianceSettingsSchema,
  generatedAt: z.string().datetime(),
});

export type ReportData = z.infer<typeof reportDataSchema>;
