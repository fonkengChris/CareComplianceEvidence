import { Router } from 'express';
import * as homeController from '../controllers/home.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Home routes. Reads are open to any authenticated role (staff need to see the homes
 * they belong to); writes are MANAGER-only, enforced here not just in the UI
 * (CLAUDE.md). Roles are checked after requireAuth attaches req.user.
 */
export const homeRouter = Router();

const canRead = requireRole('STAFF', 'MANAGER', 'AUDITOR');
const canManage = requireRole('MANAGER');

homeRouter.get('/', requireAuth, canRead, homeController.list);
homeRouter.get('/:id', requireAuth, canRead, homeController.getById);
homeRouter.get('/:id/service-users', requireAuth, canRead, homeController.listServiceUsers);
homeRouter.post('/', requireAuth, canManage, homeController.create);
homeRouter.put('/:id', requireAuth, canManage, homeController.update);
homeRouter.patch('/:id/active', requireAuth, canManage, homeController.setActive);
