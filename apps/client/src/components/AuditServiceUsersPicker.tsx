import type { ServiceUser } from '@care/shared';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';

/**
 * Multi-select dropdown of service users for an auditor's user form: a trigger button showing
 * how many are selected, opening a searchable checkbox list. Native elements only (no Radix) to
 * keep bun + happy-dom tests working. Active service users are offered; an already-selected
 * inactive one stays listed (marked) so saving the form doesn't silently drop it.
 */
export default function AuditServiceUsersPicker({
  id,
  serviceUsers,
  selected,
  onChange,
  invalid,
}: {
  id: string;
  serviceUsers: ServiceUser[];
  selected: string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside the picker.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const options = serviceUsers.filter((su) => su.active || selected.includes(su.id));
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((su) => su.name.toLowerCase().includes(q)) : options;
  const selectedNames = options.filter((su) => selected.includes(su.id)).map((su) => su.name);

  function toggle(suId: string) {
    onChange(selected.includes(suId) ? selected.filter((x) => x !== suId) : [...selected, suId]);
  }

  const summary =
    selectedNames.length === 0
      ? 'Select service users…'
      : selectedNames.length <= 2
        ? selectedNames.join(', ')
        : `${selectedNames.length} service users selected`;

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          invalid && 'border-destructive',
          selectedNames.length === 0 && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md">
          <Input
            aria-label="Search service users"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 h-8"
          />
          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto">
            {visible.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">
                No matching service users.
              </li>
            )}
            {visible.map((su) => (
              <li key={su.id} role="option" aria-selected={selected.includes(su.id)}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.includes(su.id)}
                    onChange={() => toggle(su.id)}
                  />
                  <span>
                    {su.name}
                    {!su.active && (
                      <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
