import type { Request, Response } from 'express';
import * as reportService from '../services/report.service';

/**
 * Report controller (Phase 8): HTTP glue only (CLAUDE.md layering). Returns the report DATA a
 * client renders into a PDF — for one week plan, for one service user over a longer period, or
 * the whole-period overview across service users. Role (MANAGER/AUDITOR) is enforced by route
 * middleware.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The reporting range is capped at a year (a little over 52 weeks) to bound query/PDF size. */
const MAX_WEEKS = 53;

export async function getWeekPlanReport(req: Request, res: Response): Promise<void> {
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
  res.json(await reportService.getPeriodSummary(range.from, range.to));
}
