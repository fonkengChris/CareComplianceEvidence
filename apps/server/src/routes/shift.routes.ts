import { Router } from 'express';
import * as shiftController from '../controllers/shift.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Shift routes. STAFF/KEY_WORKER start and end their own shift (which is what opens and closes
 * their home-path access); a MANAGER sees who is on shift at a home and may end any session.
 * AUDITOR has no access. Enforced here, not just in the UI (CLAUDE.md).
 */
export const shiftRouter = Router();

const staff = requireRole('STAFF', 'KEY_WORKER');

shiftRouter.get('/me', requireAuth, staff, shiftController.me);
shiftRouter.post('/', requireAuth, staff, shiftController.start);
shiftRouter.post(
  '/:id/end',
  requireAuth,
  requireRole('STAFF', 'KEY_WORKER', 'MANAGER'),
  shiftController.end,
);
shiftRouter.get('/home/:homeId', requireAuth, requireRole('MANAGER'), shiftController.listForHome);
