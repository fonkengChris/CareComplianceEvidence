import { z } from 'zod';

/**
 * Append-only record of a tracked field change (who / what / from → to / when).
 * Written by the service layer on key mutations (Phase 9); read-only for managers
 * and auditors. There is deliberately no create/update schema exposed to clients —
 * audit rows are produced server-side and never edited or deleted.
 */
export const auditLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(), // actor; null once a user is deleted
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().uuid().nullable(),
  field: z.string().nullable(),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;
