// Server-rendered code blocks for the /qa page.
//
// Split model (Shiki must run server-side, copy needs client state):
//   - `highlight()`          → server-only Shiki bridge (app/qa/_lib/highlight)
//   - `CodeBlock`            → async SERVER component; highlights + frames
//   - `CodeFrame`            → presentational chrome (no directive → usable in
//                              both server and client trees)
//   - `CopyButton`           → 'use client' leaf (clipboard state)
//   - `AgentCodeBlock`       → 'use client' Tabs; receives PRE-highlighted html
//                              (parent server scope highlights each agent block)
//
// NEVER call highlight() from a 'use client' module — pass html strings down.

import type { ReactNode } from 'react';
import { highlight } from '../_lib/highlight';
import { CopyButton } from './CopyButton';

export const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
  gemini: 'Gemini',
};

export const AGENT_LANGS: Record<string, string> = {
  claude: 'json',
  opencode: 'jsonc',
  codex: 'toml',
  gemini: 'json',
};

// Config filename shown in the editor tab per agent.
export const AGENT_FILES: Record<string, string> = {
  claude: '.mcp.json',
  opencode: 'opencode.jsonc',
  codex: 'codex.toml',
  gemini: '.gemini/settings.json',
};

type Variant = 'terminal' | 'editor';

function variantFor(language: string): Variant {
  return ['bash', 'sh', 'shell', 'zsh'].includes(language.toLowerCase())
    ? 'terminal'
    : 'editor';
}

// macOS traffic-light dots for the terminal chrome.
function TrafficLights() {
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
      <span className="h-3 w-3 rounded-full" style={{ background: '#ff5f56' }} />
      <span className="h-3 w-3 rounded-full" style={{ background: '#ffbd2e' }} />
      <span className="h-3 w-3 rounded-full" style={{ background: '#27c93f' }} />
    </div>
  );
}

/**
 * Presentational chrome. No 'use client' directive → renders in server AND
 * client trees. `html` is a pre-rendered Shiki string; `code` feeds CopyButton.
 */
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
          <TrafficLights />
          <span className="ml-1 truncate font-mono text-2xs uppercase tracking-wider text-fg-3">
            {title ?? language}
          </span>
          <span className="flex-1" />
          <CopyButton code={code} />
        </>
      )
    : (
        <>
          <span className="truncate rounded-t-2 border-b-2 border-accent bg-surface-1 px-2.5 py-1 font-mono text-2xs text-fg-1">
            {title ?? `snippet.${language}`}
          </span>
          <span className="font-mono text-2xs uppercase tracking-wider text-fg-4">
            {language}
          </span>
          <span className="flex-1" />
          <CopyButton code={code} />
        </>
      );

  return (
    <div
      className="qa-code-surface group overflow-hidden rounded-2 border border-stroke-1 bg-surface-2"
      data-testid="qa-code-block"
      data-variant={variant}
    >
      <div className="flex items-center gap-2 border-b border-stroke-1 bg-surface-3 px-3 py-2">
        {chrome}
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/**
 * Async SERVER code block. Highlights `code` with Shiki and frames it as a
 * terminal (bash/sh) or editor (everything else) surface.
 */
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
