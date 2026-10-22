import { Router } from 'express';
import * as activityTypeController from '../controllers/activity-type.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Activity-type routes. Read-only for any authenticated role in the MVP — the list is
 * seeded/admin-maintained, and the planner reads it to populate the activity dropdown.
 */
export const activityTypeRouter = Router();

// AUDITOR is excluded: auditors only read their approved reports.
const canRead = requireRole('STAFF', 'KEY_WORKER', 'MANAGER');

activityTypeRouter.get('/', requireAuth, canRead, activityTypeController.list);
