import type { Request, Response } from 'express';
import * as summaryService from '../services/summary.service';

/**
 * Summary controller (Phase 7): HTTP glue only (CLAUDE.md layering). `weekCommencing` is an
 * optional query param defaulting to the current week's Monday; a malformed value is a 400.
 * Role (MANAGER/AUDITOR) is enforced by route middleware.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getWeekly(req: Request, res: Response): Promise<void> {
  const raw = req.query.weekCommencing;
  let week: string;
  if (raw === undefined) {
    week = summaryService.currentWeekCommencing();
  } else if (typeof raw === 'string' && ISO_DATE.test(raw)) {
    week = raw;
  } else {
    res.status(400).json({ error: 'Invalid weekCommencing (expected YYYY-MM-DD)' });
    return;
  }
  res.json(await summaryService.getWeeklySummary(week));
}
