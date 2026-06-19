import type { ChainedAtc } from '@components/tests/TestDetailView';
import { shortSlug } from '@lib/utils';
import { ArrowUpRight, GitBranch } from 'lucide-react';
import Link from 'next/link';

// BK-32 — one expanded ATC inside the Test chain. Read-only projection: the
// header mirrors the ATCDetail "Used by" chain-row anatomy (project.jsx:528-546),
// steps use the ATCDetail ordered-`<ol>` anatomy (:476-501), assertions the
// stacked `<code>` anatomy (:502-518) — neutral styling, NO pass/fail color
// (no Runs exist, §7 data-model gate). NO chevron-to-collapse, NO mutation
// controls. The header links out to the ATC's own page (navigation, read-only).

interface ChainedAtcCardProps {
  atc: ChainedAtc
  projectSlug: string
}

export function ChainedAtcCard({ atc, projectSlug }: ChainedAtcCardProps) {
  const { position, steps, assertions } = atc;

  return (
    <div
      data-testid={`chained-atc-card-${position}`}
      className="card flex flex-col gap-3 p-3"
    >
      {/* header row — ATCDetail "Used by" chain-row anatomy. The id/layer/title
          are a link to the ATC's own page (read-only navigation, BK-32). */}
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 font-mono text-2xs font-medium text-fg-3">
          {position}
        </span>
        <GitBranch size={12} className="shrink-0 text-fg-3" />
        <Link
          href={`/projects/${projectSlug}/atcs/${atc.id}`}
          data-testid={`chained-atc-open-${position}`}
          className="group flex min-w-0 flex-1 items-center gap-2.5"
          title={`Open ATC ${atc.slug}`}
        >
          <span className="shrink-0 font-mono text-xs text-fg-3 group-hover:text-fg-1" title={atc.slug}>
            {shortSlug(atc.slug)}
          </span>
          <span className="layer-chip" data-layer={atc.layer.toLowerCase()}>
            {atc.layer}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg-1 group-hover:text-fg-0 group-hover:underline">
            {atc.title}
          </span>
          <ArrowUpRight
            size={13}
            className="shrink-0 text-fg-4 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </Link>
        <span className="dot shrink-0" data-status="unrun" />
      </div>

      {/* steps section */}
      <div className="flex flex-col gap-2">
        <SectionLabel>
          Steps
          {' '}
          <span className="ml-1.5 font-normal text-fg-4">{steps.length}</span>
        </SectionLabel>
        {steps.length === 0
          ? (
              <p
                data-testid={`chained-atc-steps-empty-${position}`}
                className="text-xs italic text-fg-4"
              >
                No steps
              </p>
            )
          : (
              <ol
                data-testid={`chained-atc-steps-${position}`}
                className="m-0 flex list-none flex-col overflow-hidden rounded-2 border border-stroke-2 bg-surface-2 p-0"
              >
                {steps.map((s, i) => (
                  <li
                    key={s.id}
                    className={`grid grid-cols-[28px_1fr] items-stretch ${i === 0 ? '' : 'border-t border-stroke-1'}`}
                  >
                    <span className="inline-flex items-center justify-center border-r border-stroke-1 font-mono text-xs font-medium text-fg-3">
                      {String(s.position).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col gap-1 px-3 py-2">
                      <span className="break-words text-[13px] text-fg-1">{s.content}</span>
                      {s.input_data != null && s.input_data !== '' && (
                        <span className="break-words font-mono text-2xs text-fg-3">
                          input:
                          {' '}
                          {s.input_data}
                        </span>
                      )}
                      {s.expected != null && s.expected !== '' && (
                        <span className="break-words font-mono text-2xs text-fg-3">
                          expected:
                          {' '}
                          {s.expected}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
      </div>

      {/* assertions section — neutral, no pass/fail color */}
      <div className="flex flex-col gap-2">
        <SectionLabel>
          Assertions
          {' '}
          <span className="ml-1.5 font-normal text-fg-4">{assertions.length}</span>
        </SectionLabel>
        {assertions.length === 0
          ? (
              <p
                data-testid={`chained-atc-assertions-empty-${position}`}
                className="text-xs italic text-fg-4"
              >
                No assertions
              </p>
            )
          : (
              <div
                data-testid={`chained-atc-assertions-${position}`}
                className="flex flex-col gap-1.5 rounded-2 border border-stroke-2 bg-surface-2 p-2.5"
              >
                {assertions.map(a => (
                  <code
                    key={a.id}
                    className="block break-words rounded-1 px-2 py-1 font-mono text-xs text-fg-1"
                  >
                    {a.content}
                  </code>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-fg-3">
      {children}
    </span>
  );
}
