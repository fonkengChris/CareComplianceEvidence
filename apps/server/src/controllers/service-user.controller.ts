import { isAssignmentScoped, serviceUserCreateSchema, serviceUserUpdateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as serviceUserService from '../services/service-user.service';
import * as staffAssignmentService from '../services/staff-assignment.service';

/**
 * Service-user controllers: HTTP glue only — validate input, call the service, map
 * results to status codes. No business logic or DB access here (CLAUDE.md layering).
 * STAFF/KEY_WORKER reads are scoped to the service users they reach (direct or via a home);
 * anything else reads as 404 (never reveal existence).
 */

/** Parse the optional ?active=true|false filter; anything else means "no filter". */
function parseActiveFilter(raw: unknown): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  const active = parseActiveFilter(req.query.active);
  if (isAssignmentScoped(req.user!.role)) {
    // A staff member's reach only ever holds active service users.
    const rows = await staffAssignmentService.listAssignmentsForStaff(req.user!.sub);
    res.json(active === undefined ? rows : rows.filter((su) => su.active === active));
    return;
  }
  const rows = await serviceUserService.listServiceUsers({ active });
  res.json(rows);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  if (
    isAssignmentScoped(req.user!.role) &&
    !(await staffAssignmentService.isStaffAssigned(req.user!.sub, id))
  ) {
    res.status(404).json({ error: 'Service user not found' });
    return;
  }
  const found = await serviceUserService.getServiceUser(id);
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

/**
 * DELETE /:id — permanently remove a service user. 409 once they have week plans: that
 * history must be kept, so they can only be deactivated.
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const result = await serviceUserService.deleteServiceUser(String(req.params.id), req.user!.sub);
  if (result === 'not-found') {
    res.status(404).json({ error: 'Service user not found' });
    return;
  }
  if (result === 'has-week-plans') {
    res.status(409).json({
      error:
        'This service user has week plans, so their records must be kept. Deactivate them instead.',
    });
    return;
  }
  res.status(204).end();
}
