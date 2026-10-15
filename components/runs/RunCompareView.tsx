'use client';

import type { CompareAbortNotice, CompareGroupBlock, CompareRow, CompareRunHeader, RunComparison } from '@lib/runs/compare-view';
import type { LucideIcon } from 'lucide-react';
import { Button, buttonVariants } from '@components/ui/button';
import { Card } from '@components/ui/card';
import {
  buildAbortNotices,
  buildCountItems,
  buildGroupBlocks,
  COMPARE_LOAD_ERROR,
  COMPARE_NO_COMMON_STEPS,
  COMPARE_NOTHING_CHANGED,
  COMPARE_REWORDED_NOTE,
  durationText,
  executorLabel,
  parseRunComparison,
  resolveCompareViewState,
  rowOutcomeText,
  runChipToken,
  runHref,
  runOutcomeWord,
  sharedStepsLine,
  shortRunId,
  shouldShowNoCommonSteps,
  shouldShowNothingChanged,
  startedLine,
  stepChipToken,
  stepStatusWord,
  testHistoryHref,
} from '@lib/runs/compare-view';
import { Bot, ChevronLeft, GitCompareArrows, History, RefreshCw, Server, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// BK-442 — the Run comparison page body: "Previous run" and "This run" cards, then
// either a plain statement (no earlier run, in progress, cannot be compared
// reliably, load error) or the five counts plus Added and Removed and the grouped
// rows. A spec-only screen (master-design-plan §4.19 / D42): it is built from the
// LIVE atoms (Card, `.status-chip`, `buttonVariants`) and the BK-37 states, not from
// a mockup, and carries no write control.
//
// The first read happens SERVER-side in `compare/page.tsx` and arrives as
// `initialComparison` / `initialError`; Retry re-reads through
// `GET /api/v1/runs/{id}/compare`, the same function the page already called. A
// Run's comparison is static once the Run is terminal, so there is no polling and
// no Realtime here.
//
// Every sentence comes from `lib/runs/compare-view.ts`; the rules (which step is a
// new failure, which Run is the Previous run) come from the database function and
// are never recomputed in this component.

const EXECUTOR_ICON: Record<string, LucideIcon> = { human: User, agent: Bot, ci: Server };

interface RunCompareViewProps {
  projectSlug: string
  runId: string
  initialComparison: RunComparison | null
  initialError?: string | null
}

export function RunCompareView({ projectSlug, runId, initialComparison, initialError = null }: RunCompareViewProps) {
  const [comparison, setComparison] = useState<RunComparison | null>(initialComparison);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  const retry = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/runs/${runId}/compare`);
      if (!response.ok) {
        // One copy for every failed load (first read and every Retry): the status and
        // the server's own message are for the log, not for a screen that would
        // otherwise change its wording between attempts.
        setError(COMPARE_LOAD_ERROR);
        return;
      }
      const parsed = parseRunComparison(await response.json());
      if (parsed === null) {
        setError(COMPARE_LOAD_ERROR);
        return;
      }
      setComparison(parsed);
      setError(null);
    }
    catch {
      setError(COMPARE_LOAD_ERROR);
    }
    finally {
      setLoading(false);
    }
  };

  const state = resolveCompareViewState({ comparison, error });
  const title = comparison?.test.title ?? 'Run comparison';

  return (
    <div data-testid="run-compare-view" className="flex flex-1 flex-col overflow-hidden bg-surface-1">
      <div className="flex h-9 flex-shrink-0 items-center border-b border-stroke-1 px-4">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-2">
          <Link
            href={runHref(projectSlug, runId)}
            data-testid="run-compare-back"
            aria-label="Back to this run"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
            title="Back to this run"
          >
            <ChevronLeft size={13} />
          </Link>
          <GitCompareArrows size={13} className="shrink-0 text-fg-3" />
          <span className="shrink-0 text-xs text-fg-3">Compare</span>
          <span className="shrink-0 text-xs text-fg-4">/</span>
          <h1 data-testid="run-compare-title" className="min-w-0 truncate text-sm font-semibold text-fg-0">{title}</h1>
          {comparison !== null && (
            <Link
              href={testHistoryHref(projectSlug, comparison.test.id)}
              data-testid="run-compare-history-link"
              className={`${buttonVariants({ size: 'sm' })} ml-auto shrink-0`}
            >
              <History size={11} />
              Test run history
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          {comparison !== null && (
            <div className="grid gap-3 sm:grid-cols-2">
              <RunCard testId="previous" label="Previous run" header={comparison.previous} projectSlug={projectSlug} />
              <RunCard testId="this" label="This run" header={comparison.run} projectSlug={projectSlug} />
            </div>
          )}

          {state.kind === 'error' && (
            <Card className="overflow-hidden">
              <div data-testid="run-compare-error" className="flex flex-col items-start gap-3 p-4">
                <p className="text-sm text-fg-2">{state.message}</p>
                <Button type="button" size="sm" data-testid="run-compare-retry" disabled={loading} onClick={() => { void retry(); }}>
                  <RefreshCw size={13} />
                  {loading ? 'Retrying…' : 'Retry'}
                </Button>
              </div>
            </Card>
          )}

          {(state.kind === 'no_previous' || state.kind === 'in_progress' || state.kind === 'unreliable') && (
            <Card className="overflow-hidden">
              <div data-testid={`run-compare-${state.kind.replace('_', '-')}`} className="flex flex-col gap-1 p-4">
                <p className="text-sm font-medium text-fg-1">{state.message}</p>
                {state.kind === 'no_previous' && <p className="text-sm text-fg-3">{state.note}</p>}
                {state.kind === 'unreliable' && <p className="text-sm text-fg-3">{state.detail}</p>}
              </div>
            </Card>
          )}

          {state.kind === 'compared' && comparison !== null && comparison.counts !== undefined && (
            <ComparedBody comparison={comparison} counts={comparison.counts} rows={comparison.rows ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

function RunCard({ testId, label, header, projectSlug }: { testId: 'previous' | 'this', label: string, header: CompareRunHeader | null, projectSlug: string }) {
  if (header === null) {
    return (
      <Card data-testid={`run-compare-card-${testId}`} className="flex flex-col gap-1 p-3">
        <span className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">{label}</span>
        <span className="text-sm text-fg-3">None</span>
      </Card>
    );
  }
  const ExecutorIcon = EXECUTOR_ICON[header.executor_mode] ?? User;
  return (
    <Card data-testid={`run-compare-card-${testId}`} className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">{label}</span>
        <Link
          href={runHref(projectSlug, header.id)}
          data-testid={`run-compare-card-${testId}-id`}
          title={header.id}
          className="ml-auto font-mono text-xs font-medium text-fg-0 hover:underline"
        >
          {shortRunId(header.id)}
        </Link>
      </div>
      <span data-testid={`run-compare-card-${testId}-started`} className="font-mono text-xs text-fg-2">{startedLine(header)}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
        <span data-testid={`run-compare-card-${testId}-duration`} className="font-mono text-xs">{durationText(header)}</span>
        <span className="inline-flex items-center rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-3">
          {header.environment_name ?? 'unknown env'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-1">
          <ExecutorIcon size={13} className="shrink-0 text-fg-2" />
          {executorLabel(header.executor_mode)}
        </span>
        <span data-testid={`run-compare-card-${testId}-outcome`} className="status-chip" data-status={runChipToken(header.status)}>
          {runOutcomeWord(header.status)}
        </span>
      </div>
    </Card>
  );
}

function ComparedBody({ comparison, counts, rows }: { comparison: RunComparison, counts: NonNullable<RunComparison['counts']>, rows: CompareRow[] }) {
  const notices = buildAbortNotices(comparison);
  const blocks = buildGroupBlocks(rows);
  return (
    <>
      {notices.map(notice => <AbortNotice key={notice.side} notice={notice} />)}

      <Card data-testid="run-compare-counts" className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {buildCountItems(counts).map(item => (
            <div
              key={item.group}
              data-testid={`run-compare-count-${item.group}`}
              className="flex flex-col gap-0.5 rounded-2 border border-stroke-1 bg-surface-1 px-2.5 py-1.5"
            >
              <span className="font-mono text-lg font-semibold text-fg-0">{item.value}</span>
              <span className="text-2xs text-fg-3">{item.label}</span>
            </div>
          ))}
        </div>
        <span data-testid="run-compare-shared" className="text-sm text-fg-3">{sharedStepsLine(counts.shared)}</span>
        {shouldShowNothingChanged(comparison) && (
          <p data-testid="run-compare-nothing-changed" className="text-sm font-medium text-fg-1">{COMPARE_NOTHING_CHANGED}</p>
        )}
        {shouldShowNoCommonSteps(comparison) && (
          <p data-testid="run-compare-no-common" className="text-sm font-medium text-fg-1">{COMPARE_NO_COMMON_STEPS}</p>
        )}
      </Card>

      {blocks.map(block => <GroupBlock key={block.group} block={block} />)}
    </>
  );
}

function AbortNotice({ notice }: { notice: CompareAbortNotice }) {
  return (
    <Card data-testid={`run-compare-aborted-${notice.side}`} className="flex flex-col gap-0.5 p-3">
      <span className="text-sm font-medium text-fg-1">{notice.headline}</span>
      {notice.unreached !== null && <span className="text-sm text-fg-2">{notice.unreached}</span>}
      {notice.reason !== null && <span className="break-words text-sm text-fg-3">{notice.reason}</span>}
    </Card>
  );
}

function GroupBlock({ block }: { block: CompareGroupBlock }) {
  const body = (
    <>
      {block.showRewordedNote && (
        <p data-testid={`run-compare-reworded-${block.group}`} className="px-3 pb-2 text-xs text-fg-3">{COMPARE_REWORDED_NOTE}</p>
      )}
      <ul data-testid={`run-compare-rows-${block.group}`} className="flex flex-col">
        {block.rows.map(row => <StepRow key={`${row.step_id ?? 'x'}-${row.previous_step_id ?? 'x'}`} row={row} />)}
      </ul>
    </>
  );
  // A real heading (level 2, under the page's h1), with the row count inside it.
  const heading = (
    <h2 data-testid={`run-compare-heading-${block.group}`} className="flex items-center gap-2 text-sm font-semibold text-fg-0">
      <span>{block.label}</span>
      <span className="font-mono text-xs font-normal text-fg-3">{block.rows.length}</span>
    </h2>
  );

  // Unchanged passes starts collapsed: those need no attention. Every other group
  // is open, in the fixed order the PO ratified.
  if (block.collapsed) {
    return (
      <Card data-testid={`run-compare-group-${block.group}`} className="overflow-hidden">
        <details>
          <summary className="cursor-pointer px-3 py-2">{heading}</summary>
          {body}
        </details>
      </Card>
    );
  }
  return (
    <Card data-testid={`run-compare-group-${block.group}`} className="overflow-hidden">
      <div className="px-3 py-2">{heading}</div>
      {body}
    </Card>
  );
}

function StepRow({ row }: { row: CompareRow }) {
  // Removed rows show the Previous run's outcome, every other row This run's. A
  // chip with a text label always travels with the words: no meaning by colour alone.
  const chipStatus = row.group === 'removed' ? row.previous_status : row.status;
  return (
    <li data-testid="run-compare-row" data-group={row.group} className="flex items-start gap-2.5 border-t border-stroke-1 px-3 py-2">
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 font-mono text-2xs font-medium text-fg-3">
        {String(row.atc_position).padStart(2, '0')}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs text-fg-3">{row.atc_title}</span>
        <span className="break-words text-[13px] text-fg-1">{row.content}</span>
        {row.input_data !== null && <span className="break-words font-mono text-2xs text-fg-3">{`input: ${row.input_data}`}</span>}
        {row.expected !== null && <span className="break-words font-mono text-2xs text-fg-3">{`expected: ${row.expected}`}</span>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {chipStatus !== null && (
          <span className="status-chip" data-status={stepChipToken(chipStatus)}>{stepStatusWord(chipStatus)}</span>
        )}
        <span data-testid="run-compare-row-outcome" className="font-mono text-2xs text-fg-2">{rowOutcomeText(row)}</span>
      </div>
    </li>
  );
}
