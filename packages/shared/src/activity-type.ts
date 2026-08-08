import { z } from 'zod';

/**
 * A standardised, admin-maintained activity. Day entries always reference one of
 * these by id (never free-typed) for reporting consistency. Retired activities
 * are soft-disabled via `active` rather than deleted, to preserve historical
 * references.
 */
export const activityTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const activityTypeCreateSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
});

export type ActivityType = z.infer<typeof activityTypeSchema>;
export type ActivityTypeCreate = z.infer<typeof activityTypeCreateSchema>;
