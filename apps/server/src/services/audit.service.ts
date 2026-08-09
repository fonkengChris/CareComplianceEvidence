import { type AuditEntityType, type AuditLogView, auditLogViewSchema } from '@care/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, dayEntries, serviceUsers, users, weekPlans } from '../db/schema';

/**
 * Audit service (Phase 9) — the append-only trail of tracked field changes
 * (who / what / from → to / when). The write side (`buildFieldChanges` + `recordAudit`)
 * is called from the other services inside their transaction so an audit row is atomic
 * with the change it records; the read side powers the manager/auditor history view.
 * There is deliberately no update/delete path — the trail is write-once (CLAUDE.md).
 */

// The transaction handle passed into the callback of `db.transaction`. Typing against it
// (rather than `typeof db`) keeps `recordAudit` usable only from inside a transaction,
// which is where every caller invokes it.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One field-level change, values already stringified for the text columns. */
export type FieldChange = { field: string; fromValue: string | null; toValue: string | null };

/** A row to append to the trail: a `FieldChange` (or a bare create) plus its actor/context. */
export type AuditWrite = {
  userId: string | null;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  field?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
};

/** null/undefined → null; everything else → its string form (numeric columns arrive as strings). */
function toText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * Pure diff: for each tracked field, emit a change only where the stringified before/after
 * differ. Comparing on the text form matches what actually lands in the audit columns and
 * sidesteps number-vs-numeric-string noise. Unchanged writes yield `[]` → no audit rows.
 */
export function buildFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const fromValue = toText(before[field]);
    const toValue = toText(after[field]);
    if (fromValue !== toValue) changes.push({ field, fromValue, toValue });
  }
  return changes;
}

/** Append audit rows within the caller's transaction. A no-op for an empty change set. */
export async function recordAudit(tx: Tx, writes: AuditWrite[]): Promise<void> {
  if (writes.length === 0) return;
  await tx.insert(auditLogs).values(
    writes.map((w) => ({
      userId: w.userId,
      action: w.action,
      entityType: w.entityType,
      entityId: w.entityId,
      field: w.field ?? null,
      fromValue: w.fromValue ?? null,
      toValue: w.toValue ?? null,
    })),
  );
}

type AuditRow = typeof auditLogs.$inferSelect;

/**
 * Resolve a human-readable label per audited entity for a set of rows, in two batched
 * lookups: service users by name; day entries as "<service user> — <day>" via their plan.
 * Returns a map keyed `"<entityType>:<entityId>"`; missing entities simply have no label.
 */
async function resolveEntityLabels(rows: AuditRow[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  const serviceUserIds = rows
    .filter((r) => r.entityType === 'SERVICE_USER' && r.entityId)
    .map((r) => r.entityId as string);
  const dayEntryIds = rows
    .filter((r) => r.entityType === 'DAY_ENTRY' && r.entityId)
    .map((r) => r.entityId as string);

  if (serviceUserIds.length > 0) {
    const found = await db
      .select({ id: serviceUsers.id, name: serviceUsers.name })
      .from(serviceUsers)
      .where(inArray(serviceUsers.id, serviceUserIds));
    for (const su of found) labels.set(`SERVICE_USER:${su.id}`, su.name);
  }

  if (dayEntryIds.length > 0) {
    const found = await db
      .select({ id: dayEntries.id, day: dayEntries.day, name: serviceUsers.name })
      .from(dayEntries)
      .innerJoin(weekPlans, eq(weekPlans.id, dayEntries.weekPlanId))
      .innerJoin(serviceUsers, eq(serviceUsers.id, weekPlans.serviceUserId))
      .where(inArray(dayEntries.id, dayEntryIds));
    for (const e of found) labels.set(`DAY_ENTRY:${e.id}`, `${e.name} — ${e.day}`);
  }

  return labels;
}

/** Map raw rows to the public view, attaching resolved actor names and entity labels. */
async function toViews(
  rows: AuditRow[],
  actorNameById: Map<string, string>,
): Promise<AuditLogView[]> {
  const labels = await resolveEntityLabels(rows);
  return rows.map((row) =>
    auditLogViewSchema.parse({
      id: row.id,
      userId: row.userId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      field: row.field,
      fromValue: row.fromValue,
      toValue: row.toValue,
      createdAt: row.createdAt.toISOString(),
      actorName: row.userId ? (actorNameById.get(row.userId) ?? null) : null,
      entityLabel:
        row.entityType && row.entityId
          ? (labels.get(`${row.entityType}:${row.entityId}`) ?? null)
          : null,
    }),
  );
}

/** Resolve actor names for a set of rows in one lookup (left-join semantics, in JS). */
async function actorNamesFor(rows: AuditRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.userId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(found.map((u) => [u.id, u.name]));
}

/** The audit history feed: the most recent changes across the system, newest first. */
export async function listRecentAudit(limit = 100): Promise<AuditLogView[]> {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return toViews(rows, await actorNamesFor(rows));
}

/** The change history for one entity, newest first — uses the `(entityType, entityId)` index. */
export async function listAuditForEntity(
  entityType: AuditEntityType,
  entityId: string,
): Promise<AuditLogView[]> {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt));
  return toViews(rows, await actorNamesFor(rows));
}
