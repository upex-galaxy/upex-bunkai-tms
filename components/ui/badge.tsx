import type { VariantProps } from 'class-variance-authority';
import { cn } from '@lib/utils';
import { cva } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-2 border px-2 py-0.5 text-xs font-medium transition-colors duration-token ease-token',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-white',
        secondary: 'border-stroke-2 bg-surface-2 text-fg-1',
        outline: 'border-stroke-2 bg-transparent text-fg-1',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
