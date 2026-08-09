import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Auth routes. Login/refresh/logout are public entry points (they authenticate via
 * body or the refresh cookie); /me is behind requireAuth. User creation is an admin
 * action — MANAGER-only, since the caller assigns the new user's role (never a public
 * self-signup, which would let anyone grant themselves MANAGER/AUDITOR). Handlers are
 * async, so errors are forwarded to Express' error handling.
 */
export const authRouter = Router();

authRouter.post('/login', authController.login);
authRouter.post('/register', requireAuth, requireRole('MANAGER'), authController.register);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);
