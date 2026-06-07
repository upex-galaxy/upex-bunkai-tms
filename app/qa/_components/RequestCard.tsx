'use client';

import type { HttpMethod } from '../qa-config';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { CodeFrame } from './CodeBlock';

// Method → accent token map (kept literal so Tailwind's JIT preserves them).
const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  POST: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
  PUT: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  DELETE: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
};

interface CodePayload {
  html: string
  code: string
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2 px-2.5 py-1 text-xs font-medium transition-colors duration-token ease-token ${
        active
          ? 'bg-surface-0 text-fg-0 shadow-card'
          : 'text-fg-3 hover:text-fg-1'
      }`}
    >
      {children}
    </button>
  );
}

function Panel({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-2xs font-semibold uppercase tracking-wider text-fg-3">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Postman-style read-only API request viewer. Highlighting is done server-side
 * (html strings passed in); this client component owns only the Visual/curl
 * toggle + URL copy affordance.
 */
export function RequestCard({
  method,
  url,
  description,
  headers,
  body,
  response,
  curl,
}: {
  method: HttpMethod
  url: string
  description?: string
  headers?: { key: string, value: string }[]
  body?: CodePayload | null
  response?: CodePayload | null
  curl: CodePayload
}) {
  const [mode, setMode] = useState<'visual' | 'curl'>('visual');
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      data-testid="qa-request-card"
      className="overflow-hidden rounded-2 border border-stroke-2 bg-surface-1"
    >
      {/* Header: method badge · url · toggle */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stroke-2 bg-surface-2 px-3 py-2">
        <span
          className={`shrink-0 rounded-2 border px-2 py-0.5 font-mono text-2xs font-bold uppercase ${METHOD_STYLES[method]}`}
        >
          {method}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-1">{url}</code>
        <button
          type="button"
          onClick={copyUrl}
          aria-label="Copy URL"
          className="shrink-0 p-1 text-fg-3 transition-colors hover:text-fg-0"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied && <span className="sr-only">copied</span>}
        </button>
        <div
          data-testid="qa-request-toggle"
          className="flex shrink-0 items-center gap-0.5 rounded-2 border border-stroke-2 bg-surface-1 p-0.5"
        >
          <ToggleButton active={mode === 'visual'} onClick={() => setMode('visual')}>
            Visual
          </ToggleButton>
          <ToggleButton active={mode === 'curl'} onClick={() => setMode('curl')}>
            curl
          </ToggleButton>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {description && <p className="text-sm text-fg-2">{description}</p>}

        {mode === 'visual'
          ? (
              <>
                {headers && headers.length > 0 && (
                  <Panel label="Headers">
                    <div className="overflow-x-auto rounded-2 border border-stroke-2">
                      <table className="w-full text-left text-xs">
                        <tbody>
                          {headers.map(h => (
                            <tr key={h.key} className="border-b border-stroke-2 last:border-0">
                              <td className="whitespace-nowrap px-3 py-1.5 font-mono font-medium text-fg-1">
                                {h.key}
                              </td>
                              <td className="break-all px-3 py-1.5 font-mono text-fg-2">
                                {h.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                )}

                {body && (
                  <Panel label="Body">
                    <CodeFrame
                      html={body.html}
                      code={body.code}
                      variant="editor"
                      title="request.json"
                      language="json"
                    />
                  </Panel>
                )}

                {response && (
                  <Panel label="Response (ejemplo)">
                    <CodeFrame
                      html={response.html}
                      code={response.code}
                      variant="editor"
                      title="response.json"
                      language="json"
                    />
                  </Panel>
                )}
              </>
            )
          : (
              <CodeFrame
                html={curl.html}
                code={curl.code}
                variant="terminal"
                title="curl"
                language="bash"
              />
            )}
      </div>
    </div>
  );
}
