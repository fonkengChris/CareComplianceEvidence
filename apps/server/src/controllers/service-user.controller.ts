import { serviceUserCreateSchema, serviceUserUpdateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as serviceUserService from '../services/service-user.service';

/**
 * Service-user controllers: HTTP glue only — validate input, call the service, map
 * results to status codes. No business logic or DB access here (CLAUDE.md layering).
 */

/** Parse the optional ?active=true|false filter; anything else means "no filter". */
function parseActiveFilter(raw: unknown): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  const active = parseActiveFilter(req.query.active);
  const rows = await serviceUserService.listServiceUsers({ active });
  res.json(rows);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const found = await serviceUserService.getServiceUser(String(req.params.id));
  if (!found) {
    res.status(404).json({ error: 'Service user not found' });
    return;
  }
  res.json(found);
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = serviceUserCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid service user' });
    return;
  }
  const created = await serviceUserService.createServiceUser(parsed.data);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = serviceUserUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid service user' });
    return;
  }
  const updated = await serviceUserService.updateServiceUser(
    String(req.params.id),
    parsed.data,
    req.user!.sub,
  );
  if (!updated) {
    res.status(404).json({ error: 'Service user not found' });
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
  const updated = await serviceUserService.setServiceUserActive(
    String(req.params.id),
    active,
    req.user!.sub,
  );
  if (!updated) {
    res.status(404).json({ error: 'Service user not found' });
    return;
  }
  res.json(updated);
}
