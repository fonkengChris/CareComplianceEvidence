import {
  CHECK_OVERVIEW_DAYS,
  type CheckOccurrence,
  type CheckOverview,
  addDays,
  londonNow,
  occurrenceStatus,
  occurrencesBetween,
  openOccurrence,
} from '@care/shared';
import type { checkTemplates } from '../db/schema';

/**
 * Pure occurrence helpers for house checks — no DB access, so they can be unit tested directly
 * (and stay clear of tests that mock the submission service). The service queries the rows and
 * hands them here to be turned into occurrences with server-derived statuses.
 */

export type TemplateRow = typeof checkTemplates.$inferSelect;

export type SubmissionSummary = {
  id: string;
  templateId: string;
  dueDate: string;
  late: boolean;
  issueCount: number;
  submittedByName: string;
  submittedAt: Date;
};

export function toOccurrence(
  template: TemplateRow,
  dueDate: string,
  submission: SubmissionSummary | undefined,
  now: Date,
): CheckOccurrence {
  return {
    templateId: template.id,
    templateName: template.name,
    dueDate,
    dueByTime: template.dueByTime,
    status: occurrenceStatus(template, dueDate, submission ?? null, now),
    submissionId: submission?.id ?? null,
    submittedByName: submission?.submittedByName ?? null,
    submittedAt: submission?.submittedAt.toISOString() ?? null,
    issueCount: submission?.issueCount ?? null,
  };
}

export const key = (templateId: string, dueDate: string) => `${templateId}:${dueDate}`;

/** A check is first due on the day it was created — earlier dates were never missed. */
export const firstDueDate = (template: TemplateRow) => londonNow(template.createdAt).date;

export type HomeSubmissionSummary = SubmissionSummary & { homeId: string };

/**
 * Pure core of the manager overview (exported for tests). Per home: `open` = checks still to do
 * right now (DUE / OVERDUE), `missed` = occurrences missed since `since`, `flagged` = submissions
 * since `since` that reported issues, newest first. `templates` must include retired ones so
 * their flagged submissions still resolve; only active templates fall due.
 */
export function buildOverview(
  homeRows: { id: string; name: string }[],
  templates: TemplateRow[],
  submitted: HomeSubmissionSummary[],
  now: Date = new Date(),
): CheckOverview {
  const today = londonNow(now).date;
  const since = addDays(today, -CHECK_OVERVIEW_DAYS);
  const yesterday = addDays(today, -1);
  const active = templates.filter((t) => t.active);
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const byKey = new Map(submitted.map((s) => [`${s.homeId}:${key(s.templateId, s.dueDate)}`, s]));

  const homesOut = homeRows.map((home) => {
    const find = (t: TemplateRow, d: string) => byKey.get(`${home.id}:${key(t.id, d)}`);
    const open = active.flatMap((t) => {
      const d = openOccurrence(t, today);
      if (d === null || d < firstDueDate(t)) return [];
      const o = toOccurrence(t, d, find(t, d), now);
      return o.status === 'DUE' || o.status === 'OVERDUE' ? [o] : [];
    });
    const missed = active.flatMap((t) => {
      const first = firstDueDate(t) > since ? firstDueDate(t) : since;
      return occurrencesBetween(t, first, yesterday)
        .map((d) => toOccurrence(t, d, find(t, d), now))
        .filter((o) => o.status === 'MISSED');
    });
    const flagged = submitted
      .filter((s) => s.homeId === home.id && s.issueCount > 0 && s.dueDate >= since)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
      .flatMap((s) => {
        const t = templateById.get(s.templateId);
        return t ? [toOccurrence(t, s.dueDate, s, now)] : [];
      });
    return { homeId: home.id, homeName: home.name, open, missed, flagged };
  });
  return { since, homes: homesOut };
}
