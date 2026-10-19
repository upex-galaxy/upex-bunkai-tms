import type { PlanOutcome, PlanProgressSummary } from '@lib/test-plans/progress-view';
import { Card } from '@components/ui/card';
import { buildProgressView, chipToken, miniBarLabel } from '@lib/test-plans/progress-view';
import { LineChart } from 'lucide-react';

// BK-204 — the plan's progress, in two sizes. Both read ONE summary object from
// `bunkai_plan_progress` / `bunkai_plans_progress` (0094_plan_progress.sql) and never
// recompute the percentage, so the detail strip and the list mini bar cannot disagree.
//
// Built from the live grammar, not copied from the mockup (Critical Rule #14): the
// `.status-chip` / `.dot` tokens and the 4px segmented bar `RunHistoryView` already
// renders, laid out like `plan-detail.html`'s progress card (percentage block, bar,
// legend). Chips are display-only: no handler, no hover affordance (ratified on
// BK-204, 2026-10-18; master-design-plan D45).

const SEGMENT_CLASS: Record<PlanOutcome, string> = {
  passed: 'bg-signal-pass',
  failed: 'bg-signal-fail',
  aborted: 'bg-signal-blocked',
  in_progress: 'bg-signal-running',
  not_run: 'bg-signal-skipped',
};

// Shown in place of the progress card when the progress read failed.
export function TestPlanProgressUnavailable() {
  return (
    <Card>
      <div
        data-testid="test-plan-progress-unavailable"
        role="status"
        className="flex items-center gap-2 px-4 py-4 text-sm text-fg-3"
      >
        <LineChart size={16} className="shrink-0" />
        Progress unavailable
      </div>
    </Card>
  );
}

export function TestPlanProgress({ summary }: { summary: PlanProgressSummary }) {
  const view = buildProgressView(summary);

  if (view.state === 'empty') {
    return (
      <Card>
        <div
          data-testid="test-plan-progress-empty"
          className="flex items-center gap-2 px-4 py-4 text-sm text-fg-3"
        >
          <LineChart size={16} className="shrink-0" />
          No progress yet — it appears once the plan has member tests.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div data-testid="test-plan-progress" className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
        <div className="flex min-w-[120px] flex-none flex-col gap-0.5">
          <span data-testid="test-plan-progress-percent" className="font-mono text-4xl font-medium leading-none text-fg-0">
            {view.percentLabel}
          </span>
          <span data-testid="test-plan-progress-passed" className="text-xs font-medium uppercase tracking-[0.06em] text-fg-3">
            {view.passedLabel}
          </span>
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          <span
            role="img"
            aria-label={view.ariaLabel}
            data-testid="test-plan-progress-bar"
            className="flex h-1 overflow-hidden rounded-1 bg-surface-4"
          >
            {view.segments.map(segment => (
              <span
                key={segment.outcome}
                data-testid={`test-plan-progress-segment-${segment.outcome}`}
                title={`${segment.count} ${segment.outcome.replace('_', ' ')}`}
                className={`h-full ${SEGMENT_CLASS[segment.outcome]}`}
                style={{ width: `${segment.widthPct}%` }}
              />
            ))}
          </span>
          <div className="flex flex-wrap gap-2">
            {view.legend.map(item => (
              <span
                key={item.outcome}
                data-testid={`test-plan-progress-chip-${item.outcome}`}
                className="status-chip"
                data-status={chipToken(item.outcome)}
              >
                <span className="dot" data-status={chipToken(item.outcome)} />
                {item.label}
                <span className="font-mono font-semibold">{item.count}</span>
              </span>
            ))}
          </div>
          <span className="text-xs text-fg-3">
            Computed from the latest run outcome of each member test · refreshed on view.
          </span>
        </div>
      </div>
    </Card>
  );
}

// The list's miniature of the same bar. A plan with no member tests has nothing to
// draw: a dash, like every other empty cell in that table.
// `unavailable` marks a failed progress read, so it is not mistaken for an empty plan.
export function PlanMiniBar({ planId, summary, unavailable = false }: { planId: string, summary: PlanProgressSummary | null, unavailable?: boolean }) {
  if (unavailable && summary === null) {
    return (
      <span
        data-testid={`test-plan-mini-bar-unavailable-${planId}`}
        role="img"
        aria-label="Progress unavailable"
        title="Progress unavailable"
        className="text-sm text-fg-4"
      >
        —
      </span>
    );
  }
  if (summary === null || summary.member_count === 0) {
    return <span data-testid={`test-plan-mini-bar-empty-${planId}`} className="text-sm text-fg-4">—</span>;
  }
  const view = buildProgressView(summary);

  return (
    <span data-testid={`test-plan-mini-bar-${planId}`} className="inline-flex items-center gap-2">
      <span
        role="img"
        aria-label={view.ariaLabel}
        className="flex h-1 w-[72px] overflow-hidden rounded-1 bg-surface-4"
      >
        {view.segments.map(segment => (
          <span
            key={segment.outcome}
            className={`h-full ${SEGMENT_CLASS[segment.outcome]}`}
            style={{ width: `${segment.widthPct}%` }}
          />
        ))}
      </span>
      <span className="font-mono text-xs text-fg-2">{miniBarLabel(summary)}</span>
    </span>
  );
}
