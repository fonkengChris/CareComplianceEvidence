import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Light/dark toggle. The theme is a `.dark` class on <html>; index.html applies the saved
 * (or system) preference before first paint, and this control just flips + persists it.
 * Kept provider-free on purpose — it owns its own state so it can be dropped anywhere in the
 * shell without wiring context (and without breaking tests that render pages in isolation).
 */

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('light');

  // Sync from the DOM once mounted (the pre-paint script in index.html is the source of truth).
  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('care-theme', next);
    } catch {
      /* storage may be unavailable; the class change still applies for this session */
    }
    setTheme(next);
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-2.5 pr-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <span className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground">
        {isDark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      </span>
      <span className="hidden sm:inline">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
}
