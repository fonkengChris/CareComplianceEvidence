import { Router } from 'express';
import * as complianceController from '../controllers/compliance.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Compliance-settings routes. The single 🟢/🟡/🔴 threshold row: only MANAGER may read it
 * (AUDITOR sees reports only, which already carry the settings) or change the boundaries (enforced here, not just in the UI —
 * CLAUDE.md). STAFF never touch settings — they see the computed status, not the thresholds.
 */
export const complianceRouter = Router();

complianceRouter.get('/', requireAuth, requireRole('MANAGER'), complianceController.get);
complianceRouter.put('/', requireAuth, requireRole('MANAGER'), complianceController.update);
