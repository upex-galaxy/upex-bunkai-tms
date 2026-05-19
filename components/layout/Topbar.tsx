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
        'flex h-10 flex-shrink-0 items-center justify-between gap-3 border-b border-stroke-1 bg-surface-1 px-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{center}</div>
      <div className="flex items-center gap-1.5">{right}</div>
    </div>
  );
}

interface BreadcrumbProps {
  items: string[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden text-sm">
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={`${it}-${i}`}>
            <span
              className={cn(
                'overflow-hidden truncate whitespace-nowrap',
                isLast ? 'font-mono font-semibold text-fg-0' : 'text-fg-3',
              )}
            >
              {it}
            </span>
            {!isLast && <span className="text-fg-4">/</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
