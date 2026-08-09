import { z } from 'zod';
import { serviceUserSchema } from './service-user';

/**
 * The set of service users a staff member currently supervises (Phase 5). An
 * assignment is just the `(staffId, serviceUserId)` pair; a manager grows or
 * shrinks a staff member's supervision group by adding/removing rows. Staff can
 * view and record against the week plans of the service users in their group,
 * and only those.
 */
export const staffAssignmentSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  serviceUserId: z.string().uuid(),
  createdAt: z.string(),
});

/** Body for a manager assigning a staff member to a service user. */
export const staffAssignmentCreateSchema = z.object({
  staffId: z.string().uuid(),
  serviceUserId: z.string().uuid(),
});

/**
 * One entry in a staff member's dashboard: a supervised service user. The staff
 * recording UI lists these and links into each service user's current week plan.
 */
export const assignedServiceUserSchema = serviceUserSchema;

export type StaffAssignment = z.infer<typeof staffAssignmentSchema>;
export type StaffAssignmentCreate = z.infer<typeof staffAssignmentCreateSchema>;
export type AssignedServiceUser = z.infer<typeof assignedServiceUserSchema>;
