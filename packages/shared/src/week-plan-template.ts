import { z } from 'zod';
import { dayEntryInputSchema } from './day-entry';
import { weekdaySchema } from './enums';

/** A calendar date with no time-of-day, e.g. `2026-08-17`. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

/**
 * A service user's reusable weekly planner: the canonical week a manager maintains once
 * and generates each real `WeekPlan` from. One template per service user (unique DB
 * constraint). Planning-only — it has no `timeSpent`/`outcome`/`comment` (those are
 * staff-recorded on the generated week, never on the template).
 */
export const weekPlanTemplateSchema = z.object({
  id: z.string().uuid(),
  serviceUserId: z.string().uuid(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * One planned line of a template. Same plan-time shape as a `DayEntry` minus the
 * staff-recorded columns; `activityTypeId` is an FK (never free-typed) and nullable so a
 * blank line can exist before an activity is chosen.
 */
export const templateDayEntrySchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  day: weekdaySchema,
  lineNumber: z.number().int(),
  activityTypeId: z.string().uuid().nullable(),
  description: z.string().nullable(),
  timeAllocated: z.number().int().min(0).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** GET response: the template with its planned lines attached (planner order). */
export const weekPlanTemplateWithEntriesSchema = weekPlanTemplateSchema.extend({
  dayEntries: z.array(templateDayEntrySchema),
});

/**
 * Body for the bulk-replace endpoint: the full set of template lines. Reuses
 * `dayEntryInputSchema` — a template row carries exactly the plan-time fields
 * (day, lineNumber, activityTypeId, description, timeAllocated).
 */
export const templateEntriesReplaceSchema = z.object({
  entries: z.array(dayEntryInputSchema),
});

/** Body for "Generate week from template": just the target week to create. */
export const generateWeekFromTemplateSchema = z.object({
  weekCommencing: isoDate,
});

export type WeekPlanTemplate = z.infer<typeof weekPlanTemplateSchema>;
export type TemplateDayEntry = z.infer<typeof templateDayEntrySchema>;
export type WeekPlanTemplateWithEntries = z.infer<typeof weekPlanTemplateWithEntriesSchema>;
export type TemplateEntriesReplace = z.infer<typeof templateEntriesReplaceSchema>;
export type GenerateWeekFromTemplate = z.infer<typeof generateWeekFromTemplateSchema>;
