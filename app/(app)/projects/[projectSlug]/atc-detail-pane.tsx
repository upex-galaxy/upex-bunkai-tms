'use client';

import type { Atc } from '@lib/types';
import type { AtcDetail } from './atc-detail-action';
import { shortSlug } from '@lib/utils';
import { Check, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAtcDetailAction } from './atc-detail-action';

// Read-only ATC detail rendered inside the Tree view's right pane (mockup
// `screens/project.jsx` ATCDetail). The header renders instantly from the tree
// summary; steps / assertions / AC load lazily via the server action. Run-result
// banner, "Run" and "Used by N tests" are intentionally omitted — they need run
// / test data that does not exist yet (master-design-plan §7); editing lives in
// the full ATC Editor (`/atcs/{id}`, §4.4), reachable via Edit.
export function AtcDetailPane({ projectSlug, atc }: { projectSlug: string, atc: Atc }) {
  const [detail, setDetail] = useState<AtcDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    getAtcDetailAction(projectSlug, atc.id)
      .then((d) => {
        if (alive) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) { setLoading(false); }
      });
    return () => { alive = false; };
  }, [projectSlug, atc.id]);

  const boundAc = new Set(detail?.acIds ?? []);

  return (
    <div className="mx-auto max-w-[980px] px-7 pb-12 pt-5">
      {/* Header */}
      <header className="mb-1 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap font-mono text-xs text-fg-3" title={atc.slug}>{shortSlug(atc.slug)}</span>
            <span className="status-chip" data-status={atc.status}>
              <span className="dot" data-status={atc.status} />
              {atc.status === 'fail' ? 'failed' : atc.status}
            </span>
            <span className="layer-chip" data-layer={atc.layer.toLowerCase()}>{atc.layer}</span>
            {detail?.modulePath && detail.modulePath !== '—' && (
              <span className="truncate font-mono text-xs text-fg-4">
                ·
                {detail.modulePath}
              </span>
            )}
          </div>
          <h1 className="m-0 text-xl font-bold tracking-tight text-fg-0">{atc.title}</h1>
        </div>
        <Link
          href={`/projects/${projectSlug}/atcs/${atc.id}`}
          data-testid={`atc-detail-edit-${atc.id}`}
          className="inline-flex h-7 flex-shrink-0 items-center gap-1.5 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 text-xs font-medium text-fg-1 hover:border-stroke-3 hover:bg-surface-3 active:scale-[0.98]"
        >
          <Pencil size={11} />
          Edit
        </Link>
      </header>

      {/* Linked user story + acceptance criteria */}
      <section className="mt-6">
        <SectionLabel>Linked user story</SectionLabel>
        {detail?.story
          ? (
              <>
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-3 rounded-3 border border-stroke-2 bg-surface-2 px-3.5 py-3">
                  <span className="pt-0.5 font-mono text-xs font-semibold text-accent">
                    {detail.story.external_id ?? 'US'}
                  </span>
                  <span className="text-sm leading-relaxed text-fg-1">{detail.story.title}</span>
                </div>
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {detail.storyCriteria.map((ac) => {
                    const checked = boundAc.has(ac.id);
                    return (
                      <div
                        key={ac.id}
                        className={`grid grid-cols-[auto_1fr] items-start gap-2.5 rounded-2 border px-2.5 py-1.5 text-xs ${
                          checked
                            ? 'border-accent/25 bg-accent-soft'
                            : 'border-stroke-1 bg-transparent'
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex size-3.5 items-center justify-center rounded-[3px] border ${
                            checked ? 'border-accent bg-accent' : 'border-stroke-3'
                          }`}
                        >
                          {checked && <Check size={9} className="text-white" />}
                        </span>
                        <span className={checked ? 'text-fg-0' : 'text-fg-2'}>{ac.title}</span>
                      </div>
                    );
                  })}
                  {detail.storyCriteria.length === 0 && (
                    <p className="text-xs text-fg-4">No acceptance criteria on this story.</p>
                  )}
                </div>
              </>
            )
          : loading
            ? <SkeletonRows />
            : <p className="mt-2 text-xs text-fg-4">No linked user story.</p>}
      </section>

      {/* Steps + assertions */}
      <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <SectionLabel>
            Steps
            {detail && <span className="ml-1.5 font-mono text-2xs text-fg-4">{detail.steps.length}</span>}
          </SectionLabel>
          {detail
            ? detail.steps.length > 0
              ? (
                  <ol className="m-0 mt-2 list-none overflow-hidden rounded-3 border border-stroke-2 bg-surface-2 p-0">
                    {detail.steps.map((s, i) => (
                      <li
                        key={s.id}
                        className={`grid grid-cols-[28px_1fr] items-stretch ${i === 0 ? '' : 'border-t border-stroke-1'}`}
                      >
                        <span className="inline-flex items-center justify-center border-r border-stroke-1 bg-white/[0.02] font-mono text-xs font-medium text-fg-3">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="px-3 py-2 text-sm text-fg-1">{s.content}</span>
                      </li>
                    ))}
                  </ol>
                )
              : <p className="mt-2 text-xs text-fg-4">No steps yet.</p>
            : <SkeletonRows />}
        </div>
        <div>
          <SectionLabel>
            Assertions
            {detail && <span className="ml-1.5 font-mono text-2xs text-fg-4">{detail.assertions.length}</span>}
          </SectionLabel>
          {detail
            ? detail.assertions.length > 0
              ? (
                  <div className="mt-2 flex flex-col gap-1.5 rounded-3 border border-stroke-2 bg-surface-2 p-2.5">
                    {detail.assertions.map(a => (
                      <code
                        key={a.id}
                        className="block rounded-[3px] border-l-2 border-transparent px-2 py-1 font-mono text-xs text-fg-1"
                      >
                        {a.content}
                      </code>
                    ))}
                  </div>
                )
              : <p className="mt-2 text-xs text-fg-4">No assertions yet.</p>
            : <SkeletonRows />}

          {atc.tags.length > 0 && (
            <div className="mt-3">
              <SectionLabel>Tags</SectionLabel>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {atc.tags.map(t => (
                  <span key={t} className="rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-2">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Run history & coverage are gated on the runs/tests domains (§7) */}
      <p className="mt-7 text-2xs italic text-fg-4">
        Run history, “Used by tests” and the Run action arrive with the test runner.
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center font-sans text-2xs font-semibold uppercase tracking-wider text-fg-3">
      {children}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-7 animate-pulse rounded-2 bg-surface-2" />
      ))}
    </div>
  );
}
