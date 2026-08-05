import { cn } from '@lib/utils';
import * as React from 'react';

// Minimal, dependency-free toggle switch (BK-213). No `@radix-ui/react-switch`
// or shadcn primitive exists in this repo yet (checked `package.json`'s
// `@radix-ui/react-*` deps and `components/ui/`) -- adding one for a single
// boolean-toggle caller would be a speculative abstraction (behavioral layer:
// "no abstractions for single-use"). Matches the mockup's `.switch` 1:1
// (`.context/designs/bunkai-test-management-tool/bk-208-notifications/
// settings-notifications.html`) via existing frozen §2 tokens
// (`signal-pass`, `surface-5`, `stroke-2`/`stroke-strong`, `fg-2`/`fg-4`) --
// no new colors picked.
//
// A plain `<button role="switch">` (not `<input type="checkbox">`) mirrors
// the mockup's own markup and keeps keyboard/AT semantics identical to what
// was already validated in the mockup (`aria-checked`, `aria-label`,
// `:focus-visible`).

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-block h-4 w-[30px] shrink-0 rounded-full border transition-colors duration-token ease-token',
          'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent',
          checked
            ? 'border-transparent bg-signal-pass'
            : 'border-stroke-2 bg-surface-5 hover:border-stroke-strong',
          disabled && 'cursor-not-allowed border-dashed border-stroke-2 bg-surface-2 hover:border-stroke-2',
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-0.5 top-0.5 size-2.5 rounded-full bg-fg-2 transition-transform duration-token ease-token',
            checked && 'translate-x-3.5 bg-surface-0',
            disabled && 'bg-fg-4',
          )}
        />
      </button>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
