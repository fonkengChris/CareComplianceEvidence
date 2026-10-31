import express, { Router } from 'express';
import { config } from '../config';
import * as photoController from '../controllers/day-entry-photo.controller';
import * as reportController from '../controllers/report.controller';
import * as weekPlanController from '../controllers/week-plan.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireAssignment } from '../middleware/require-assignment';

/**
 * Week-plan routes. Reads are open to any authenticated role (STAFF are scoped to their
 * supervision group inside the controller). Planning writes (create, edit, bulk
 * day-entry replace, duplicate) are MANAGER-only. Recording writes (record a line, add an
 * ad-hoc line) are for STAFF/MANAGER and gated by the assignment guard. All enforced here
 * rather than just in the UI (CLAUDE.md). Roles are checked after requireAuth attaches
 * req.user.
 */
export const weekPlanRouter = Router();

// AUDITOR is excluded: auditors only read their approved reports
// (`/:id/report`, scoped in the report controller).
const canRead = requireRole('STAFF', 'KEY_WORKER', 'MANAGER');
const canWrite = requireRole('MANAGER');
const canRecord = requireRole('STAFF', 'KEY_WORKER', 'MANAGER');

weekPlanRouter.get('/', requireAuth, canRead, weekPlanController.list);
weekPlanRouter.get('/:id', requireAuth, canRead, weekPlanController.getById);
// Commissioner PDF report (Phase 8): MANAGER, plus AUDITOR/KEY_WORKER scoped to their service
// users in the report controller — STAFF are excluded. Distinct `/:id/report` suffix, so it never shadows
// `GET /:id`. Returns the report DATA; the client renders the PDF (CLAUDE.md-owned figures).
weekPlanRouter.get(
  '/:id/report',
  requireAuth,
  requireRole('MANAGER', 'AUDITOR', 'KEY_WORKER'),
  reportController.getWeekPlanReport,
);
weekPlanRouter.post('/', requireAuth, canWrite, weekPlanController.create);
weekPlanRouter.put('/:id', requireAuth, canWrite, weekPlanController.update);
// Planning: manager bulk-replaces the whole set of planned lines.
weekPlanRouter.put('/:id/day-entries', requireAuth, canWrite, weekPlanController.replaceDayEntries);
weekPlanRouter.post('/:id/duplicate', requireAuth, canWrite, weekPlanController.duplicate);
// Recording (Phase 5): staff (assigned) or managers record what happened.
weekPlanRouter.patch(
  '/:id/day-entries/:entryId/record',
  requireAuth,
  canRecord,
  requireAssignment,
  weekPlanController.recordDayEntry,
);
weekPlanRouter.post(
  '/:id/day-entries',
  requireAuth,
  canRecord,
  requireAssignment,
  weekPlanController.addDayEntry,
);

// Evidence photos on recorded lines: same audience and assignment guard as recording, so a
// STAFF/KEY_WORKER reaches them only for their own direct assignments or active-shift home.
// Uploads are raw image bytes (not JSON), size-capped; the service sniffs the real type.
weekPlanRouter.get('/:id/photos', requireAuth, canRecord, requireAssignment, photoController.list);
weekPlanRouter.post(
  '/:id/day-entries/:entryId/photos',
  requireAuth,
  canRecord,
  requireAssignment,
  express.raw({ type: () => true, limit: config.photoMaxBytes }),
  photoController.upload,
);
weekPlanRouter.get(
  '/:id/photos/:photoId',
  requireAuth,
  canRecord,
  requireAssignment,
  photoController.getImage,
);
weekPlanRouter.delete(
  '/:id/photos/:photoId',
  requireAuth,
  canRecord,
  requireAssignment,
  photoController.remove,
);
