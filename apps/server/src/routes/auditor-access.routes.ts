import { Router } from 'express';
import * as auditorAccessController from '../controllers/auditor-access.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Auditor-access routes. AUDITORs see which service users they can request, raise requests and
 * withdraw pending ones; MANAGERs review the queue and approve, reject or revoke. An auditor's
 * reports are scoped to their APPROVED grants (report controller). Enforced here, not just in
 * the UI (CLAUDE.md).
 */
export const auditorAccessRouter = Router();

const auditor = requireRole('AUDITOR');
const manager = requireRole('MANAGER');

auditorAccessRouter.get('/me', requireAuth, auditor, auditorAccessController.mine);
auditorAccessRouter.get(
  '/service-users',
  requireAuth,
  auditor,
  auditorAccessController.requestable,
);
auditorAccessRouter.post('/', requireAuth, auditor, auditorAccessController.create);
auditorAccessRouter.delete('/:id', requireAuth, auditor, auditorAccessController.withdraw);
auditorAccessRouter.get('/', requireAuth, manager, auditorAccessController.list);
auditorAccessRouter.post('/:id/approve', requireAuth, manager, auditorAccessController.approve);
auditorAccessRouter.post('/:id/reject', requireAuth, manager, auditorAccessController.reject);
auditorAccessRouter.post('/:id/revoke', requireAuth, manager, auditorAccessController.revoke);
