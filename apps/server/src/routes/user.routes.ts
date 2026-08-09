import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * User-management routes. MANAGER-only — listing accounts (and their roles) is an
 * admin action, not something STAFF or AUDITOR need. Creation is POST /auth/register
 * (also MANAGER-only); this router is the read side of the same feature.
 */
export const userRouter = Router();

const canManage = requireRole('MANAGER');

userRouter.get('/', requireAuth, canManage, userController.list);
userRouter.get('/:id', requireAuth, canManage, userController.getById);
userRouter.put('/:id', requireAuth, canManage, userController.update);
