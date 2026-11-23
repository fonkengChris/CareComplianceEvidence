import type { Role } from '@care/shared';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Route guard. Redirects unauthenticated users to /login and, when `roles` is given,
 * bounces users whose role is not allowed back to the dashboard. This is UX only —
 * the real enforcement is the server's role middleware.
 */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <p role="status" className="p-6 text-gray-500">
        Loading…
      </p>
    );
  }
  // Remember where they were heading (e.g. a scanned check-in QR's ?checkin=…) for after login.
  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
