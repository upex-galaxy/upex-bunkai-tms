import type { VariantProps } from 'class-variance-authority';
import { cn } from '@lib/utils';
import { cva } from 'class-variance-authority';
import * as React from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-2 text-sm font-medium transition-colors duration-token ease-token focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
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
      size: {
        sm: 'h-7 px-2.5 text-xs',
        default: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-base',
        icon: 'size-8',
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
