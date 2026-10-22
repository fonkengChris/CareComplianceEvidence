import { isAssignmentScoped } from '@care/shared';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ManagerSummaryPage from './ManagerSummaryPage';
import StaffDashboardPage from './StaffDashboardPage';

/**
 * Landing page, routed by role. STAFF and KEY_WORKER get their recording dashboard (assigned service users
 * + week plans); MANAGER gets the weekly summary (Phase 7) so the "one screen" status of every
 * active service user is the first thing they see on login. AUDITOR only has the Reports page,
 * so they land there.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  if (user && isAssignmentScoped(user.role)) return <StaffDashboardPage />;
  if (user?.role === 'AUDITOR') return <Navigate to="/reports" replace />;
  return <ManagerSummaryPage />;
}
