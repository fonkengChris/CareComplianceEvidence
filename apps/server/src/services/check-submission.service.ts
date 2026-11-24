import {
  CHECK_OVERVIEW_DAYS,
  type CheckOccurrence,
  type CheckOverview,
  type CheckSubmission,
  type CheckSubmissionInput,
  type CheckWeekGrid,
  addDays,
  checkSubmissionSchema,
  countIssues,
  isLateAt,
  londonNow,
  occurrencesBetween,
  openOccurrence,
  validateAnswers,
} from '@care/shared';
import { and, asc, between, eq, getTableColumns, gte, inArray, or } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { checkSubmissions, checkTemplates, homes, users } from '../db/schema';
import { renderCheckPdf } from '../pdf/check-submission-document';
import { deleteObjectsQuietly, objectStore } from '../storage/object-store';
import { recordAudit } from './audit.service';
import {
  type TemplateRow,
  buildOverview,
  firstDueDate,
  key,
  toOccurrence,
} from './check-occurrence';

/**
 * House-check submissions — the only layer that touches `check_submissions` (CLAUDE.md
 * layering). A submission is one signed completion of a check occurrence at a home: answers are
 * validated against the template, the definition is snapshotted, and a PDF is rendered once and
 * stored (Cloudflare R2 when configured, else inline in Postgres — same split as photos).
 * Submissions are immutable: there is no edit or delete path. Statuses (due / missed / late) are
 * derived here from the schedule, never by the client.
 */

/** R2 object key for a submission's PDF, grouped by home so a bucket listing mirrors the data. */
export function checkPdfStorageKey(homeId: string, submissionId: string): string {
  return `house-checks/${homeId}/${submissionId}.pdf`;
}

/** Columns for status lookups — never the PDF bytes or the answers. */
const summaryColumns = {
  id: checkSubmissions.id,
  templateId: checkSubmissions.templateId,
  dueDate: checkSubmissions.dueDate,
  late: checkSubmissions.late,
  issueCount: checkSubmissions.issueCount,
  submittedByName: checkSubmissions.submittedByName,
  submittedAt: checkSubmissions.submittedAt,
};

/**
 * The checks that can be completed at a home right now: each active template's open
 * occurrence, with its status (DUE / OVERDUE, or DONE / LATE once submitted).
 */
export async function listDueForHome(
  homeId: string,
  now: Date = new Date(),
): Promise<CheckOccurrence[]> {
  const today = londonNow(now).date;
  const templates = await db
    .select()
    .from(checkTemplates)
    .where(eq(checkTemplates.active, true))
    .orderBy(asc(checkTemplates.name));
  const open = templates
    .map((t) => ({ template: t, dueDate: openOccurrence(t, today) }))
    .filter(
      (o): o is { template: TemplateRow; dueDate: string } =>
        o.dueDate !== null && o.dueDate >= firstDueDate(o.template),
    );
  if (open.length === 0) return [];

  const submitted = await db
    .select(summaryColumns)
    .from(checkSubmissions)
    .where(
      and(
        eq(checkSubmissions.homeId, homeId),
        or(
          ...open.map((o) =>
            and(
              eq(checkSubmissions.templateId, o.template.id),
              eq(checkSubmissions.dueDate, o.dueDate),
            ),
          ),
        ),
      ),
    );
  const byKey = new Map(submitted.map((s) => [key(s.templateId, s.dueDate), s]));
  return open.map((o) =>
    toOccurrence(o.template, o.dueDate, byKey.get(key(o.template.id, o.dueDate)), now),
  );
}

/**
 * The manager grid for one Mon–Sun week at a home: every active template (plus any retired one
 * that has submissions that week) with each scheduled occurrence and its status.
 */
