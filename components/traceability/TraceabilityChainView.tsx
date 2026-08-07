'use client';

import type { StoryTraceabilityPayload, TraceabilityAtc, TraceabilityCriterion } from '@lib/traceability/chain-view';
import { Card } from '@components/ui/card';
import {
  CHAIN_PLACEHOLDER_COPY,
  defectCellPlaceholder,
  isAcUncovered,
  resolveAtcRowState,
  resolveStoryChainViewState,
  runCellPlaceholder,
  runChipLabel,
  runChipTone,
  storyRollupCounts,
  testCellCopy,
  UNCOVERED_LABEL,
  UNCOVERED_WHY,
  ZERO_AC_BODY,
  ZERO_AC_TITLE,
  ZERO_COVERAGE_HEADING,
  zeroCoverageBody,
} from '@lib/traceability/chain-view';
import { AlertTriangle, Clock, FileText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// BK-45 — the US -> AC -> ATC -> Test -> Run -> Defect evidence chain view.
// Renders the mockup (`bk-44-metrics-coverage/traceability-chain.html`) with
// the LIVE design system's tokens and atoms (Critical Rule #14) —
// `.status-chip[data-status]`, `Card`, the skeleton/error grammar
// `ProjectRunsReportView`/`ProjectCoverageView` already established.
//
// Scope trim vs. the mockup (Critical Rule #15 — logged, not silent): omits
// the filter bar (result/module/date-range), the active-filter-summary, and
// the Export snapshot button — all BK-48/BK-50. Also omits the mockup's
// hardcoded 4-story segmented picker: no AC in this story describes
// browsing/switching stories from inside the view (every AC scenario begins
// "navigates to the traceability view for THAT user story" — arrival is via
// deep link). See the Stage 1 plan for the full rationale. Renders the 6
// in-scope states: full chain, partial/mixed, zero-coverage banner, zero-AC,
// loading skeleton, error+retry — plus the archived-story banner (AC-06,
// PO-ratified, part of "full chain" rendering, not a separate top-level
// state).

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

const FALLBACK_ERROR_MESSAGE = 'Could not load the evidence chain.';

async function fetchChain(
  projectId: string,
  userStoryId: string,
  signal: AbortSignal,
): Promise<{ ok: true, payload: StoryTraceabilityPayload } | { ok: false, message: string }> {
  const response = await fetch(`/api/v1/projects/${projectId}/traceability?story=${userStoryId}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    // Server copy is rendered VERBATIM — never rephrased client-side.
    return { ok: false, message: body.error?.message ?? FALLBACK_ERROR_MESSAGE };
  }
  return { ok: true, payload: (await response.json()) as StoryTraceabilityPayload };
}

export interface TraceabilityChainViewProps {
  projectId: string
  userStoryId: string | null
  initialPayload: StoryTraceabilityPayload | null
  initialError?: string | null
}

export function TraceabilityChainView({ projectId, userStoryId, initialPayload, initialError = null }: TraceabilityChainViewProps) {
  const [payload, setPayload] = useState<StoryTraceabilityPayload | null>(initialPayload);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  const retry = useCallback(async () => {
    if (!userStoryId) { return; }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchChain(projectId, userStoryId, controller.signal);
      if (controller.signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPayload(result.payload);
    }
    catch (err) {
      if (controller.signal.aborted) { return; }
      setError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setLoading(false);
      }
    }
  }, [projectId, userStoryId]);

  if (!userStoryId) {
    return (
      <div data-testid="traceability-no-story-selected" className="flex flex-1 flex-col items-center gap-2 p-8 text-center">
        <FileText size={18} className="text-fg-3" />
        <span className="text-md font-semibold text-fg-1">Select a user story</span>
        <span className="max-w-[46ch] text-sm text-fg-3">Open the evidence chain from a user story's link, or from the Metrics dashboard's coverage and recovery-cycle tables.</span>
      </div>
    );
  }

  if (loading) {
    return <TraceabilityChainSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <Card>
          <div data-testid="traceability-error" role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <AlertTriangle size={18} className="text-signal-fail" />
            <span className="text-md font-semibold text-fg-1">Couldn&apos;t load the evidence chain</span>
            <span className="max-w-[46ch] text-sm text-fg-3">{error}</span>
            <button
              type="button"
              data-testid="traceability-retry"
              onClick={() => { void retry(); }}
              className="mt-2 inline-flex h-7 items-center rounded-2 border border-stroke-2 bg-surface-2 px-3 text-xs font-medium text-fg-1 transition-colors duration-token ease-token hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!payload) {
    return <TraceabilityChainSkeleton />;
  }

  const viewState = resolveStoryChainViewState(payload);
  const counts = storyRollupCounts(payload);

  return (
    <div data-testid="traceability-chain-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-4">
          <StoryHead payload={payload} counts={counts} />

          {viewState === 'zero-ac' && (
            <Card>
              <div data-testid="traceability-empty-zero-ac" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <FileText size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{ZERO_AC_TITLE}</span>
                <span className="max-w-[52ch] text-sm text-fg-3">{ZERO_AC_BODY}</span>
              </div>
            </Card>
          )}

          {viewState === 'zero-coverage' && (
            <>
              <div
                data-testid="traceability-zero-coverage-banner"
                className="flex items-start gap-3 rounded-2 border border-stroke-2 bg-signal-fail-bg px-4 py-3 text-sm text-fg-1"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal-fail" />
                <div>
                  <strong className="font-semibold">{ZERO_COVERAGE_HEADING}</strong>
                  {' '}
                  {zeroCoverageBody(payload.criteria.length)}
                </div>
              </div>
              {payload.criteria.map(ac => <AcCard key={ac.id} ac={ac} />)}
            </>
          )}

          {viewState === 'has-chain' && payload.criteria.map(ac => <AcCard key={ac.id} ac={ac} />)}
        </div>
      </div>
    </div>
  );
}

function StoryHead({ payload, counts }: { payload: StoryTraceabilityPayload, counts: ReturnType<typeof storyRollupCounts> }) {
  return (
    <Card>
      <div data-testid="traceability-story-head" className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-sm font-semibold text-fg-0">{payload.story.title}</span>
        <span className="text-xs text-fg-3">
          {counts.acCount}
          {' '}
          ACs ·
          {' '}
          {counts.atcCount}
          {' '}
          ATCs ·
          {' '}
          {counts.testCount}
          {' '}
          tests ·
          {' '}
          {counts.runCount}
          {' '}
          runs ·
          {' '}
          {counts.defectCount}
          {' '}
          defects
        </span>
      </div>
      {payload.story.archived_at !== null && (
        <div
          data-testid="traceability-archived-banner"
          className="flex items-center gap-2 border-t border-stroke-2 bg-surface-3 px-4 py-2 text-xs text-fg-2"
        >
          <AlertTriangle size={14} className="text-fg-3" />
          This story is archived. The chain below reflects its coverage as of archiving.
        </div>
      )}
    </Card>
  );
}

function AcCard({ ac }: { ac: TraceabilityCriterion }) {
  if (isAcUncovered(ac)) {
    return (
      <Card data-testid={`traceability-ac-${ac.id}`}>
        <div className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-2.5">
          <span className="text-sm font-medium text-fg-1">{ac.title}</span>
          <span className="text-xs text-fg-3">
            0 ATCs
          </span>
        </div>
        <div
          data-testid="uncovered-strip"
          className="flex items-center gap-2 px-4 py-3 text-sm text-signal-fail"
        >
          <AlertTriangle size={14} />
          <span className="font-medium">{UNCOVERED_LABEL}</span>
          <span className="text-fg-2">{UNCOVERED_WHY}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid={`traceability-ac-${ac.id}`} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-2.5">
        <span className="text-sm font-medium text-fg-1">{ac.title}</span>
        <span className="text-xs text-fg-3">
          {ac.atcs.length}
          {' '}
          {ac.atcs.length === 1 ? 'ATC' : 'ATCs'}
        </span>
      </div>
      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-stroke-2 bg-surface-1 px-4 py-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-fg-3 md:grid">
        <span>ATC · layer</span>
        <span>Test</span>
        <span>Latest run</span>
        <span>Defects</span>
      </div>
      <div className="divide-y divide-stroke-1">
        {ac.atcs.map(row => <AtcRow key={row.id} atc={row} />)}
      </div>
    </Card>
  );
}

function AtcRow({ atc }: { atc: TraceabilityAtc }) {
  const rowState = resolveAtcRowState(atc);
  const testCopy = testCellCopy(rowState);
  const runPlaceholder = runCellPlaceholder(rowState);
  const defectPlaceholder = defectCellPlaceholder(rowState, atc.defects.length);

  return (
    <div
      data-testid={`traceability-atc-row-${atc.id}`}
      className="grid grid-cols-1 gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-3"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-fg-3">{atc.slug}</span>
          <span className="status-chip" data-status="skipped">{atc.layer}</span>
        </div>
        <div className="truncate text-fg-1">{atc.title}</div>
      </div>

      <div className="min-w-0">
        {testCopy
          ? <PlaceholderPill text={testCopy} />
          : <span className="truncate text-fg-2">{atc.test?.title}</span>}
      </div>

      <div className="min-w-0">
        {runPlaceholder
          ? <PlaceholderPill text={runPlaceholder} />
          : atc.latest_run && (
            <span className="status-chip" data-status={runChipTone(atc.latest_run)}>
              {runChipLabel(atc.latest_run)}
            </span>
          )}
      </div>

      <div className="min-w-0">
        {defectPlaceholder
          ? (
              <span className="text-xs text-fg-3">{defectPlaceholder}</span>
            )
          : (
              <div className="flex flex-col gap-1">
                {atc.defects.map(d => (
                  <div key={d.id} className="flex items-center gap-1.5 text-xs">
                    <span className="truncate text-fg-2">{d.title}</span>
                    <span className="status-chip shrink-0" data-status={d.status === 'resolved' || d.status === 'closed' ? 'pass' : 'fail'}>
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}

function PlaceholderPill({ text }: { text: string }) {
  return (
    <span
      data-testid="chain-placeholder-pill"
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-stroke-2 px-2 py-0.5 text-2xs text-fg-3"
    >
      <Clock size={11} />
      {text}
    </span>
  );
}

export function TraceabilityChainSkeleton() {
  return (
    <div data-testid="traceability-loading" className="flex flex-1 flex-col overflow-hidden p-4" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <Card className="flex flex-col gap-2 p-4">
          <span className="h-4 w-64 animate-status-pulse rounded-1 bg-surface-3" />
          <span className="h-3 w-96 animate-status-pulse rounded-1 bg-surface-3" />
        </Card>
        {[0, 1, 2].map(i => (
          <Card key={i} className="flex flex-col gap-2 p-4">
            <span className="h-3.5 w-56 animate-status-pulse rounded-1 bg-surface-3" />
            <span className="h-3 w-full animate-status-pulse rounded-1 bg-surface-3" />
            <span className="h-3 w-4/5 animate-status-pulse rounded-1 bg-surface-3" />
          </Card>
        ))}
      </div>
    </div>
  );
}

export { CHAIN_PLACEHOLDER_COPY };
