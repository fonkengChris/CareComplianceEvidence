import { z } from 'zod';

/**
 * A person receiving 1-to-1 support. `contractedHours` is a contract term in
 * HOURS (decimal allowed), compared against delivered minutes in Phase 6 — it is
 * never row-summed, so it stays hours rather than the minutes used for durations.
 *
 * NOTE: the DB column is `numeric`, which Drizzle returns as a JS string; the
 * service layer coerces it to a number so this API contract stays `z.number()`.
 */
export const serviceUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().nullable(),
  contractedHours: z.number().min(0),
  // The home this service user belongs to, or null if unassigned. Staff assigned to
  // the home gain access to this service user (group-based supervision).
  homeId: z.string().uuid().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const serviceUserCreateSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  contractedHours: z.number().min(0),
  homeId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

/**
 * PUT payload: every create field is optional so a manager can patch just what
 * changed. `.partial()` keeps the same validation rules on any field that IS sent.
 */
export const serviceUserUpdateSchema = serviceUserCreateSchema.partial();

export type ServiceUser = z.infer<typeof serviceUserSchema>;
export type ServiceUserCreate = z.infer<typeof serviceUserCreateSchema>;
export type ServiceUserUpdate = z.infer<typeof serviceUserUpdateSchema>;
