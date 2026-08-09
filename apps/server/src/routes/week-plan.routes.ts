import { Router } from 'express';
import * as weekPlanController from '../controllers/week-plan.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireAssignment } from '../middleware/require-assignment';

/**
 * Week-plan routes. Reads are open to any authenticated role (STAFF are scoped to their
 * supervision group inside the controller). Planning writes (create, edit, bulk
 * day-entry replace, duplicate) are MANAGER-only. Recording writes (record a line, add an
 * ad-hoc line) are for STAFF/MANAGER and gated by the assignment guard. All enforced here
 * rather than just in the UI (CLAUDE.md). Roles are checked after requireAuth attaches
 * req.user.
 */
export const weekPlanRouter = Router();

const canRead = requireRole('STAFF', 'MANAGER', 'AUDITOR');
const canWrite = requireRole('MANAGER');
const canRecord = requireRole('STAFF', 'MANAGER');

weekPlanRouter.get('/', requireAuth, canRead, weekPlanController.list);
weekPlanRouter.get('/:id', requireAuth, canRead, weekPlanController.getById);
weekPlanRouter.post('/', requireAuth, canWrite, weekPlanController.create);
weekPlanRouter.put('/:id', requireAuth, canWrite, weekPlanController.update);
// Planning: manager bulk-replaces the whole set of planned lines.
weekPlanRouter.put('/:id/day-entries', requireAuth, canWrite, weekPlanController.replaceDayEntries);
weekPlanRouter.post('/:id/duplicate', requireAuth, canWrite, weekPlanController.duplicate);
// Recording (Phase 5): staff (assigned) or managers record what happened.
weekPlanRouter.patch(
  '/:id/day-entries/:entryId/record',
  requireAuth,
  canRecord,
  requireAssignment,
  weekPlanController.recordDayEntry,
);
weekPlanRouter.post(
  '/:id/day-entries',
  requireAuth,
  canRecord,
  requireAssignment,
  weekPlanController.addDayEntry,
);
