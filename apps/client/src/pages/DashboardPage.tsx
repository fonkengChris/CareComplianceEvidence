import { useAuth } from '../auth/AuthContext';
import ManagerSummaryPage from './ManagerSummaryPage';
import StaffDashboardPage from './StaffDashboardPage';

/**
 * Landing page, routed by role. STAFF get their recording dashboard (assigned service users
 * + week plans); MANAGER/AUDITOR get the weekly summary (Phase 7) so the "one screen" status
 * of every active service user is the first thing they see on login.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  if (user?.role === 'STAFF') return <StaffDashboardPage />;
  return <ManagerSummaryPage />;
}
