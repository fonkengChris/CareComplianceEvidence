import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import * as summaryController from '../controllers/summary.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Manager weekly-summary route (Phase 7). Only MANAGER may read the cross-service-user weekly
 * summary; STAFF use their own recording dashboard and AUDITOR sees reports only. Mounted at its
 * own top-level `/summary` path rather than under `/week-plans` so it can never be shadowed by
 * `GET /week-plans/:id`. Enforced here, not just in the UI (CLAUDE.md).
 */
export const summaryRouter = Router();

summaryRouter.get('/', requireAuth, requireRole('MANAGER'), summaryController.getWeekly);
// Whole-period reports overview (weeks/months/up to a year) across every active service user —
// for an AUDITOR only those they are approved to audit (scoped in the report controller). Each
// row is a self-contained per-service-user report ready to render as a PDF.
summaryRouter.get(
  '/period',
  requireAuth,
  requireRole('MANAGER', 'AUDITOR'),
  reportController.getPeriodSummary,
);
