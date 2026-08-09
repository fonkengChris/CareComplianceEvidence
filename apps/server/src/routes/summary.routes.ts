import { Router } from 'express';
import * as summaryController from '../controllers/summary.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Manager weekly-summary route (Phase 7). MANAGER and AUDITOR may read the cross-service-user
 * summary; STAFF may not (they use their own recording dashboard). Mounted at its own top-level
 * `/summary` path rather than under `/week-plans` so it can never be shadowed by
 * `GET /week-plans/:id`. Enforced here, not just in the UI (CLAUDE.md).
 */
export const summaryRouter = Router();

summaryRouter.get('/', requireAuth, requireRole('MANAGER', 'AUDITOR'), summaryController.getWeekly);
