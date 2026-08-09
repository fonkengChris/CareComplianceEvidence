import { Router } from 'express';
import * as activityTypeController from '../controllers/activity-type.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Activity-type routes. Read-only for any authenticated role in the MVP — the list is
 * seeded/admin-maintained, and the planner reads it to populate the activity dropdown.
 */
export const activityTypeRouter = Router();

const canRead = requireRole('STAFF', 'MANAGER', 'AUDITOR');

activityTypeRouter.get('/', requireAuth, canRead, activityTypeController.list);