export async function weekGrid(
  homeId: string,
  weekCommencing: string,
  now: Date = new Date(),
): Promise<CheckWeekGrid> {
  const weekEnd = addDays(weekCommencing, 6);
  const submitted = await db
    .select(summaryColumns)
    .from(checkSubmissions)
    .where(
      and(
        eq(checkSubmissions.homeId, homeId),
        between(checkSubmissions.dueDate, weekCommencing, weekEnd),
      ),
    );
  const submittedTemplateIds = [...new Set(submitted.map((s) => s.templateId))];
  const templates = await db
    .select()
    .from(checkTemplates)
    .where(
      submittedTemplateIds.length > 0
        ? or(eq(checkTemplates.active, true), inArray(checkTemplates.id, submittedTemplateIds))
        : eq(checkTemplates.active, true),
    )
    .orderBy(asc(checkTemplates.name));

  const byKey = new Map(submitted.map((s) => [key(s.templateId, s.dueDate), s]));
  const rows = templates.map((t) => {
    // A retired template shows only what was actually submitted.
    const scheduled = t.active
      ? occurrencesBetween(t, weekCommencing, weekEnd).filter((d) => d >= firstDueDate(t))
      : [];
    const dates = new Set([
      ...scheduled,
      ...submitted.filter((s) => s.templateId === t.id).map((s) => s.dueDate),
    ]);
    return {
      templateId: t.id,
      templateName: t.name,
      occurrences: [...dates].sort().map((d) => toOccurrence(t, d, byKey.get(key(t.id, d)), now)),
    };
  });
  return { homeId, weekCommencing, rows };
}

/** The manager overview across every active home (see `buildOverview`). */
export async function overview(now: Date = new Date()): Promise<CheckOverview> {
  const since = addDays(londonNow(now).date, -CHECK_OVERVIEW_DAYS);
  const [homeRows, templates, submitted] = await Promise.all([
    db
      .select({ id: homes.id, name: homes.name })
      .from(homes)
      .where(eq(homes.active, true))
      .orderBy(asc(homes.name)),
    db.select().from(checkTemplates).orderBy(asc(checkTemplates.name)),
    db
      .select({ ...summaryColumns, homeId: checkSubmissions.homeId })
      .from(checkSubmissions)
      .where(gte(checkSubmissions.dueDate, since)),
  ]);
  return buildOverview(homeRows, templates, submitted, now);
}

export type SubmitResult =
  | { ok: true; value: CheckSubmission }
  | {
      ok: false;
      reason: 'template_not_found' | 'home_not_found' | 'not_open' | 'already_submitted';
    }
  | { ok: false; reason: 'invalid'; problems: string[] };

/**
 * Sign and store one occurrence of a check. Only the currently open occurrence can be submitted
 * (no back-filling missed checks, no completing future ones); a submission after the due day or
 * due-by time is recorded as late. The PDF is rendered and uploaded before the row is inserted
 * under a pre-chosen id; if the insert fails, the uploaded object is removed again.
 */
