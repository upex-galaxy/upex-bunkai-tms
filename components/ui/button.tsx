import type { VariantProps } from 'class-variance-authority';
import { cn } from '@lib/utils';
import { cva } from 'class-variance-authority';
import * as React from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[6px] whitespace-nowrap rounded-2 font-medium transition-[color,background-color,border-color,transform] duration-token ease-token active:translate-y-px focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border border-stroke-2 bg-surface-2 text-fg-1 hover:bg-surface-3 hover:border-stroke-3',
        primary:
          'bg-accent text-white border border-accent hover:bg-accent-hi hover:border-accent-hi',
        ghost:
          'border border-transparent bg-transparent text-fg-1 hover:bg-surface-3',
        danger:
          'border border-signal-fail text-signal-fail bg-transparent hover:bg-signal-fail-bg',
      },
      // BK-1558 — the mockup `.btn` family (styles.css), in px (heights, padding, gap): the root font
      // size is 13px, so rem-based height utilities render at 13/16 of their
      // nominal value (`h-8` is 26px, `h-6` only 19.5px). Default 26px / 12px,
      // lg 33px / 13px, icon-only 26px. `sm` keeps the mockup's 11.5px text
      // at 24px tall, not its ~22px, so the smallest target still meets the
      // WCAG 2.2 24px minimum (master-design-plan §5 D55).
      size: {
        sm: 'h-[24px] px-[8px] text-[11.5px]',
        default: 'h-[26px] px-[10px] text-sm',
        lg: 'h-[33px] px-[14px] text-base',
        icon: 'size-[26px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
