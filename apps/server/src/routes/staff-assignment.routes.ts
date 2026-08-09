import { Router } from 'express';
import * as staffAssignmentController from '../controllers/staff-assignment.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Staff-assignment routes (the supervision group). `me` returns the caller's own
 * assigned service users (STAFF or MANAGER). Managing the group — listing a service
 * user's staff, assigning, unassigning — is MANAGER-only, enforced here not just in the
 * UI (CLAUDE.md). Roles are checked after requireAuth attaches req.user.
 */
export const staffAssignmentRouter = Router();

const canManage = requireRole('MANAGER');

staffAssignmentRouter.get(
  '/me',
  requireAuth,
  requireRole('STAFF', 'MANAGER'),
  staffAssignmentController.me,
);
staffAssignmentRouter.get(
  '/my-homes',
  requireAuth,
  requireRole('STAFF', 'MANAGER'),
  staffAssignmentController.myHomes,
);
staffAssignmentRouter.get(
  '/service-user/:serviceUserId',
  requireAuth,
  canManage,
  staffAssignmentController.listForServiceUser,
);
staffAssignmentRouter.get(
  '/home/:homeId',
  requireAuth,
  canManage,
  staffAssignmentController.listForHome,
);
staffAssignmentRouter.post('/', requireAuth, canManage, staffAssignmentController.create);
staffAssignmentRouter.post(
  '/home',
  requireAuth,
  canManage,
  staffAssignmentController.createHomeAssignment,
);
staffAssignmentRouter.delete(
  '/service-user/:serviceUserId/staff/:staffId',
  requireAuth,
  canManage,
  staffAssignmentController.remove,
);
staffAssignmentRouter.delete(
  '/home/:homeId/staff/:staffId',
  requireAuth,
  canManage,
  staffAssignmentController.removeHomeAssignment,
);
