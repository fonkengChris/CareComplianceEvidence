import { homeCreateSchema, homeUpdateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as homeService from '../services/home.service';

/**
 * Home controllers: HTTP glue only — validate input, call the service, map to status
 * codes (CLAUDE.md layering). Reads are open to any authenticated role; writes are
 * MANAGER-only, enforced by route middleware.
 */

/** Parse the optional ?active=true|false filter; anything else means "no filter". */
function parseActiveFilter(raw: unknown): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  const active = parseActiveFilter(req.query.active);
  res.json(await homeService.listHomes({ active }));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const found = await homeService.getHome(String(req.params.id));
  if (!found) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  res.json(found);
}

/** GET /homes/:id/service-users — the active service users belonging to a home. */
export async function listServiceUsers(req: Request, res: Response): Promise<void> {
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
