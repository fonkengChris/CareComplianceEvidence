import { homeCreateSchema, homeUpdateSchema, isAssignmentScoped } from '@care/shared';
import type { Request, Response } from 'express';
import * as homeAssignmentService from '../services/home-assignment.service';
import * as homeService from '../services/home.service';
import { activeShiftHomeIdsForStaff } from '../services/staff-assignment.service';

/**
 * Home controllers: HTTP glue only — validate input, call the service, map to status
 * codes (CLAUDE.md layering). Reads are open to STAFF/KEY_WORKER/MANAGER; writes are
 * MANAGER-only, enforced by route middleware. STAFF/KEY_WORKER only see the homes they are
 * assigned to — any other home reads as 404 (never reveal existence).
 */

/** Whether the caller may read a home: managers always, staff only for homes they belong to. */
async function canSeeHome(req: Request, homeId: string): Promise<boolean> {
  if (!isAssignmentScoped(req.user!.role)) return true;
  const mine = await homeAssignmentService.listHomesForStaff(req.user!.sub);
  return mine.some((h) => h.id === homeId);
}

/** Parse the optional ?active=true|false filter; anything else means "no filter". */
function parseActiveFilter(raw: unknown): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  const active = parseActiveFilter(req.query.active);
  if (isAssignmentScoped(req.user!.role)) {
    const mine = await homeAssignmentService.listHomesForStaff(req.user!.sub);
    res.json(active === undefined ? mine : mine.filter((h) => h.active === active));
    return;
  }
  res.json(await homeService.listHomes({ active }));
}

export async function getById(req: Request, res: Response): Promise<void> {
  if (!(await canSeeHome(req, String(req.params.id)))) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  const found = await homeService.getHome(String(req.params.id));
  if (!found) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  res.json(found);
}

/** GET /homes/:id/service-users — the active service users belonging to a home. */
export async function listServiceUsers(req: Request, res: Response): Promise<void> {
  // Members reach every service user in the home, but only while on shift there.
  if (!(await canSeeHome(req, String(req.params.id)))) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  if (
    isAssignmentScoped(req.user!.role) &&
    !(await activeShiftHomeIdsForStaff(req.user!.sub)).includes(String(req.params.id))
  ) {
    res.status(403).json({ error: 'Start a shift at this home to see its service users' });
    return;
  }
  res.json(await homeService.listServiceUsersForHome(String(req.params.id)));
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = homeCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid home' });
    return;
  }
  res.status(201).json(await homeService.createHome(parsed.data));
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = homeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid home' });
    return;
  }
  const updated = await homeService.updateHome(String(req.params.id), parsed.data);
  if (!updated) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  res.json(updated);
}

/** PATCH /:id/active — toggle the soft-delete flag; body: { active: boolean }. */
export async function setActive(req: Request, res: Response): Promise<void> {
  const active = req.body?.active;
  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active must be a boolean' });
    return;
  }
  const updated = await homeService.setHomeActive(String(req.params.id), active);
  if (!updated) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  res.json(updated);
}

/** DELETE /:id — permanently remove a home; its service users are kept, without a home. */
export async function remove(req: Request, res: Response): Promise<void> {
  if (!(await homeService.deleteHome(String(req.params.id)))) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  res.status(204).end();
}
