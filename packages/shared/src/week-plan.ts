import { z } from 'zod';
import { weekComplianceSchema } from './compliance';
import { dayEntrySchema } from './day-entry';

/** A calendar date with no time-of-day, e.g. `2026-08-17`. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

/**
 * A single week of planned support for a service user. `weekCommencing` is the
 * calendar Monday (a date, no time-of-day). One plan per service user per week is
 * enforced by a unique DB constraint.
 */
export const weekPlanSchema = z.object({
  id: z.string().uuid(),
  serviceUserId: z.string().uuid(),
  weekCommencing: z.string(), // ISO date (YYYY-MM-DD)
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const weekPlanCreateSchema = z.object({
  serviceUserId: z.string().uuid(),
  weekCommencing: isoDate,
  notes: z.string().nullable().optional(),
});

/**
 * Editable fields of a plan. The `serviceUserId` is intentionally omitted — a plan
 * is never re-parented to another service user (that would orphan its history).
 */
export const weekPlanUpdateSchema = weekPlanCreateSchema.omit({ serviceUserId: true }).partial();

/** Body for "Duplicate Previous Week": just the target week to copy into. */
export const weekPlanDuplicateSchema = z.object({
  weekCommencing: isoDate,
});

/**
 * GET-one / planner response: the plan with its day-entry lines attached, plus the
 * backend-computed `compliance` block (delivered/remaining minutes + 🟢/🟡/🔴 status).
 * Embedding compliance here means every plan read/write path carries a fresh figure,
 * so it recalculates on every `DayEntry` write without a separate call.
 */
export const weekPlanWithEntriesSchema = weekPlanSchema.extend({
  dayEntries: z.array(dayEntrySchema),
  compliance: weekComplianceSchema,
});

export type WeekPlan = z.infer<typeof weekPlanSchema>;
export type WeekPlanCreate = z.infer<typeof weekPlanCreateSchema>;
export type WeekPlanUpdate = z.infer<typeof weekPlanUpdateSchema>;
export type WeekPlanDuplicate = z.infer<typeof weekPlanDuplicateSchema>;
export type WeekPlanWithEntries = z.infer<typeof weekPlanWithEntriesSchema>;
