import { Router } from 'express';
import * as auditController from '../controllers/audit.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Audit routes (Phase 9). Read-only for managers and auditors — STAFF are excluded, matching
 * the summary/report surfaces. There is deliberately NO write route: the trail is append-only,
 * so no role can edit or delete audit rows (CLAUDE.md). Enforced here, not just in the UI.
 */
export const auditRouter = Router();

auditRouter.get('/', requireAuth, requireRole('MANAGER', 'AUDITOR'), auditController.list);
