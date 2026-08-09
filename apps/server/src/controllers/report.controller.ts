import type { Request, Response } from 'express';
import * as reportService from '../services/report.service';

/**
 * Report controller (Phase 8): HTTP glue only (CLAUDE.md layering). Returns the `ReportData` a
 * client renders into a commissioner PDF for one week plan, or 404 if the plan id is unknown.
 * Role (MANAGER/AUDITOR) is enforced by route middleware.
 */

export async function getWeekPlanReport(req: Request, res: Response): Promise<void> {
  const found = await reportService.getWeekPlanReport(String(req.params.id));
  if (!found) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  res.json(found);
}
