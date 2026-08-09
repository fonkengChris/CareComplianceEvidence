import {
  dayEntriesReplaceSchema,
  dayEntryRecordSchema,
  dayEntryStaffCreateSchema,
  weekPlanCreateSchema,
  weekPlanDuplicateSchema,
  weekPlanUpdateSchema,
} from '@care/shared';
import type { Request, Response } from 'express';
import { isStaffAssigned } from '../services/staff-assignment.service';
import * as weekPlanService from '../services/week-plan.service';

/**
 * Week-plan controllers: HTTP glue only — validate input, call the service, map
 * results to status codes (CLAUDE.md layering). Writes are MANAGER-only, enforced by
 * route middleware, not here. A `conflict` result becomes 409 (one plan per service
 * user per week; unique day/line slots within a plan).
 */

export async function list(req: Request, res: Response): Promise<void> {
  const raw = req.query.serviceUserId;
  const serviceUserId = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  // STAFF are scoped to the service users in their supervision group; managers and
  // auditors see every plan (CLAUDE.md).
  const rows =
    req.user!.role === 'STAFF'
      ? await weekPlanService.listWeekPlansForStaff(req.user!.sub, serviceUserId)
      : await weekPlanService.listWeekPlans({ serviceUserId });
  res.json(rows);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const found = await weekPlanService.getWeekPlan(String(req.params.id));
  if (!found) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  // Out-of-group plans are hidden from STAFF as 404 (never reveal existence).
  if (req.user!.role === 'STAFF' && !(await isStaffAssigned(req.user!.sub, found.serviceUserId))) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  res.json(found);
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = weekPlanCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid week plan' });
    return;
  }
  const result = await weekPlanService.createWeekPlan(parsed.data);
  if (!result.ok) {
    res.status(409).json({ error: 'A plan for this week already exists' });
    return;
  }
  res.status(201).json(result.value);
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = weekPlanUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid week plan' });
    return;
  }
  const result = await weekPlanService.updateWeekPlan(String(req.params.id), parsed.data);
  if (result === null) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  if (!result.ok) {
    res.status(409).json({ error: 'A plan for this week already exists' });
    return;
  }
  res.json(result.value);
}

/** PUT /:id/day-entries — bulk-replace the whole set of planned lines for a plan. */
export async function replaceDayEntries(req: Request, res: Response): Promise<void> {
  const parsed = dayEntriesReplaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid day entries' });
    return;
  }
  const result = await weekPlanService.replaceDayEntries(
    String(req.params.id),
    parsed.data.entries,
  );
  if (!result.ok) {
    if (result.reason === 'not_found') {
      res.status(404).json({ error: 'Week plan not found' });
      return;
    }
    res.status(409).json({ error: 'Duplicate day/line in the plan' });
    return;
  }
  res.json(result.value);
}

/** POST /:id/duplicate — seed a new week from this one (Duplicate Previous Week). */
export async function duplicate(req: Request, res: Response): Promise<void> {
  const parsed = weekPlanDuplicateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid target week' });
    return;
  }
  const result = await weekPlanService.duplicateWeekPlan(
    String(req.params.id),
    parsed.data.weekCommencing,
  );
  if (!result.ok) {
    if (result.reason === 'not_found') {
      res.status(404).json({ error: 'Week plan not found' });
      return;
    }
    res.status(409).json({ error: 'A plan for the target week already exists' });
    return;
  }
  res.status(201).json(result.value);
}

/**
 * PATCH /:id/day-entries/:entryId/record — staff records what actually happened on a
 * planned line (time spent, outcome, comment). The assignment guard (route middleware)
 * has already confirmed the caller may act on this plan.
 */
export async function recordDayEntry(req: Request, res: Response): Promise<void> {
  const parsed = dayEntryRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid recording' });
    return;
  }
  const result = await weekPlanService.recordDayEntry(
    String(req.params.entryId),
    parsed.data,
    req.user!.sub,
  );
  if (!result.ok) {
    res.status(404).json({ error: 'Day entry not found' });
    return;
  }
  res.json(result.value);
}

/**
 * POST /:id/day-entries — staff adds an unplanned activity that happened, recording it in
 * one step. The server assigns the line number and leaves allocated time null.
 */
export async function addDayEntry(req: Request, res: Response): Promise<void> {
  const parsed = dayEntryStaffCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid activity' });
    return;
  }
  const result = await weekPlanService.addStaffDayEntry(
    String(req.params.id),
    parsed.data,
    req.user!.sub,
  );
  if (!result.ok) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  res.status(201).json(result.value);
}
