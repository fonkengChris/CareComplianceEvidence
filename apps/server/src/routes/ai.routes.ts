import { Router } from 'express';
import * as aiController from '../controllers/ai.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * AI routes. The "polish activity record" helper is available to the roles that actually
 * record — STAFF and MANAGER; AUDITOR is read-only and excluded. Enforced here on the
 * server, never by UI hiding alone (CLAUDE.md).
 */
export const aiRouter = Router();

aiRouter.post('/polish', requireAuth, requireRole('STAFF', 'MANAGER'), aiController.polish);
