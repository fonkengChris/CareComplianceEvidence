import { z } from 'zod';
import { accessRequestStatusSchema } from './enums';

/**
 * Auditor access requests. An AUDITOR sees reports only for the service users a manager has
 * approved them to audit: the auditor names the service users they intend to audit (optionally
 * with a reason), a manager approves or rejects each request, and can later revoke a grant.
 * Rejected/revoked rows are kept as history; at most one PENDING-or-APPROVED row exists per
 * (auditor, service user) pair. Enforced on the server — the report endpoints are scoped to
 * APPROVED rows.
 */

/** Body for an auditor requesting access to one or more service users. */
export const accessRequestCreateSchema = z.object({
  serviceUserIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().trim().max(500).optional(),
});

/** A request as shown to the auditor (their own) and to managers (everyone's). */
export const accessRequestSchema = z.object({
  id: z.string().uuid(),
  auditorId: z.string().uuid(),
  auditorName: z.string(),
  serviceUserId: z.string().uuid(),
  serviceUserName: z.string(),
  status: accessRequestStatusSchema,
  reason: z.string().nullable(),
  requestedAt: z.string(),
  decidedById: z.string().uuid().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
});

/**
 * A service user an auditor may request access to — identity only (no records), plus the
 * auditor's current open status for it (PENDING/APPROVED) or null when they could request it.
 */
export const requestableServiceUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  homeName: z.string().nullable(),
  status: accessRequestStatusSchema.nullable(),
});

export type AccessRequestCreate = z.infer<typeof accessRequestCreateSchema>;
export type AccessRequest = z.infer<typeof accessRequestSchema>;
export type RequestableServiceUser = z.infer<typeof requestableServiceUserSchema>;
