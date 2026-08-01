import type { RecoveryCycleReport, RecoveryCycleReportItem } from '@lib/metrics/recovery-cycle';
import { Card } from '@components/ui/card';
import { formatCycleDuration } from '@lib/metrics/recovery-cycle';
import { CheckCircle2 } from 'lucide-react';

// BK-47 — the project-wide recovery-cycle view: renders the mockup
// (`bk-44-metrics-coverage/metrics-dashboard.html`, `#cycle-time-table` +
// `#kpi-median-cycle`) with the LIVE design system's tokens and atoms
// (Critical Rule #14) — `.status-chip[data-status]` / `.dot[data-status]`,
// `Card`, the same server-fetched-once shape `ProjectCoverageView`
// (BK-46, this same screen) already established: the whole payload is
// small and bounded, computed ONCE per render (Decision 6), no client-side
// re-fetch or live-ticking after mount.
//
// Two Live-UI-First scope trims vs. the raw mockup (Rule #15 — logged here,
// not silent):
//   1. Timestamps render as `YYYY-MM-DD HH:MM` (ISO-slice), not the
//      mockup's locale-formatted "Jul 18, 09:12" — `toLocaleDateString`
//      differs between the server's Node.js locale and the browser's,
//      which is a real hydration-mismatch risk this codebase already
//      avoids everywhere else (see `formatRanAt` in
//      `RunHistoryView.tsx`/`ProjectRunsReportView.tsx`, the established
//      precedent this file copies).
//   2. No dedicated `.kpi-label`/`.kpi-value` CSS exists live (the mockup's
//      own classes were never ported) and no component uses them — the KPI
//      card below is built from `Card` + the same Tailwind text-token scale
//      `ProjectCoverageView.tsx` already uses throughout, not new global CSS
//      for a single caller.
//
// The "error+retry" state (Step 5 of the plan) has no interactive retry
// affordance, matching `ProjectCoverageView`'s own established precedent for
// this exact page ("no client-side retry path... a hard reload is the only
// recovery") — the copy below says so explicitly rather than rendering a
// button with no handler.

interface RecoveryCycleSectionProps {
  initialPayload: RecoveryCycleReport | null
  initialError?: string | null
}

