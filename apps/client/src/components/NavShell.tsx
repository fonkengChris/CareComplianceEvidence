import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Authenticated app frame: a role-aware nav plus the current user + logout, wrapping
 * the routed page via <Outlet />. Nav links shown by role are a convenience only —
 * the server enforces access regardless of what is rendered here.
 */
export default function NavShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4">
        <nav className="flex gap-4" aria-label="Main">
          <Link to="/">Dashboard</Link>
          {user?.role === 'MANAGER' && <Link to="/service-users">Service Users</Link>}
          {user?.role === 'MANAGER' && <Link to="/users">Users</Link>}
          {user?.role === 'MANAGER' && <Link to="/compliance-settings">Compliance</Link>}
          {(user?.role === 'MANAGER' || user?.role === 'AUDITOR') && (
            <>
              <Link to="/reports">Reports</Link>
              <Link to="/audit">Audit</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {user && (
            <span className="text-gray-600">
              {user.name} · {user.role}
            </span>
          )}
          <button
            type="button"
            onClick={() => logout()}
            className="rounded border border-gray-300 px-3 py-1"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
