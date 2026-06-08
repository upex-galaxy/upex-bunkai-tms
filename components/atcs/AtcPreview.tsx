'use client';

import type { AcceptanceCriterion, AtcLayer, AtcStatus, UserStory } from '@lib/types';
import { parseAssertionsYaml, parseStepsMarkdown } from '@lib/atc-parse';
import { Check, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

// Read-only live render of the ATC as test runners and AI agents will consume
// it — the mockup's "Live preview" pane (editor.jsx). Driven entirely by the
// editor's in-memory state, so it updates as you type. No data fetching, no
// mutation: a pure projection of the compose form.

interface AtcPreviewProps {
  id: string | null
  status: AtcStatus | null
  layer: AtcLayer
  breadcrumb: string[]
  title: string
  story: UserStory | null
  acs: AcceptanceCriterion[]
  stepsMd: string
  assertionsYaml: string
  tags: string[]
  draft?: boolean
}

export function AtcPreview({
  id,
  status,
  layer,
  breadcrumb,
  title,
  story,
  acs,
  stepsMd,
  assertionsYaml,
  tags,
  draft = false,
}: AtcPreviewProps) {
  const steps = useMemo(() => parseStepsMarkdown(stepsMd), [stepsMd]);
  const assertions = useMemo(() => parseAssertionsYaml(assertionsYaml), [assertionsYaml]);

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-surface-1">
      {/* pane header */}
      <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-stroke-1 px-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-0">
          Live preview
        </span>
        <span className="status-chip" data-status="running">read-only</span>
      </div>
      <div className="px-3 pb-1 pt-2 text-2xs text-fg-4">
        This is what test runners and AI agents will see.
      </div>

      {/* rendered card */}
      <div className="flex-1 overflow-auto p-3">
        <div className="card flex flex-col gap-4 p-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-fg-3">{id ?? 'ATC-—'}</span>
              <span className="layer-chip" data-layer={layer.toLowerCase()}>{layer}</span>
              {draft
                ? <span className="status-chip" data-status="skipped">draft</span>
                : status
                  ? <span className="dot" data-status={status} />
                  : null}
              {breadcrumb.length > 0 && (
                <span className="truncate font-mono text-2xs text-fg-4">
                  ·
                  {' '}
                  {breadcrumb.join(' › ')}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold leading-snug text-fg-0">
              {title.trim() || <span className="text-fg-4">Untitled ATC</span>}
            </h2>
          </div>

          {/* linked story + acs */}
          {story && (
            <div className="flex flex-col gap-2">
              <PreviewLabel>Linked user story</PreviewLabel>
              <div className="rounded-2 border border-stroke-1 bg-surface-2 p-2.5">
                <div className="font-mono text-xs font-semibold text-accent">
                  {story.external_id ?? story.id}
                </div>
                <div className="mt-0.5 text-sm leading-snug text-fg-1">{story.title}</div>
              </div>
              {acs.map(ac => (
                <div key={ac.id} className="flex items-start gap-2 text-sm">
                  <Check size={12} className="mt-0.5 shrink-0 text-signal-pass" />
                  <span className="font-mono text-xs text-fg-3">{ac.id}</span>
                  <span className="text-fg-1">{ac.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* steps */}
          {steps.length > 0 && (
            <div className="flex flex-col gap-2">
              <PreviewLabel>Steps</PreviewLabel>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-fg-1">
                    <span className="font-mono text-xs text-fg-4">
                      {String(i + 1).padStart(2, '0')}
                      .
                    </span>
                    <span className="min-w-0 flex-1">{s.content}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* assertions */}
          {assertions.length > 0 && (
            <div className="flex flex-col gap-2">
              <PreviewLabel>Assertions</PreviewLabel>
              <div className="rounded-2 border border-stroke-2 bg-surface-0 p-2.5 font-mono text-xs">
                {assertions.map((a, i) => (
                  <div key={i} className="flex gap-2 text-fg-1">
                    <span className="select-none text-fg-4">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 break-words">{a.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-fg-2"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-stroke-1 bg-surface-0 px-3 py-2 text-2xs">
        <span className="font-mono text-fg-4">schema · atc.v1</span>
        <span className="inline-flex items-center gap-1 text-fg-3">
          <Sparkles size={10} className="text-accent" />
          Updated live as you edit
        </span>
      </div>
    </aside>
  );
}

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-fg-3">
      {children}
    </span>
  );
}
