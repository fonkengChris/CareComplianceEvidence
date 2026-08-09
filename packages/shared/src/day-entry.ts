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
  // `description` is the manager's planned text; `comment` is the staff's
  // "what happened" note recorded on the shift (Phase 5). Kept separate so one
  // never overwrites the other.
  description: z.string().nullable(),
  comment: z.string().nullable(),
  timeAllocated: z.number().int().min(0).nullable(),
  timeSpent: z.number().int().min(0).nullable(),
  outcome: outcomeSchema.nullable(),
  // Derived, read-only: a keyword scan of `comment` (see review-hint.ts) that
  // nudges a manager to review the entry. Computed server-side on read, never
  // persisted, and never a status — `outcome` is the authoritative signal.
  reviewHint: z.boolean(),
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

/**
 * A single planner-grid row as sent by the manager UI. `weekPlanId` is omitted —
 * the server injects it from the route param on a bulk replace, so a row can never
 * be assigned to the wrong plan. Only plan-time fields are accepted here;
 * `timeSpent`/`outcome` are staff-recorded later (Phase 5).
 */
export const dayEntryInputSchema = dayEntryCreateSchema.omit({ weekPlanId: true });

/** Body for the bulk-replace endpoint: the full set of entries for one plan. */
export const dayEntriesReplaceSchema = z.object({
  entries: z.array(dayEntryInputSchema),
});

/**
 * Body for the staff recording endpoint (Phase 5). Staff may write ONLY time
 * spent, outcome, and comment on an already-planned line — never the activity,
 * allocated time, or line position. `comment` is optional; time/outcome are
 * nullable so a partially-recorded line is valid.
 */
export const dayEntryRecordSchema = z.object({
  timeSpent: z.number().int().min(0).nullable(),
  outcome: outcomeSchema.nullable(),
  comment: z.string().nullable().optional(),
});

/**
 * Body for a staff-created ad-hoc line (Phase 5): support that happened but was
 * never planned. The activity is required (always an FK, never free-typed);
 * `lineNumber` and `timeAllocated` are server-controlled — allocated time stays
 * null because unplanned work was never allocated.
 */
export const dayEntryStaffCreateSchema = z.object({
  day: weekdaySchema,
  activityTypeId: z.string().uuid(),
  timeSpent: z.number().int().min(0).nullable(),
  outcome: outcomeSchema.nullable(),
  comment: z.string().nullable().optional(),
});

export type DayEntry = z.infer<typeof dayEntrySchema>;
export type DayEntryCreate = z.infer<typeof dayEntryCreateSchema>;
export type DayEntryInput = z.infer<typeof dayEntryInputSchema>;
export type DayEntriesReplace = z.infer<typeof dayEntriesReplaceSchema>;
export type DayEntryRecord = z.infer<typeof dayEntryRecordSchema>;
export type DayEntryStaffCreate = z.infer<typeof dayEntryStaffCreateSchema>;
