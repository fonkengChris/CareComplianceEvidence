import type { Request, Response } from 'express';
import * as activityTypeService from '../services/activity-type.service';

/**
 * Activity-type controllers: read-only in the MVP. `?includeInactive=true` returns
 * retired activities too (useful when displaying historical entries); the default is
 * active-only for the planner picker.
 */

export async function list(req: Request, res: Response): Promise<void> {
  const includeInactive = req.query.includeInactive === 'true';
  const rows = await activityTypeService.listActivityTypes({ active: !includeInactive });
  res.json(rows);
}
