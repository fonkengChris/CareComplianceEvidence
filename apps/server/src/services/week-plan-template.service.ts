import {
  type DayEntryInput,
  type TemplateDayEntry,
  type WeekPlanTemplate,
  type WeekPlanTemplateWithEntries,
  type WeekPlanWithEntries,
  WEEKDAYS,
  templateDayEntrySchema,
  weekPlanTemplateSchema,
} from '@care/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { dayEntries, templateDayEntries, weekPlanTemplates, weekPlans } from '../db/schema';
import { type ConflictResult, buildEntryInserts, getWeekPlan } from './week-plan.service';

/**
 * Week-plan-template service — the only layer that touches the DB for a service user's
 * reusable planner (CLAUDE.md layering). A template is planning-only (activity /
 * description / allocated minutes per day+line); `timeSpent`/`outcome`/`comment` never
 * live here — they are staff-recorded on the generated week. One template per service
 * user, so reads are get-or-create and idempotent.
 *
 * `generateWeekFromTemplate` mirrors "Duplicate Previous Week" but sources the template:
 * it can collide with the `week_plans_service_user_week` unique constraint, so it returns
 * a typed `conflict` result for the controller to map to 409.
 */

type TemplateRow = typeof weekPlanTemplates.$inferSelect;
type TemplateEntryRow = typeof templateDayEntries.$inferSelect;

