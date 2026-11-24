import { type CheckTemplate, type CheckTemplateInput, checkTemplateSchema } from '@care/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { checkTemplates } from '../db/schema';
import { buildFieldChanges, recordAudit } from './audit.service';

/**
 * House-check templates — the only layer that touches `check_templates` (CLAUDE.md layering).
 * A template is a manager-maintained form definition plus one schedule shared by every home.
 * Edits bump `version`; submissions snapshot the definition, so history never changes.
 * Template changes are audited (entityType CHECK_TEMPLATE).
 */

type TemplateRow = typeof checkTemplates.$inferSelect;

export function toPublicTemplate(row: TemplateRow): CheckTemplate {
  return checkTemplateSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Every template (managers) or only the active ones (staff), by name. */
export async function listTemplates({
  activeOnly,
}: {
  activeOnly: boolean;
}): Promise<CheckTemplate[]> {
  const rows = await db
    .select()
    .from(checkTemplates)
    .where(activeOnly ? eq(checkTemplates.active, true) : undefined)
    .orderBy(asc(checkTemplates.name));
  return rows.map(toPublicTemplate);
}

export async function getTemplate(id: string): Promise<CheckTemplate | null> {
  const [row] = await db.select().from(checkTemplates).where(eq(checkTemplates.id, id)).limit(1);
  return row ? toPublicTemplate(row) : null;
}

export type TemplateWriteResult =
  { ok: true; value: CheckTemplate } | { ok: false; reason: 'not_found' | 'duplicate_name' };

function columnsFrom(input: CheckTemplateInput) {
  return {
    name: input.name,
    scheduleKind: input.scheduleKind,
    // Days are meaningless for a daily check; store none so the row reads unambiguously.
    scheduleDays: input.scheduleKind === 'DAILY' ? [] : input.scheduleDays,
    dueByTime: input.dueByTime ?? null,
    definition: input.definition,
  };
}

/** Summarise the schedule for the audit trail, e.g. "WEEKLY MON,THU by 12:00". */
function scheduleText(row: Pick<TemplateRow, 'scheduleKind' | 'scheduleDays' | 'dueByTime'>) {
  const days = row.scheduleKind === 'WEEKLY' ? ` ${row.scheduleDays.join(',')}` : '';
  const by = row.dueByTime ? ` by ${row.dueByTime}` : '';
  return `${row.scheduleKind}${days}${by}`;
}

export async function createTemplate(
  input: CheckTemplateInput,
  actorUserId: string,
): Promise<TemplateWriteResult> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(checkTemplates).values(columnsFrom(input)).returning();
      await recordAudit(tx, [
        {
          userId: actorUserId,
          action: 'CREATE',
          entityType: 'CHECK_TEMPLATE',
          entityId: row.id,
          field: 'name',
          toValue: row.name,
        },
      ]);
      return { ok: true as const, value: toPublicTemplate(row) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate_name' };
    throw err;
  }
}

export async function updateTemplate(
  id: string,
  input: CheckTemplateInput,
  actorUserId: string,
): Promise<TemplateWriteResult> {
  try {
    return await db.transaction(async (tx): Promise<TemplateWriteResult> => {
      const [before] = await tx.select().from(checkTemplates).where(eq(checkTemplates.id, id));
      if (!before) return { ok: false, reason: 'not_found' };
      const [row] = await tx
        .update(checkTemplates)
        .set({
          ...columnsFrom(input),
          version: sql`${checkTemplates.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(checkTemplates.id, id))
        .returning();
      const changes = buildFieldChanges(
        {
          name: before.name,
          schedule: scheduleText(before),
          definition: JSON.stringify(before.definition),
        },
        { name: row.name, schedule: scheduleText(row), definition: JSON.stringify(row.definition) },
        ['name', 'schedule', 'definition'],
      ).map((c) =>
        // The full form is too large to be useful in the trail — record the version bump.
        c.field === 'definition'
          ? { ...c, fromValue: `v${before.version}`, toValue: `v${row.version}` }
          : c,
      );
      await recordAudit(
        tx,
        changes.map((c) => ({
          userId: actorUserId,
          action: 'UPDATE',
          entityType: 'CHECK_TEMPLATE' as const,
          entityId: id,
          ...c,
        })),
      );
      return { ok: true, value: toPublicTemplate(row) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate_name' };
    throw err;
  }
}

/** Retire or restore a template. Retired templates stop appearing as due; history stays. */
export async function setTemplateActive(
  id: string,
  active: boolean,
  actorUserId: string,
): Promise<CheckTemplate | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(checkTemplates).where(eq(checkTemplates.id, id));
    if (!before) return null;
    const [row] = await tx
      .update(checkTemplates)
      .set({ active, updatedAt: new Date() })
      .where(eq(checkTemplates.id, id))
      .returning();
    if (before.active !== active) {
      await recordAudit(tx, [
        {
          userId: actorUserId,
          action: 'UPDATE',
          entityType: 'CHECK_TEMPLATE',
          entityId: id,
          field: 'active',
          fromValue: String(before.active),
          toValue: String(active),
        },
      ]);
    }
    return toPublicTemplate(row);
  });
}
