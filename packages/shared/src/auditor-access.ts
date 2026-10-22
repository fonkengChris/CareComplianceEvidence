import { z } from 'zod';

/**
 * Auditor access. For GDPR, an AUDITOR never sees which service users exist in the system:
 * a MANAGER chooses the service users an auditor may audit (on the auditor's user form), and
 * the auditor's reports are scoped server-side to exactly those. Stored as APPROVED rows in
 * `auditor_access_requests`; removing a service user from the set revokes the grant (kept as
 * REVOKED history, and every change is on the audit trail).
 */

/** The service users an auditor is assigned to audit — read and replaced as a whole set. */
export const auditorServiceUsersSchema = z.object({
  serviceUserIds: z.array(z.string().uuid()).max(500),
});

export type AuditorServiceUsers = z.infer<typeof auditorServiceUsersSchema>;