export async function submitCheck(
  input: CheckSubmissionInput,
  actorUserId: string,
  now: Date = new Date(),
): Promise<SubmitResult> {
  const [template] = await db
    .select()
    .from(checkTemplates)
    .where(and(eq(checkTemplates.id, input.templateId), eq(checkTemplates.active, true)))
    .limit(1);
  if (!template) return { ok: false, reason: 'template_not_found' };

  const [home] = await db
    .select({ name: homes.name })
    .from(homes)
    .where(and(eq(homes.id, input.homeId), eq(homes.active, true)))
    .limit(1);
  if (!home) return { ok: false, reason: 'home_not_found' };

  if (openOccurrence(template, londonNow(now).date) !== input.dueDate) {
    return { ok: false, reason: 'not_open' };
  }

  const problems = validateAnswers(template.definition, input.answers);
  if (problems.length > 0) return { ok: false, reason: 'invalid', problems };

  const [actor] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);
  const submittedByName = actor?.name ?? 'Unknown user';

  // Cheap pre-check so a double submit doesn't render and upload a PDF first; the unique
  // constraint still settles a race.
  const [existing] = await db
    .select({ id: checkSubmissions.id })
    .from(checkSubmissions)
    .where(
      and(
        eq(checkSubmissions.templateId, template.id),
        eq(checkSubmissions.homeId, input.homeId),
        eq(checkSubmissions.dueDate, input.dueDate),
      ),
    )
    .limit(1);
  if (existing) return { ok: false, reason: 'already_submitted' };

  const id = crypto.randomUUID();
  const issueCount = countIssues(template.definition, input.answers);
  const late = isLateAt(template, input.dueDate, now);
  const pdf = await renderCheckPdf({
    templateName: template.name,
    templateVersion: template.version,
    homeName: home.name,
    dueDate: input.dueDate,
    dueByTime: template.dueByTime,
    definition: template.definition,
    answers: input.answers,
    issueCount,
    late,
    submittedByName,
    submittedAt: now,
  });

  const storageKey = objectStore ? checkPdfStorageKey(input.homeId, id) : null;
  if (objectStore && storageKey) await objectStore.put(storageKey, pdf, 'application/pdf');

  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(checkSubmissions)
        .values({
          id,
          templateId: template.id,
          homeId: input.homeId,
          dueDate: input.dueDate,
          submittedById: actorUserId,
          submittedByName,
          submittedAt: now,
          templateName: template.name,
          templateVersion: template.version,
          definition: template.definition,
          answers: input.answers,
          issueCount,
          late,
          storageKey,
          pdf: storageKey ? null : pdf,
        })
        .returning();
      await recordAudit(tx, [
        {
          userId: actorUserId,
          action: 'CHECK_SUBMITTED',
          entityType: 'CHECK_SUBMISSION',
          entityId: id,
          field: late ? 'late' : null,
          toValue: issueCount > 0 ? `${issueCount} issue(s)` : null,
        },
      ]);
      return created;
    });
    return { ok: true, value: toPublicSubmission(row, home.name) };
  } catch (err) {
    if (storageKey) await deleteObjectsQuietly([storageKey]);
    if (isUniqueViolation(err)) return { ok: false, reason: 'already_submitted' };
    throw err;
  }
}

type SubmissionRow = typeof checkSubmissions.$inferSelect;

function toPublicSubmission(row: Omit<SubmissionRow, 'pdf'>, homeName: string): CheckSubmission {
  return checkSubmissionSchema.parse({
    ...row,
    homeName,
    submittedAt: row.submittedAt.toISOString(),
  });
}

/** Everything but the PDF bytes. */
const { pdf: _pdf, ...detailColumns } = getTableColumns(checkSubmissions);

/** A submission (without its PDF), or null if unknown. */
export async function getSubmission(id: string): Promise<CheckSubmission | null> {
  const [row] = await db
    .select({ ...detailColumns, homeName: homes.name })
    .from(checkSubmissions)
    .innerJoin(homes, eq(homes.id, checkSubmissions.homeId))
    .where(eq(checkSubmissions.id, id))
    .limit(1);
  return row ? toPublicSubmission(row, row.homeName) : null;
}

/** A submission's stored PDF plus a download file name, or null if unknown. */
export async function getSubmissionPdf(
  id: string,
): Promise<{ data: Buffer; fileName: string } | null> {
  const [row] = await db
    .select({
      pdf: checkSubmissions.pdf,
      storageKey: checkSubmissions.storageKey,
      templateName: checkSubmissions.templateName,
      dueDate: checkSubmissions.dueDate,
      homeName: homes.name,
    })
    .from(checkSubmissions)
    .innerJoin(homes, eq(homes.id, checkSubmissions.homeId))
    .where(eq(checkSubmissions.id, id))
    .limit(1);
  if (!row) return null;
  const fileName = checkPdfFileName(row.templateName, row.homeName, row.dueDate);
  if (row.pdf) return { data: row.pdf, fileName };
  if (!objectStore) {
    throw new Error(`Check submission ${id} is stored in R2 but R2 is not configured`);
  }
  const data = await objectStore.get(row.storageKey!);
  return data ? { data, fileName } : null;
}

/** e.g. "daily-checks-riverside-house-2026-11-24.pdf". */
export function checkPdfFileName(templateName: string, homeName: string, dueDate: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `${slug(templateName)}-${slug(homeName)}-${dueDate}.pdf`;
}
