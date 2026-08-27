import { generateWeekFromTemplateSchema, templateEntriesReplaceSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as templateService from '../services/week-plan-template.service';

/**
 * Week-plan-template controllers: HTTP glue only — validate input, call the service, map
 * results to status codes (CLAUDE.md layering). All routes are MANAGER-only, enforced by
 * route middleware. Generating a week that already exists is a `conflict` → 409.
 */

/** GET /:serviceUserId — the service user's template (created empty on first access). */
export async function getForServiceUser(req: Request, res: Response): Promise<void> {
  const template = await templateService.getOrCreateTemplate(String(req.params.serviceUserId));
  res.json(template);
}

/** PUT /:serviceUserId/day-entries — bulk-replace the template's planned lines. */
export async function replaceEntries(req: Request, res: Response): Promise<void> {
  const parsed = templateEntriesReplaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid template entries' });
    return;
  }
  const template = await templateService.replaceTemplateEntries(
    String(req.params.serviceUserId),
    parsed.data.entries,
  );
  res.json(template);
}

/** POST /:serviceUserId/generate — create a new week plan from the template. */
export async function generate(req: Request, res: Response): Promise<void> {
  const parsed = generateWeekFromTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid target week' });
    return;
  }
  const result = await templateService.generateWeekFromTemplate(
    String(req.params.serviceUserId),
    parsed.data.weekCommencing,
  );
  if (!result.ok) {
    res.status(409).json({ error: 'A plan for this week already exists' });
    return;
  }
  res.status(201).json(result.value);
}

/** POST /from-week/:weekPlanId — snapshot an existing week plan into its template. */
export async function saveFromWeek(req: Request, res: Response): Promise<void> {
  const result = await templateService.saveWeekAsTemplate(String(req.params.weekPlanId));
  if (!result.ok) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  res.json(result.value);
}
