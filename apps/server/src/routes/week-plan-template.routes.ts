import { Router } from 'express';
import * as templateController from '../controllers/week-plan-template.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Week-plan-template routes. A template is a MANAGER planning aid (staff record against
 * the generated weeks, not the template; auditors read the weeks/reports), so every route
 * is MANAGER-only — enforced here, not just in the UI (CLAUDE.md). Routes are keyed by
 * `serviceUserId` since a template is 1:1 with a service user. `from-week/:weekPlanId`
 * leads with a literal segment so it never shadows `/:serviceUserId`.
 */
export const weekPlanTemplateRouter = Router();

const canManage = requireRole('MANAGER');

weekPlanTemplateRouter.get(
  '/:serviceUserId',
  requireAuth,
  canManage,
  templateController.getForServiceUser,
);
weekPlanTemplateRouter.put(
  '/:serviceUserId/day-entries',
  requireAuth,
  canManage,
  templateController.replaceEntries,
);
weekPlanTemplateRouter.post(
  '/:serviceUserId/generate',
  requireAuth,
  canManage,
  templateController.generate,
);
weekPlanTemplateRouter.post(
  '/from-week/:weekPlanId',
  requireAuth,
  canManage,
  templateController.saveFromWeek,
);