export function RecoveryCycleSection({ initialPayload, initialError }: RecoveryCycleSectionProps) {
  if (initialError !== null && initialError !== undefined) {
    return (
      <div data-testid="recovery-cycle-error" className="flex flex-1 flex-col items-start gap-3 overflow-hidden p-4">
        <p className="text-sm text-fg-2">
          {initialError}
          {' '}
          Reload the page to try again.
        </p>
      </div>
    );
  }

  const report = initialPayload;
  if (!report) {
    return (
      <div data-testid="recovery-cycle-error" className="flex flex-1 flex-col items-start gap-3 overflow-hidden p-4">
        <p className="text-sm text-fg-2">Could not load the recovery-cycle report. Reload the page to try again.</p>
      </div>
    );
  }

  if (report.story_count === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <Card>
          <div data-testid="recovery-cycle-empty" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <CheckCircle2 size={18} className="text-fg-3" />
            <span className="text-sm text-fg-3">No stories with run history yet.</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="recovery-cycle-section" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">

          <MedianCycleKpi report={report} />

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke-2 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-fg-0">Recovery cycle by user story</div>
                <div className="text-xs text-fg-3">Elapsed time from first failing run to first fully-passing run</div>
              </div>
              <span className="text-xs text-fg-3" data-testid="recovery-cycle-filter-meta" aria-live="polite">
                <span className="font-mono font-semibold text-fg-0">{report.story_count}</span>
                {' '}
                stories with run history
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['User story', 'Module', 'First fail', 'First green', 'Cycle', 'State'].map(column => (
                      <th
                        key={column}
                        scope="col"
                        className="whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="recovery-cycle-rows">
                  {report.items.map(item => <RecoveryCycleRow key={item.user_story_id} item={item} />)}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke-2 px-4 py-2.5 text-xs text-fg-3">
              <span>&quot;So far&quot; durations measure from first fail to now: an open cycle, not a final number.</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MedianCycleKpi({ report }: { report: RecoveryCycleReport }) {
  const hasResolvedCycles = report.resolved_cycle_count > 0;
  return (
    <Card data-testid="recovery-cycle-kpi-median" className="flex flex-col gap-1 px-4 py-3">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-3">Median recovery cycle</span>
      {hasResolvedCycles
        ? (
            <>
              <span className="font-mono text-lg font-semibold text-fg-0">
                {formatCycleDuration(report.median_recovery_seconds)}
              </span>
              <span className="text-xs text-fg-3">
                <span className="font-mono">{report.resolved_cycle_count}</span>
                {' '}
                resolved
                {report.resolved_cycle_count === 1 ? ' cycle' : ' cycles'}
                {' '}
                · first fail → first green
              </span>
            </>
          )
        : (
            <span className="text-xs text-fg-3" data-testid="recovery-cycle-kpi-median-empty">
              No resolved cycles yet — no story has recovered from a failing run.
            </span>
          )}
    </Card>
  );
}

const STATE_CHIP: Record<RecoveryCycleReportItem['state'], { label: string, status: 'pass' | 'running' | 'skipped', dot: boolean }> = {
  recovered: { label: 'Recovered', status: 'pass', dot: false },
  in_progress: { label: 'Not yet green', status: 'running', dot: true },
  no_cycle: { label: 'No cycle · never failed', status: 'skipped', dot: false },
};

function RecoveryCycleRow({ item }: { item: RecoveryCycleReportItem }) {
  const chip = STATE_CHIP[item.state];
  return (
    <tr data-testid={`recovery-cycle-row-${item.user_story_id}`} className="transition-colors duration-token ease-token hover:bg-surface-3">
      <td className="border-t border-stroke-1 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {item.external_id !== null && (
            <span className="font-mono text-xs text-fg-3">{item.external_id}</span>
          )}
          <span className="text-sm font-medium text-fg-1">{item.title}</span>
        </div>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="text-xs text-fg-2">{item.module_path}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        {item.first_fail_at
          ? <span className="font-mono text-xs text-fg-2">{formatTimestamp(item.first_fail_at)}</span>
          : <span className="text-xs text-fg-4" aria-label="Never failed">—</span>}
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        {item.first_green_at
          ? <span className="font-mono text-xs text-fg-2">{formatTimestamp(item.first_green_at)}</span>
          // `first_green_at` is null for BOTH `in_progress` (genuinely no
          // passing run yet) and `no_cycle` (never failed, so "first green
          // after a fail" has no meaning — the story may well have plenty of
          // passing runs). Reusing one label for both was the Stage 3 MAJOR:
          // a healthy, always-green story would have read as "no passing run
          // yet," which is false.
          : (
              <span className="text-xs text-fg-4" aria-label={item.state === 'no_cycle' ? 'No cycle — story never failed' : 'No passing run yet'}>
                —
              </span>
            )}
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        {item.cycle_seconds === null
          ? <span className="text-xs text-fg-4" aria-label="No cycle to measure">—</span>
          : (
              <span className="font-mono text-xs text-fg-2">
                {formatCycleDuration(item.cycle_seconds)}
                {item.state === 'in_progress' ? ' so far' : ''}
              </span>
            )}
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="status-chip inline-flex items-center gap-1" data-status={chip.status}>
          {chip.dot && <span className="dot" data-status={chip.status} />}
          {chip.label}
        </span>
      </td>
    </tr>
  );
}

// Timezone-stable, hydration-safe formatting (see the file header comment) —
// '2026-07-29T11:52:00+00:00' -> '2026-07-29 11:52'. Copied verbatim from
// `RunHistoryView.tsx`'s `formatRanAt` rather than shared, matching this
// repo's existing convention of a small per-component copy over a premature
// shared abstraction for a two-line formatter.
function formatTimestamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function RecoveryCycleSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <span className="h-16 w-64 animate-status-pulse rounded-2 bg-surface-3" />
        <Card className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3, 4].map(row => (
            <span key={row} className="h-4 animate-status-pulse rounded-1 bg-surface-3" style={{ width: `${80 - row * 8}%` }} />
          ))}
        </Card>
      </div>
    </div>
  );
}
