import {
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from './ThemeToggle';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

/**
 * Authenticated app frame (Direction D): a forest-green sidebar rail + a sticky top bar above
 * the routed page. Mobile-first — the rail collapses into a slide-in drawer under a hamburger,
 * and becomes a fixed column at md+. Nav links shown by role are a convenience only; the server
 * enforces access regardless of what is rendered here.
 */

type NavItem = { to: string; label: string; icon: LucideIcon };

function navItems(role: string | undefined): NavItem[] {
  const items: NavItem[] = [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }];
  if (role === 'MANAGER' || role === 'AUDITOR') {
    items.push({ to: '/service-users', label: 'Service Users', icon: Users });
    items.push({ to: '/homes', label: 'Homes', icon: Home });
  }
  if (role === 'MANAGER') {
    items.push({ to: '/users', label: 'Users', icon: ClipboardList });
  }
  if (role === 'MANAGER' || role === 'AUDITOR') {
    items.push({ to: '/reports', label: 'Reports', icon: FileText });
    items.push({ to: '/audit', label: 'Audit', icon: ScrollText });
  }
  return items;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const links = navItems(user?.role);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-muted/40 lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar — a fixed rail at lg+, a slide-in drawer below it. */}
      <Sidebar links={links} drawerOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Backdrop for the mobile drawer. */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu className="size-5" />
              </Button>
              <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
                Care Hours Tracker
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {user && (
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                    {initials(user.name)}
                  </span>
                  <span className="text-sm leading-tight">
                    <span className="block font-medium text-foreground">{user.name}</span>
                    <span className="block text-xs text-muted-foreground">{user.role}</span>
                  </span>
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => logout()}>
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  links,
  drawerOpen,
  onClose,
}: {
  links: NavItem[];
  drawerOpen: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0',
        drawerOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <NavLink
          to="/"
          className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-white"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar">
            <HeartPulse className="size-5" />
          </span>
          Care Hours
        </NavLink>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white lg:hidden"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2" aria-label="Main">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-white'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white'
              )
            }
          >
            <Icon className="size-4.5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 text-xs text-sidebar-muted">1-to-1 Hours Tracker</div>
    </aside>
  );
}
