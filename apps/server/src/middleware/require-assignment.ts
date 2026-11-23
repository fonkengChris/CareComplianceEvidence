import { isAssignmentScoped } from '@care/shared';
import type { RequestHandler } from 'express';
import { isStaffAssigned } from '../services/staff-assignment.service';
import { isWithinStaffWindow, planScope } from '../services/week-plan.service';

/**
 * Guard for the staff recording endpoints: a STAFF/KEY_WORKER user may only act on a plan whose
 * service user is in their supervision group, and only within the recent-weeks window
 * (`isWithinStaffWindow`). Resolves the plan (`:id`) to its service user and week and checks
 * both; MANAGER bypasses (they cover everyone). Assumes
 * requireAuth ran first so `req.user` is set. Enforced HERE on the server, not just in
 * the UI (CLAUDE.md).
 */
export const requireAssignment: RequestHandler = async (req, res, next) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  // Managers (and any non-staff caller that reaches here) are not scoped to a group.
  if (!isAssignmentScoped(user.role)) {
    next();
    return;
  }

  const scope = await planScope(String(req.params.id));
  if (scope === null) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  // Older weeks are outside staff reach (GDPR minimisation) — hidden as not found.
  if (!isWithinStaffWindow(scope.weekCommencing)) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  if (!(await isStaffAssigned(user.sub, scope.serviceUserId))) {
    res.status(403).json({
      error: 'Not assigned to this service user — if they live at your home, start a shift first',
    });
    return;
  }
  next();
};
