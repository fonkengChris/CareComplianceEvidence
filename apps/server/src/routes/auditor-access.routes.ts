import { Router } from 'express';
import * as auditorAccessController from '../controllers/auditor-access.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Auditor-access routes. A MANAGER sets which service users an AUDITOR may audit; the auditor's
 * reports are scoped to that set (report controller). There is deliberately no auditor-facing
 * route here: an auditor must never be able to list the service users in the system (GDPR).
 * Enforced here, not just in the UI (CLAUDE.md).
 */
export const auditorAccessRouter = Router();

const manager = requireRole('MANAGER');

auditorAccessRouter.get(
  '/auditors/:auditorId',
  requireAuth,
  manager,
  auditorAccessController.getServiceUsers,
);
auditorAccessRouter.put(
  '/auditors/:auditorId',
  requireAuth,
  manager,
  auditorAccessController.setServiceUsers,
);
