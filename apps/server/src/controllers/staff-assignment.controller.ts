import { staffAssignmentCreateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as staffAssignmentService from '../services/staff-assignment.service';

/**
 * Staff-assignment controllers: HTTP glue only — validate, call the service, map to
 * status codes (CLAUDE.md layering). `me` is available to STAFF/MANAGER (the caller's
 * own supervision group); the write/list-by-service-user routes are MANAGER-only,
 * enforced by route middleware.
 */

/** GET /assignments/me — the service users the caller currently supervises. */
export async function me(req: Request, res: Response): Promise<void> {
  const staffId = req.user!.sub;
  const rows = await staffAssignmentService.listAssignmentsForStaff(staffId);
  res.json(rows);
}

/** GET /assignments/service-user/:serviceUserId — staff assigned to a service user. */
export async function listForServiceUser(req: Request, res: Response): Promise<void> {
  const rows = await staffAssignmentService.listStaffForServiceUser(
    String(req.params.serviceUserId),
  );
  res.json(rows);
}

/** POST /assignments — add a staff member to a service user's group. Idempotent. */
export async function create(req: Request, res: Response): Promise<void> {
  const parsed = staffAssignmentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid assignment' });
    return;
  }
  await staffAssignmentService.assign(parsed.data.staffId, parsed.data.serviceUserId);
  res.status(204).end();
}

/** DELETE /assignments/service-user/:serviceUserId/staff/:staffId — remove. Idempotent. */
export async function remove(req: Request, res: Response): Promise<void> {
  await staffAssignmentService.unassign(
    String(req.params.staffId),
    String(req.params.serviceUserId),
  );
  res.status(204).end();
}
