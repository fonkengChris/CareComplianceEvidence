import { Router } from 'express';
import * as controller from '../controllers/house-check.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * House-check routes. STAFF/KEY_WORKER complete checks for the home they are on shift at
 * (enforced in the controller); MANAGER maintains templates and reviews every home. AUDITOR is
 * excluded — these are home-level records, not part of any service user's audit grant.
 */
export const houseCheckRouter = Router();

const canComplete = requireRole('STAFF', 'KEY_WORKER', 'MANAGER');
const canManage = requireRole('MANAGER');

houseCheckRouter.get('/templates', requireAuth, canComplete, controller.listTemplates);
houseCheckRouter.get('/templates/:id', requireAuth, canComplete, controller.getTemplate);
houseCheckRouter.post('/templates', requireAuth, canManage, controller.createTemplate);
houseCheckRouter.put('/templates/:id', requireAuth, canManage, controller.updateTemplate);
houseCheckRouter.patch(
  '/templates/:id/active',
  requireAuth,
  canManage,
  controller.setTemplateActive,
);
houseCheckRouter.get('/homes/:homeId/due', requireAuth, canComplete, controller.listDue);
houseCheckRouter.get('/overview', requireAuth, canManage, controller.overview);
houseCheckRouter.get('/homes/:homeId/week', requireAuth, canManage, controller.weekGrid);
houseCheckRouter.post('/submissions', requireAuth, canComplete, controller.submit);
houseCheckRouter.get('/submissions/:id', requireAuth, canComplete, controller.getSubmission);
houseCheckRouter.get('/submissions/:id/pdf', requireAuth, canComplete, controller.getSubmissionPdf);
