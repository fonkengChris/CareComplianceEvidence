import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import * as serviceUserController from '../controllers/service-user.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Service-user routes. Reads are open to any authenticated role; writes are
 * MANAGER-only (enforced here, not just in the UI — CLAUDE.md). Roles are checked
 * after requireAuth has attached req.user.
 */
export const serviceUserRouter = Router();

// AUDITOR is excluded: auditors only read their approved reports
// (`/:id/report`, scoped in the report controller).
const canRead = requireRole('STAFF', 'MANAGER');

serviceUserRouter.get('/', requireAuth, canRead, serviceUserController.list);
// Period report (weeks/months/up to a year) for one service user. MANAGER/AUDITOR only; an auditor
// only for service users they are approved to audit (404 otherwise). Distinct `/:id/report` suffix so it never shadows `GET /:id`.
serviceUserRouter.get(
  '/:id/report',
  requireAuth,
  requireRole('MANAGER', 'AUDITOR'),
  reportController.getServiceUserPeriodReport,
);
serviceUserRouter.get('/:id', requireAuth, canRead, serviceUserController.getById);
serviceUserRouter.post('/', requireAuth, requireRole('MANAGER'), serviceUserController.create);
serviceUserRouter.put('/:id', requireAuth, requireRole('MANAGER'), serviceUserController.update);
serviceUserRouter.patch(
  '/:id/active',
  requireAuth,
  requireRole('MANAGER'),
  serviceUserController.setActive,
);
