import { z } from 'zod';

/**
 * Staff → home membership. Assigning a staff member to a home grants them access to
 * every (active) service user in that home, in addition to any direct per-service-user
 * assignments. A manager grows/shrinks a staff member's reach by adding/removing rows.
 */
export const homeAssignmentSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  homeId: z.string().uuid(),
  createdAt: z.string(),
});

/** Body for a manager assigning a staff member to a home. */
export const homeAssignmentCreateSchema = z.object({
  staffId: z.string().uuid(),
  homeId: z.string().uuid(),
});

export type HomeAssignment = z.infer<typeof homeAssignmentSchema>;
export type HomeAssignmentCreate = z.infer<typeof homeAssignmentCreateSchema>;
