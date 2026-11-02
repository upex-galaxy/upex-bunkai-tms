import { cn } from '@lib/utils';
import * as React from 'react';

interface TopbarProps {
  left?: React.ReactNode
  center?: React.ReactNode
  right?: React.ReactNode
  className?: string
}

export function Topbar({ left, center, right, className }: TopbarProps) {
  return (
    <div
      className={cn(
        // BK-1557 — below `md` the slots wrap onto extra rows instead of
        // overflowing the phone width; from `md` up it is the fixed 40px bar.
        'flex min-h-10 flex-shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-stroke-1 bg-surface-1 px-3 py-1.5 md:h-10 md:flex-nowrap md:py-0',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{left}</div>
      {center && <div className="flex items-center gap-2">{center}</div>}
      <div className="flex flex-wrap items-center gap-1.5 md:flex-nowrap">{right}</div>
    </div>
  );
}

interface BreadcrumbProps {
  items: string[]
}

// BK-1557 — when the row runs out of room the MIDDLE segments give way
// first, then the first one, and the last (current) segment last: each
// truncates with an ellipsis down to a two-character stub, and the full text
// stays in its tooltip.
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden text-sm">
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        const isFirst = i === 0;
        return (
          <React.Fragment key={`${it}-${i}`}>
            <span
              title={it}
              className={cn(
                'min-w-[2ch] truncate whitespace-nowrap',
                isLast ? 'shrink font-mono font-semibold text-fg-0' : 'text-fg-3',
                !isLast && (isFirst ? 'shrink-[4]' : 'shrink-[16]'),
              )}
            >
              {it}
            </span>
            {!isLast && <span className="flex-shrink-0 text-fg-4">/</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
