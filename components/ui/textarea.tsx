import { cn } from '@lib/utils';
import * as React from 'react';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'block min-h-[60px] w-full resize-y rounded-2 border border-stroke-2 bg-surface-2 px-[9px] py-[7px] font-sans text-[12.5px] leading-[1.4] text-fg-0 outline-none transition-colors duration-token ease-token placeholder:text-fg-4 hover:border-stroke-3 focus:border-accent focus:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
