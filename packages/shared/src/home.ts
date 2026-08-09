import { z } from 'zod';

/**
 * A home (a residence or grouping) that service users belong to. Staff assigned to a
 * home gain access to every service user in it — the group-based supervision path that
 * complements the direct per-service-user `staff_assignments`. A service user belongs
 * to at most one home (nullable FK); a home is soft-deleted via `active`, never hard
 * deleted, so service-user history is preserved.
 */
export const homeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const homeCreateSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

/** PUT payload: every create field optional so a manager can patch just what changed. */
export const homeUpdateSchema = homeCreateSchema.partial();

export type Home = z.infer<typeof homeSchema>;
export type HomeCreate = z.infer<typeof homeCreateSchema>;
export type HomeUpdate = z.infer<typeof homeUpdateSchema>;
