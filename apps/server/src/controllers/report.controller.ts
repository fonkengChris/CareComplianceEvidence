import type { Request, Response } from 'express';
import * as auditorAccessService from '../services/auditor-access.service';
import * as reportService from '../services/report.service';
import * as staffAssignmentService from '../services/staff-assignment.service';
import { serviceUserIdForPlan } from '../services/week-plan.service';

/**
 * Report controller (Phase 8): HTTP glue only (CLAUDE.md layering). Returns the report DATA a
 * client renders into a PDF — for one week plan, for one service user over a longer period, or
 * the whole-period overview across service users. Role (MANAGER/AUDITOR/KEY_WORKER) is enforced
 * by route middleware; an AUDITOR is further scoped here to the service users a manager approved
 * them to audit, and a KEY_WORKER to their own caseload (direct or home assignment) — anything else
 * reads as 404 (never reveal existence), and the overview lists only those.
 */

/**
 * Whether the caller may see a service user's reports: managers always, auditors if approved,
 * key workers if the service user is in their caseload.
 */
async function canSeeServiceUser(req: Request, serviceUserId: string): Promise<boolean> {
  const { role, sub } = req.user!;
  if (role === 'AUDITOR') return auditorAccessService.isAuditorApproved(sub, serviceUserId);
  if (role === 'KEY_WORKER') return staffAssignmentService.isStaffAssigned(sub, serviceUserId);
  return true;
}

/** The service-user ids the caller's overview is limited to, or undefined for "all" (managers). */
async function scopeFor(req: Request): Promise<string[] | undefined> {
  const { role, sub } = req.user!;
  if (role === 'AUDITOR') return auditorAccessService.approvedServiceUserIds(sub);
  if (role === 'KEY_WORKER') {
    return (await staffAssignmentService.listAssignmentsForStaff(sub)).map((su) => su.id);
  }
  return undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The reporting range is capped at a year (a little over 52 weeks) to bound query/PDF size. */
const MAX_WEEKS = 53;

export async function getWeekPlanReport(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'MANAGER') {
    const serviceUserId = await serviceUserIdForPlan(String(req.params.id));
    if (serviceUserId === null || !(await canSeeServiceUser(req, serviceUserId))) {
      res.status(404).json({ error: 'Week plan not found' });
      return;
    }
  }
  const found = await reportService.getWeekPlanReport(String(req.params.id));
  if (!found) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  res.json(found);
}

/**
 * Parse and validate the `from`/`to` range shared by the two period endpoints. Both default to
 * the current week's Monday when omitted; malformed dates, a reversed range, or a span over a
 * year are rejected as a 400. Returns the normalised Mondays or null (caller already responded).
 */
function parseRange(req: Request, res: Response): { from: string; to: string } | null {
  const rawFrom = req.query.from;
  const rawTo = req.query.to;
  const parse = (raw: unknown): string | undefined => {
    if (raw === undefined) return reportService.mondayOf(new Date().toISOString().slice(0, 10));
    if (typeof raw === 'string' && ISO_DATE.test(raw)) return raw;
    return undefined;
  };
  const from = parse(rawFrom);
  const to = parse(rawTo);
  if (from === undefined || to === undefined) {
    res.status(400).json({ error: 'Invalid from/to (expected YYYY-MM-DD)' });
    return null;
  }
  const fromMonday = reportService.mondayOf(from);
  const toMonday = reportService.mondayOf(to);
  if (fromMonday > toMonday) {
    res.status(400).json({ error: 'from must be on or before to' });
    return null;
  }
  if (reportService.weekCountBetween(fromMonday, toMonday) > MAX_WEEKS) {
    res.status(400).json({ error: 'Range too large (maximum one year)' });
    return null;
  }
  return { from: fromMonday, to: toMonday };
}

export async function getServiceUserPeriodReport(req: Request, res: Response): Promise<void> {
  const range = parseRange(req, res);
  if (!range) return;
  if (!(await canSeeServiceUser(req, String(req.params.id)))) {
    res.status(404).json({ error: 'Service user not found' });
    return;
  }
  const found = await reportService.getServiceUserPeriodReport(
    String(req.params.id),
    range.from,
    range.to,
  );
  if (!found) {
    res.status(404).json({ error: 'Service user not found' });
    return;
  }
  res.json(found);
}

export async function getPeriodSummary(req: Request, res: Response): Promise<void> {
  const range = parseRange(req, res);
  if (!range) return;
  res.json(await reportService.getPeriodSummary(range.from, range.to, await scopeFor(req)));
}
