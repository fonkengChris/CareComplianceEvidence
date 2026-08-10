import type { ComplianceStatus } from '@care/shared';

/**
 * Displays a backend-computed compliance status as a coloured pill. Mapping a status code to a
 * colour + label is a DISPLAY concern; the status itself (and every number behind it) is decided
 * server-side (CLAUDE.md: the frontend displays, never derives). Four labels over three colours —
 * `ATTENTION` and `OVER_HOURS` are both red so the badge can say WHY.
 */

const STYLES: Record<ComplianceStatus, { label: string; className: string; dot: string }> = {
  ON_TRACK: {
    label: 'On Track',
    className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    dot: '🟢',
  },
  UNDER_TARGET: {
    label: 'Under Target',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    dot: '🟡',
  },
  OVER_HOURS: {
    label: 'Over Hours',
    className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    dot: '🔴',
  },
  ATTENTION: {
    label: 'Attention Required',
    className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    dot: '🔴',
  },
};

export default function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const { label, className, dot } = STYLES[status];
  return (
    <span
      aria-label={`Compliance status: ${label}`}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${className}`}
    >
      <span aria-hidden>{dot}</span>
      {label}
    </span>
  );
}