/** Map a template row to the public shared shape (timestamps → ISO strings). */
export function toPublicTemplate(row: TemplateRow): WeekPlanTemplate {
  return weekPlanTemplateSchema.parse({
    id: row.id,
    serviceUserId: row.serviceUserId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Map a template day-entry row to the public shared shape. Durations are integer minutes. */
export function toPublicTemplateEntry(row: TemplateEntryRow): TemplateDayEntry {
  return templateDayEntrySchema.parse({
    id: row.id,
    templateId: row.templateId,
    day: row.day,
    lineNumber: row.lineNumber,
    activityTypeId: row.activityTypeId,
    description: row.description,
    timeAllocated: row.timeAllocated,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Deterministic planner order: Mon→Sun (enum order), then line number within a day. */
function sortTemplateEntries(entries: TemplateDayEntry[]): TemplateDayEntry[] {
  return [...entries].sort(
    (a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) || a.lineNumber - b.lineNumber,
  );
}

/**
 * Build the insert rows for a set of planner-grid inputs against a template. Pure so it
 * can be unit-tested: `templateId` is injected; only plan-time fields are carried.
 */
export function buildTemplateInserts(
  templateId: string,
  entries: DayEntryInput[],
): (typeof templateDayEntries.$inferInsert)[] {
  return entries.map((e) => ({
    templateId,
    day: e.day,
    lineNumber: e.lineNumber,
    activityTypeId: e.activityTypeId ?? null,
    description: e.description ?? null,
    timeAllocated: e.timeAllocated ?? null,
  }));
}

/** Assemble the public template-with-entries shape (entries in planner order). */
function toTemplateWithEntries(
  templateRow: TemplateRow,
  entryRows: TemplateEntryRow[],
): WeekPlanTemplateWithEntries {
  return {
    ...toPublicTemplate(templateRow),
    dayEntries: sortTemplateEntries(entryRows.map(toPublicTemplateEntry)),
  };
}

/** Find the template row for a service user, or create an empty one. Idempotent. */
async function ensureTemplateRow(serviceUserId: string): Promise<TemplateRow> {
  const [existing] = await db
    .select()
    .from(weekPlanTemplates)
    .where(eq(weekPlanTemplates.serviceUserId, serviceUserId))
    .limit(1);
  if (existing) return existing;

  // A concurrent create could race the unique constraint; on conflict re-read the winner.
  try {
    const [created] = await db.insert(weekPlanTemplates).values({ serviceUserId }).returning();
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [row] = await db
        .select()
        .from(weekPlanTemplates)
        .where(eq(weekPlanTemplates.serviceUserId, serviceUserId))
        .limit(1);
      return row;
    }
    throw err;
  }
}

/** The template for a service user (created empty on first access) with its lines. */
export async function getOrCreateTemplate(
  serviceUserId: string,
): Promise<WeekPlanTemplateWithEntries> {
  const templateRow = await ensureTemplateRow(serviceUserId);
  const entryRows = await db
    .select()
    .from(templateDayEntries)
    .where(eq(templateDayEntries.templateId, templateRow.id));
  return toTemplateWithEntries(templateRow, entryRows);
}

/**
 * Bulk-replace a template's lines in one transaction: delete the existing set and insert
 * the new one. The template is created if it does not exist yet. Returns the refreshed
 * template with its lines.
 */
export async function replaceTemplateEntries(
  serviceUserId: string,
  entries: DayEntryInput[],
): Promise<WeekPlanTemplateWithEntries> {
  const templateRow = await ensureTemplateRow(serviceUserId);
  await db.transaction(async (tx) => {
    await tx.delete(templateDayEntries).where(eq(templateDayEntries.templateId, templateRow.id));
    const inserts = buildTemplateInserts(templateRow.id, entries);
    if (inserts.length > 0) await tx.insert(templateDayEntries).values(inserts);
    await tx
      .update(weekPlanTemplates)
      .set({ updatedAt: new Date() })
      .where(eq(weekPlanTemplates.id, templateRow.id));
  });
  return getOrCreateTemplate(serviceUserId);
}

/**
 * Generate a new week plan for a service user from its template: create the plan for
 * `weekCommencing` and copy every template line into `day_entries` (allocated time and
 * activity carried; timeSpent/outcome left null for staff). Returns a `conflict` result
 * when a plan for that week already exists (one plan per service user per week).
 */
export async function generateWeekFromTemplate(
  serviceUserId: string,
  weekCommencing: string,
): Promise<ConflictResult<WeekPlanWithEntries>> {
  try {
    const createdId = await db.transaction(async (tx) => {
      const templateEntryRows = await tx
        .select()
        .from(templateDayEntries)
        .innerJoin(weekPlanTemplates, eq(weekPlanTemplates.id, templateDayEntries.templateId))
        .where(eq(weekPlanTemplates.serviceUserId, serviceUserId));

      const [created] = await tx
        .insert(weekPlans)
        .values({ serviceUserId, weekCommencing, notes: null })
        .returning();

      const inserts = buildEntryInserts(
        created.id,
        templateEntryRows.map((r) => ({
          day: r.template_day_entries.day,
          lineNumber: r.template_day_entries.lineNumber,
          activityTypeId: r.template_day_entries.activityTypeId,
          description: r.template_day_entries.description,
          timeAllocated: r.template_day_entries.timeAllocated,
        })),
      );
      if (inserts.length > 0) await tx.insert(dayEntries).values(inserts);
      return created.id;
    });
    return { ok: true, value: (await getWeekPlan(createdId)) as WeekPlanWithEntries };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'conflict' };
    throw err;
  }
}

export type SaveAsTemplateResult =
  { ok: true; value: WeekPlanTemplateWithEntries } | { ok: false; reason: 'not_found' };

/**
 * Snapshot an existing week plan's planned lines into the service user's template
 * (overwriting whatever the template held). Only plan-time fields are copied — the
 * template never carries staff recordings. `not_found` if the plan id is unknown.
 */
export async function saveWeekAsTemplate(weekPlanId: string): Promise<SaveAsTemplateResult> {
  const [plan] = await db
    .select({ serviceUserId: weekPlans.serviceUserId })
    .from(weekPlans)
    .where(eq(weekPlans.id, weekPlanId))
    .limit(1);
  if (!plan) return { ok: false, reason: 'not_found' };

  const entryRows = await db
    .select()
    .from(dayEntries)
    .where(eq(dayEntries.weekPlanId, weekPlanId))
    .orderBy(asc(dayEntries.day), asc(dayEntries.lineNumber));

  const value = await replaceTemplateEntries(
    plan.serviceUserId,
    entryRows.map((e) => ({
      day: e.day,
      lineNumber: e.lineNumber,
      activityTypeId: e.activityTypeId,
      description: e.description,
      timeAllocated: e.timeAllocated,
    })),
  );
  return { ok: true, value };
}
