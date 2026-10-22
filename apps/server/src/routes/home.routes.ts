import { Router } from 'express';
import * as homeController from '../controllers/home.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Home routes. Reads are open to STAFF/KEY_WORKER (scoped to the homes they belong to) and
 * MANAGER; writes are MANAGER-only, enforced here not just in the UI
 * (CLAUDE.md). Roles are checked after requireAuth attaches req.user.
 */
export const homeRouter = Router();

// AUDITOR is excluded: auditors only read their approved reports. STAFF/KEY_WORKER reads are
// scoped to their own homes in the controller.
const canRead = requireRole('STAFF', 'KEY_WORKER', 'MANAGER');
const canManage = requireRole('MANAGER');

homeRouter.get('/', requireAuth, canRead, homeController.list);
homeRouter.get('/:id', requireAuth, canRead, homeController.getById);
homeRouter.get('/:id/service-users', requireAuth, canRead, homeController.listServiceUsers);
homeRouter.post('/', requireAuth, canManage, homeController.create);
homeRouter.put('/:id', requireAuth, canManage, homeController.update);
homeRouter.patch('/:id/active', requireAuth, canManage, homeController.setActive);
homeRouter.delete('/:id', requireAuth, canManage, homeController.remove);
