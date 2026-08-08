import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

/**
 * Auth routes. Login/refresh/logout are public entry points (they authenticate via
 * body or the refresh cookie); /me is behind requireAuth. Handlers are async, so
 * errors are forwarded to Express' error handling.
 */
export const authRouter = Router();

authRouter.post('/login', authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);
