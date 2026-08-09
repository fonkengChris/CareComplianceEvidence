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

/**
 * The entities whose tracked fields are audited (Phase 9). Shared so the read API can
 * validate an `?entityType=` filter and the write layer tags rows from the same tuple —
 * neither side can drift into an unknown string.
 */
export const AUDIT_ENTITY_TYPES = ['DAY_ENTRY', 'SERVICE_USER'] as const;
export const auditEntityTypeSchema = z.enum(AUDIT_ENTITY_TYPES);
export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>;

/**
 * Read model for the audit history view: the raw row enriched server-side with the actor's
 * name (resolved from `userId`, null once the user is gone) and a human-readable label for
 * the changed entity (e.g. a service user's name, or "<service user> — MON"). Purely
 * derived for display — the underlying row stays append-only.
 */
export const auditLogViewSchema = auditLogSchema.extend({
  actorName: z.string().nullable(),
  entityLabel: z.string().nullable(),
});

export type AuditLogView = z.infer<typeof auditLogViewSchema>;
