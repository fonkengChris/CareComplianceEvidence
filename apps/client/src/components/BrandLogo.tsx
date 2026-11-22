import { cn } from '@/lib/utils';

/**
 * "Held time" product mark: two overlapping people (teal = carer, terracotta = person
 * supported) inside an open clock ring. The ring takes `currentColor`, so callers set it for
 * light or dark surfaces; the overlap is drawn as its own lens (the multiply of the two colours)
 * rather than via blend modes, so it renders identically everywhere. Static copies of this
 * geometry live in public/favicon.svg — keep them in step.
 */

const CARER = '#138f88';
const SUPPORTED = '#c66e4e';
const OVERLAP = '#0f3e2a';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 72" className={className} aria-hidden="true" focusable="false">
      {/* r=33 centreline, 6-wide stroke; 50° gap centred at 12 o'clock. */}
      <path
        d="M49.95 6.09 A33 33 0 1 1 22.05 6.09"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
      />
      <circle cx="27.5" cy="36" r="13" fill={CARER} />
      <circle cx="44.5" cy="36" r="13" fill={SUPPORTED} />
      <path d="M36 26.16 A13 13 0 0 1 36 45.84 A13 13 0 0 1 36 26.16 Z" fill={OVERLAP} />
    </svg>
  );
}

/** Mark + "1:1 / care records" wordmark. `size` scales the whole lockup. */
export default function BrandLogo({
  size = 'md',
  className,
}: {
  size?: 'md' | 'lg';
  className?: string;
}) {
  const lg = size === 'lg';
  return (
    <span className={cn('inline-flex items-center', lg ? 'gap-4' : 'gap-3', className)}>
      <BrandMark className={cn('shrink-0', lg ? 'size-16' : 'size-11')} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display font-bold tracking-tight',
            lg ? 'text-[2.5rem]' : 'text-[1.7rem]',
          )}
        >
          1:1
        </span>
        <span className={cn('mt-1 font-medium opacity-75', lg ? 'text-base' : 'text-[0.8rem]')}>
          care records
        </span>
      </span>
    </span>
  );
}
