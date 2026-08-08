import { z } from 'zod';
import { outcomeSchema, weekdaySchema } from './enums';

/**
 * One planned/recorded line within a week plan. `~4 lines/day` is only a seeded
 * default — the schema imposes no fixed count, so `lineNumber` is just ordering
 * within a `(weekPlanId, day)`.
 *
 * Durations are integer MINUTES. `activityTypeId`, `timeSpent` and `outcome` are
 * nullable at plan time: a blank line can be added before an activity is chosen,
 * and time/outcome are recorded later by staff (Phase 5). Activities are always
 * an FK into `ActivityType`, never free-typed.
 */
export const dayEntrySchema = z.object({
  id: z.string().uuid(),
  weekPlanId: z.string().uuid(),
  day: weekdaySchema,
  lineNumber: z.number().int(),
  activityTypeId: z.string().uuid().nullable(),
  description: z.string().nullable(),
  timeAllocated: z.number().int().min(0).nullable(),
  timeSpent: z.number().int().min(0).nullable(),
  outcome: outcomeSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const dayEntryCreateSchema = z.object({
  weekPlanId: z.string().uuid(),
  day: weekdaySchema,
  lineNumber: z.number().int(),
  activityTypeId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  timeAllocated: z.number().int().min(0).nullable().optional(),
});

// TODO(Phase 5): dayEntryRecordSchema = { timeSpent, outcome } for the staff
// recording endpoint — staff may only write time spent + outcome (+ comment).

export type DayEntry = z.infer<typeof dayEntrySchema>;
export type DayEntryCreate = z.infer<typeof dayEntryCreateSchema>;
