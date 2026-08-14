import type { BugDetailInput } from '@lib/bugs/detail-view';
import type { HTMLAttributes } from 'react';
import { buttonVariants } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { BUG_EVIDENCE_MAX } from '@lib/bugs/constants';
import {
  evidenceCountLabel,
  formatBugEvidenceRow,
  isModuleArchived,
  resolveBugOriginView,
  severityLabel,
  shortBugId,
  splitStepsToReproduce,
  statusLabel,
} from '@lib/bugs/detail-view';
import { cn } from '@lib/utils';
import { ArrowLeft, ArrowUpRight, Info } from 'lucide-react';
import Link from 'next/link';

// BK-337 — the read-only defect detail record (`bug-detail.html`, §4.6).
// Reuses the list's live `Card`, `.status-chip`/`.dot` tokens, and 8-char
// identifier treatment (Critical Rule #14 — live UI is the fidelity source).
// STRUCTURALLY read-only: no input, textarea, contenteditable, or any
// status/assignment/delete control exists ANYWHERE in this file (AC4/E-4) —
// not disabled, absent.

export interface BugDetailViewProps {
  bug: BugDetailInput
  assigneeEmail: string | null
  reporterEmail: string | null
  projectSlug: string
}

export function BugDetailView({ bug, assigneeEmail, reporterEmail, projectSlug }: BugDetailViewProps) {
  const reporterLabel = reporterEmail ?? 'Unknown';
  const origin = resolveBugOriginView(bug.origin);
  const steps = splitStepsToReproduce(bug.steps_to_reproduce);
  const evidenceRows = bug.evidence_urls.map(formatBugEvidenceRow);
  const moduleArchived = isModuleArchived(bug.module);

  return (
    <div className="flex flex-col gap-4 p-6" data-testid="bug-detail-view">
      <Link
        href={`/projects/${projectSlug}/bugs`}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}
        data-testid="bug-detail-back-link"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Bug Reports
      </Link>

      <header className="flex flex-col gap-2" data-testid="bug-detail-header">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="font-mono text-xs font-medium text-fg-2"
            title={bug.id}
            data-testid="bug-detail-id"
          >
            {shortBugId(bug.id)}
          </span>
          <span className="status-chip" data-status={severityToken(bug.severity)}>
            <span className="dot" data-status={severityToken(bug.severity)} />
            {bug.severity}
            {' · '}
            {severityLabel(bug.severity)}
          </span>
          <span className="status-chip" data-status={statusToken(bug.status)}>
            <span className="dot" data-status={statusToken(bug.status)} />
            {statusLabel(bug.status)}
          </span>
        </div>
        <h1 className="text-lg font-semibold text-fg-0" data-testid="bug-detail-title">{bug.title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
          <span className="font-mono text-xs" data-testid="bug-detail-module-path">{bug.module?.path ?? '—'}</span>
          {moduleArchived && (
            <span className="status-chip" data-status="skipped" data-testid="bug-detail-module-archived-tag">
              Archived
            </span>
          )}
          <span aria-hidden="true">·</span>
          <span data-testid="bug-detail-filed-by">{`Filed by ${reporterLabel} · ${formatFiledDate(bug.created_at)}`}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold text-fg-0">Description</h2>
              {bug.description
                ? <p className="whitespace-pre-wrap text-sm text-fg-1" data-testid="bug-detail-description">{bug.description}</p>
                : <p className="text-sm text-fg-3">No description provided.</p>}
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold text-fg-0">Steps to reproduce</h2>
              {steps.length > 0
                ? (
                    <ol className="list-decimal space-y-1 pl-5 font-mono text-sm text-fg-1" data-testid="bug-detail-steps">
                      {steps.map((step, index) => (
                        <li key={`${index}-${step}`} data-testid="bug-detail-step">{step}</li>
                      ))}
                    </ol>
                  )
                : <p className="text-sm text-fg-3">No steps to reproduce were recorded.</p>}
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg-0">Evidence</h2>
                <span className="font-mono text-xs text-fg-2" data-testid="bug-detail-evidence-count">
                  {evidenceCountLabel(evidenceRows.length, BUG_EVIDENCE_MAX)}
                </span>
              </div>
              {evidenceRows.length > 0
                ? (
                    <ul className="flex flex-col gap-1" data-testid="bug-detail-evidence-list">
                      {evidenceRows.map(row => (
                        <li key={row.url}>
                          {row.isOpenable
                            ? (
                                <a
                                  href={row.url}
                                  title={row.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="truncate text-sm text-accent underline decoration-transparent underline-offset-2 transition-colors duration-token ease-token hover:decoration-accent"
                                  data-testid="bug-detail-evidence-row"
                                >
                                  {row.label}
                                </a>
                              )
                            : (
                                <span
                                  title={row.url}
                                  className="truncate text-sm text-fg-2"
                                  data-testid="bug-detail-evidence-row"
                                >
                                  {row.label}
                                </span>
                              )}
                        </li>
                      ))}
                    </ul>
                  )
                : <p className="text-sm text-fg-3" data-testid="bug-detail-evidence-empty">No evidence attached.</p>}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold text-fg-0">Details</h2>
              <dl className="flex flex-col gap-1.5 text-sm">
                <DetailRow label="Severity" value={`${bug.severity} · ${severityLabel(bug.severity)}`} />
                <DetailRow label="Status" value={statusLabel(bug.status)} />
                <DetailRow
                  label="Module"
                  value={bug.module?.path ?? '—'}
                  suffix={moduleArchived ? 'Archived' : undefined}
                />
                <DetailRow label="Reporter" value={reporterLabel} />
                <DetailRow label="Filed" value={formatFiledDate(bug.created_at)} />
                <DetailRow
                  label="Assignee"
                  value={bug.assignee_user_id ? (assigneeEmail ?? 'Assigned') : 'Unassigned'}
                  data-testid="bug-detail-assignee"
                />
              </dl>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-2 p-4" data-testid="bug-detail-origin">
              <h2 className="text-sm font-semibold text-fg-0">Origin</h2>
              {origin.state === 'linked'
                ? (
                    <div className="flex flex-col gap-2">
                      {origin.atcId && (
                        <Link
                          href={`/projects/${projectSlug}/atcs/${origin.atcId}`}
                          className="flex items-center justify-between gap-2 rounded-2 border border-stroke-2 px-3 py-2 text-sm text-fg-1 transition-colors duration-token ease-token hover:bg-surface-3"
                          data-testid="bug-detail-origin-atc-link"
                          title={origin.atcId}
                        >
                          <span>
                            <span className="font-mono text-xs text-fg-2">{shortBugId(origin.atcId)}</span>
                            <br />
                            {origin.atcTitle ?? 'ATC'}
                          </span>
                          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                        </Link>
                      )}
                      {origin.runId && (
                        <Link
                          href={`/projects/${projectSlug}/runs/${origin.runId}`}
                          className="flex items-center justify-between gap-2 rounded-2 border border-stroke-2 px-3 py-2 text-sm text-fg-1 transition-colors duration-token ease-token hover:bg-surface-3"
                          data-testid="bug-detail-origin-run-link"
                          title={origin.runId}
                        >
                          <span className="font-mono text-xs">{shortBugId(origin.runId)}</span>
                          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                        </Link>
                      )}
                      {origin.failedStepNumber !== undefined && (
                        <p className="text-sm text-fg-2" data-testid="bug-detail-origin-failed-step">
                          {`Failed at step ${origin.failedStepNumber} of ${origin.atcTitle ?? 'the ATC'}`}
                        </p>
                      )}
                    </div>
                  )
                : (
                    <div className="flex items-start gap-2 rounded-2 border border-stroke-2 bg-surface-1 px-3 py-2 text-sm text-fg-2" data-testid="bug-detail-origin-manual">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>Filed manually. This defect was reported directly — no test run or ATC is linked.</span>
                    </div>
                  )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, suffix, ...rest }: { label: string, value: string, suffix?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex items-center justify-between gap-2" {...rest}>
      <dt className="text-fg-3">{label}</dt>
      <dd className="flex items-center gap-1.5 text-right text-fg-1">
        {value}
        {suffix && (
          <span className="status-chip" data-status="skipped">{suffix}</span>
        )}
      </dd>
    </div>
  );
}

// Same tone mapping `lib/bugs/list-view.ts` already uses — kept local rather
// than imported so this component reads its tokens from the same place its
// own severity/status labels come from (`lib/bugs/detail-view.ts`), without
// pulling in the list's row-formatting concerns.
function severityToken(severity: string): string {
  switch (severity) {
    case 'P1': return 'fail';
    case 'P2': return 'blocked';
    case 'P3': return 'running';
    default: return 'skipped';
  }
}

function statusToken(status: string): string {
  switch (status) {
    case 'open': return 'fail';
    case 'in_progress': return 'running';
    case 'resolved': return 'pass';
    default: return 'skipped';
  }
}

function formatFiledDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) { return createdAt; }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
