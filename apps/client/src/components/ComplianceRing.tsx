import type { ComplianceStatus } from '@care/shared';
import { cn } from '@/lib/utils';

/**
 * Donut ring showing delivery progress, coloured by the backend-computed compliance status.
 * The percentage and status are DISPLAY concerns only — every number comes from the server
 * (CLAUDE.md: the frontend displays, never derives). The arc is a CSS conic-gradient over a
 * fixed track colour; a masked overlay punches the hole, and the label sits in an un-masked
 * sibling so it stays crisp in light + dark.
 */

/** Status → the CSS colour token used for the arc. Green/amber/red stay reserved for compliance. */
const RING_COLOR: Record<ComplianceStatus, string> = {
  ON_TRACK: 'var(--success)',
  UNDER_TARGET: 'var(--warning)',
  OVER_HOURS: 'var(--destructive)',
  ATTENTION: 'var(--destructive)',
};

type Size = 'sm' | 'md' | 'lg';

const DIMENSIONS: Record<Size, { box: string; thickness: number; value: string; unit: string }> = {
  sm: { box: 'size-20', thickness: 9, value: 'text-lg', unit: 'text-[10px]' },
  md: { box: 'size-28', thickness: 11, value: 'text-2xl', unit: 'text-xs' },
  lg: { box: 'size-40', thickness: 15, value: 'text-4xl', unit: 'text-sm' },
};

export default function ComplianceRing({
  status,
  deliveryPct,
  size = 'md',
  className,
}: {
  /** Backend-computed status drives the arc colour. Omit for a neutral (overview) ring. */
  status?: ComplianceStatus;
  deliveryPct: number;
  size?: Size;
  className?: string;
}) {
  const dims = DIMENSIONS[size];
  const color = status ? RING_COLOR[status] : 'var(--primary)';
  // Cap the visible sweep at 100% so an over-hours arc still reads as a full ring (the number
  // in the centre still shows the true percentage).
  const sweep = Math.max(0, Math.min(deliveryPct, 100));
  const hole = `radial-gradient(farthest-side, transparent calc(100% - ${dims.thickness}px), #000 calc(100% - ${dims.thickness}px))`;

  return (
    <div
      role="img"
      aria-label={`Delivery ${deliveryPct}%`}
      className={cn('relative grid place-items-center', dims.box, className)}
    >
      {/* The coloured arc: a full conic-gradient disc with its centre masked out. */}
      <div
        aria-hidden
        data-tone={status ?? 'neutral'}
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${sweep}%, var(--ring-track) 0)`,
          WebkitMask: hole,
          mask: hole,
        }}
      />
      {/* Un-masked label overlay. */}
      <span className="relative flex flex-col items-center leading-none">
        <span className={cn('font-display font-semibold tabular-nums', dims.value)}>
          {deliveryPct}
          <span className={cn('align-top font-medium text-muted-foreground', dims.unit)}>%</span>
        </span>
      </span>
    </div>
  );
}
