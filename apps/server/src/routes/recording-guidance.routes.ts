import { Router } from 'express';
import * as recordingGuidanceController from '../controllers/recording-guidance.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Recording-guidance routes. The app-wide prose shown to staff above each comment field on
 * the recording screen. Any authenticated role may READ it (STAFF need it while recording,
 * MANAGER/AUDITOR for context); only MANAGER may edit it — enforced here, not just in the UI
 * (CLAUDE.md). Kept separate from compliance-settings so reading this never exposes the
 * 🟢/🟡/🔴 thresholds to staff.
 */
export const recordingGuidanceRouter = Router();

recordingGuidanceRouter.get('/', requireAuth, recordingGuidanceController.get);
recordingGuidanceRouter.put(
  '/',
  requireAuth,
  requireRole('MANAGER'),
  recordingGuidanceController.update,
);
