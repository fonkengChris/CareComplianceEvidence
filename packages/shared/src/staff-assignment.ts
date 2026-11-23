import { z } from 'zod';
import { serviceUserSchema } from './service-user';
import { userSchema } from './user';

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
  endsAt: z.string(),
  createdAt: z.string(),
});

/**
 * Body for a manager assigning a staff member to a service user. Direct links are time-limited
 * (GDPR minimisation): `endsAt` is required and must be in the future; re-posting an existing
 * pair renews it to the new date.
 */
export const staffAssignmentCreateSchema = z.object({
  staffId: z.string().uuid(),
  serviceUserId: z.string().uuid(),
  endsAt: z
    .string()
    .datetime({ offset: true })
    .refine((v) => new Date(v).getTime() > Date.now(), 'The end date must be in the future'),
});

/** A staff member directly assigned to a service user, with when that link lapses. */
export const assignedStaffSchema = userSchema.extend({
  assignmentEndsAt: z.string(),
});

/**
 * One entry in a staff member's dashboard: a supervised service user. The staff
 * recording UI lists these and links into each service user's current week plan.
 */
export const assignedServiceUserSchema = serviceUserSchema;

export type StaffAssignment = z.infer<typeof staffAssignmentSchema>;
export type StaffAssignmentCreate = z.infer<typeof staffAssignmentCreateSchema>;
export type AssignedStaff = z.infer<typeof assignedStaffSchema>;
export type AssignedServiceUser = z.infer<typeof assignedServiceUserSchema>;
