import { cn } from '@lib/utils';
import * as React from 'react';

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-2xs font-medium uppercase tracking-wider text-fg-2',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

export { Label };
