import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * User-management routes. MANAGER-only — listing accounts (and their roles) is an
 * admin action, not something STAFF or AUDITOR need. Creation is POST /auth/register
 * (also MANAGER-only); this router is the read side of the same feature.
 */
export const userRouter = Router();

userRouter.get('/', requireAuth, requireRole('MANAGER'), userController.list);
