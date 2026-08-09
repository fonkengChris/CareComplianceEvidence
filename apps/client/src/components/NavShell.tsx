import { HeartPulse, LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

/**
 * Authenticated app frame: a role-aware nav plus the current user + logout, wrapping
 * the routed page via <Outlet />. Nav links shown by role are a convenience only —
 * the server enforces access regardless of what is rendered here.
 */

type NavItem = { to: string; label: string };

export default function NavShell() {
  const { user, logout } = useAuth();

  const links: NavItem[] = [{ to: '/', label: 'Dashboard' }];
  if (user?.role === 'MANAGER' || user?.role === 'AUDITOR') {
    links.push({ to: '/service-users', label: 'Service Users' });
    links.push({ to: '/homes', label: 'Homes' });
  }
  if (user?.role === 'MANAGER') {
    links.push({ to: '/users', label: 'Users' });
    links.push({ to: '/compliance-settings', label: 'Compliance' });
  }
  if (user?.role === 'MANAGER' || user?.role === 'AUDITOR') {
    links.push({ to: '/reports', label: 'Reports' });
    links.push({ to: '/audit', label: 'Audit' });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <HeartPulse className="size-5" />
              </span>
              <span className="hidden sm:inline">Care Hours Tracker</span>
            </NavLink>
            <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                <span className="font-medium text-foreground">{user.name}</span> · {user.role}
              </span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => logout()}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
