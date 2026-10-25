import { shiftStartSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as shiftService from '../services/shift.service';

/**
 * Shift controllers: HTTP glue only (CLAUDE.md layering). Staff start/end their own shift; a
 * manager sees who is on shift at a home and may end anyone's session. Roles are enforced by
 * route middleware; "own session only" for staff is enforced in the service.
 */

/** GET /shifts/me — the caller's active shift, or null when off shift. */
export async function me(req: Request, res: Response): Promise<void> {
  res.json(await shiftService.getActiveShift(req.user!.sub));
}

/** POST /shifts — start a shift at one of the caller's homes. */
export async function start(req: Request, res: Response): Promise<void> {
  const parsed = shiftStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid shift' });
    return;
  }
  const result = await shiftService.startShift(req.user!.sub, parsed.data.homeId);
  if (!result.ok) {
    res.status(403).json({ error: 'You are not assigned to this home' });
    return;
  }
  res.status(201).json(result.value);
}

/** POST /shifts/:id/end — end a session (own for staff, any for a manager). */
export async function end(req: Request, res: Response): Promise<void> {
  const result = await shiftService.endShift(String(req.params.id), {
    id: req.user!.sub,
    isManager: req.user!.role === 'MANAGER',
  });
  if (result === 'not-found') {
    res.status(404).json({ error: 'Shift not found' });
    return;
  }
  res.status(204).end();
}

/** GET /shifts/home/:homeId — who is on shift at a home right now (manager view). */
export async function listForHome(req: Request, res: Response): Promise<void> {
  res.json(await shiftService.listActiveShiftsForHome(String(req.params.homeId)));
}
