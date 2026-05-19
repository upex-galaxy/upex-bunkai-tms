import { cn } from '@lib/utils';

interface WordmarkProps {
  className?: string
  size?: 'sm' | 'default' | 'lg'
  showLatin?: boolean
}

export function Wordmark({
  className,
  size = 'default',
  showLatin = true,
}: WordmarkProps) {
  const sizeClasses = {
    sm: { kanji: 'text-lg', latin: 'text-sm' },
    default: { kanji: 'text-2xl', latin: 'text-base' },
    lg: { kanji: 'text-[34px]', latin: 'text-xl' },
  }[size];

  return (
    <span className={cn('inline-flex items-baseline gap-2 text-fg-0', className)}>
      <span className={cn('font-jp font-bold leading-none', sizeClasses.kanji)}>
        分解
      </span>
      {showLatin && (
        <span
          className={cn(
            'font-sans font-bold leading-none tracking-tight',
            sizeClasses.latin,
          )}
        >
          Bunkai
        </span>
      )}
    </span>
  );
}
