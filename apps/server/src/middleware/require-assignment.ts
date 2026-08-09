import type { RequestHandler } from 'express';
import { isStaffAssigned } from '../services/staff-assignment.service';
import { serviceUserIdForPlan } from '../services/week-plan.service';

/**
 * Guard for the staff recording endpoints: a STAFF user may only act on a plan whose
 * service user is in their supervision group. Resolves the plan (`:id`) to its service
 * user and checks the assignment; MANAGER bypasses (they cover everyone). Assumes
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
  if (user.role !== 'STAFF') {
    next();
    return;
  }

  const serviceUserId = await serviceUserIdForPlan(String(req.params.id));
  if (serviceUserId === null) {
    res.status(404).json({ error: 'Week plan not found' });
    return;
  }
  if (!(await isStaffAssigned(user.sub, serviceUserId))) {
    res.status(403).json({ error: 'Not assigned to this service user' });
    return;
  }
  next();
};
