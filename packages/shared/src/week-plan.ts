import { z } from 'zod';

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
  weekCommencing: z.string(),
  notes: z.string().nullable().optional(),
});

export type WeekPlan = z.infer<typeof weekPlanSchema>;
export type WeekPlanCreate = z.infer<typeof weekPlanCreateSchema>;
