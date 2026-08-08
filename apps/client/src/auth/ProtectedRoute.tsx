import type { Role } from '@care/shared';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Route guard. Redirects unauthenticated users to /login and, when `roles` is given,
 * bounces users whose role is not allowed back to the dashboard. This is UX only —
 * the real enforcement is the server's role middleware.
 */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <p role="status" className="p-6 text-gray-500">
        Loading…
      </p>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
