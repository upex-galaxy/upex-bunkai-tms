import type { ReactNode } from 'react';
import { Terminal } from 'lucide-react';
import { highlight } from '../_lib/highlight';
import { CopyButton } from './CopyButton';

type Variant = 'terminal' | 'editor';

function variantFor(language: string): Variant {
  return ['bash', 'sh', 'shell', 'zsh'].includes(language.toLowerCase())
    ? 'terminal'
    : 'editor';
}

export function CodeFrame({
  html,
  code,
  variant,
  title,
  language,
}: {
  html: string
  code: string
  variant: Variant
  title?: string
  language: string
}) {
  const chrome: ReactNode = variant === 'terminal'
    ? (
        <>
          <Terminal className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
          <span className="truncate font-mono text-2xs uppercase tracking-wider text-fg-3">
            {title ?? 'terminal'}
          </span>
        </>
      )
    : (
        <>
          <span className="truncate font-mono text-2xs text-fg-1">
            {title ?? `snippet.${language}`}
          </span>
          <span className="font-mono text-2xs uppercase tracking-wider text-fg-4">
            {language}
          </span>
        </>
      );

  return (
    <div
      className="qa-code-surface group overflow-hidden rounded-3 border border-stroke-2 bg-surface-1"
      data-testid="qa-code-block"
      data-variant={variant}
    >
      <div className="flex items-center gap-2 border-b border-stroke-1 bg-surface-2 py-1 pl-3 pr-1">
        {chrome}
        <span className="flex-1" />
        <CopyButton code={code} />
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export async function CodeBlock({
  code,
  language = 'bash',
  variant,
  title,
}: {
  code: string
  language?: string
  variant?: Variant
  title?: string
}) {
  const v = variant ?? variantFor(language);
  const html = await highlight(code, language);
  return <CodeFrame html={html} code={code} variant={v} title={title} language={language} />;
}
