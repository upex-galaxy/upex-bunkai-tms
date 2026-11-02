import { cn } from '@lib/utils';
import * as React from 'react';

// BK-1558 — the one select atom: the mockup `.select` (styles.css) on a
// native <select>. Native on purpose: keyboard, screen readers, phone pickers
// and the existing automation (`selectOption`) keep working, and the popup
// follows `color-scheme: dark` from globals.css. Same tokens as `Input`
// (bg-2 surface, stroke-2 border, stroke-3 hover, accent border + bg-3 on
// focus, r-2 radius), with the chevron drawn by `.select-chevron`.
//
// Heights are px because the root font size is 13px (rem utilities render
// at 13/16). The default is 26px, the same as `Input` (`h-8`) and the
// default `Button`, so a field row lines up; `size="sm"` is 24px for table
// cells, matching the small `Button`.

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'default' | 'sm'
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size = 'default', ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'select-chevron rounded-2 border border-stroke-2 bg-surface-2 text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3 focus:border-accent focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-[24px] pl-[8px] pr-[24px] text-xs' : 'h-[26px] pl-[9px] pr-[26px] text-sm',
          className,
        )}
        {...props}
      />
    );
  },
);
Select.displayName = 'Select';

export { Select };
