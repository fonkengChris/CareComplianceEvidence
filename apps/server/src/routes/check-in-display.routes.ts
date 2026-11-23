import { Router } from 'express';
import * as displayController from '../controllers/home-display.controller';

/**
 * Check-in display route. Deliberately NOT behind requireAuth: a paired display is not a user.
 * It authenticates with its own revocable token (X-Display-Token), which can only fetch its
 * home's current on-site check-in code — no other route accepts it.
 */
export const checkInDisplayRouter = Router();

checkInDisplayRouter.get('/code', displayController.code);
