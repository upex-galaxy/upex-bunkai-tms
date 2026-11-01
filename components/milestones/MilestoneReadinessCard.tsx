import type { MilestoneReadiness } from '@lib/milestones/readiness-view';
import type { PlanOutcome } from '@lib/test-plans/progress-view';
import { Card } from '@components/ui/card';
import { asProgressSummary, readinessNote, readinessState } from '@lib/milestones/readiness-view';
import { buildProgressView, chipToken } from '@lib/test-plans/progress-view';
import { LineChart } from 'lucide-react';

// BK-206 — the milestone's readiness card (`milestones-board.html` readiness card),
// drawn in the live progress grammar BK-204 ships (`TestPlanProgress`: percentage
// block, 4px segmented bar, legend chips) so a plan and a milestone read the same way.
// The numbers are the database's (`bunkai_milestones_readiness`): pooled counts, floor
// percentage. Never recomputed here.
//
// Three states, kept visibly apart (AC 2.5, 2.7, 5.1, 5.2): no plan attached (an
// invitation, no percentage, no bar), plans attached that hold no tests (no
// percentage either, a different sentence), and a real percentage, 0% included.
// Copy departures from the mockup, ratified in master-design-plan §5: "refreshed on
// view" instead of "recalculated live" (readiness is fetched on view, D1).

const SEGMENT_CLASS: Record<PlanOutcome, string> = {
  passed: 'bg-signal-pass',
  failed: 'bg-signal-fail',
  aborted: 'bg-signal-blocked',
  in_progress: 'bg-signal-running',
  not_run: 'bg-signal-skipped',
};

export function MilestoneReadinessUnavailable() {
  return (
    <Card>
      <div
        data-testid="milestone-readiness-unavailable"
        role="status"
        className="flex items-center gap-2 px-4 py-4 text-sm text-fg-3"
      >
        <LineChart size={16} className="shrink-0" />
        Readiness unavailable
      </div>
    </Card>
  );
}

export function MilestoneReadinessCard({ readiness }: { readiness: MilestoneReadiness }) {
  const state = readinessState(readiness);

  if (state !== 'progress') {
    return (
      <Card>
        <div
          data-testid={state === 'no-plans' ? 'milestone-readiness-empty' : 'milestone-readiness-no-tests'}
          className="flex items-center gap-2 px-4 py-4 text-sm text-fg-3"
        >
          <LineChart size={16} className="shrink-0" />
          {state === 'no-plans'
            ? 'No readiness yet — attach at least one test plan and its progress rolls up here.'
            : 'No readiness yet — the attached test plans have no tests.'}
        </div>
      </Card>
    );
  }

  const view = buildProgressView(asProgressSummary({
    id: readiness.milestone_id,
    member_count: readiness.member_count,
    passed_pct: readiness.passed_pct,
    counts: readiness.counts,
  }));
  const ariaLabel = `Overall readiness ${readiness.passed_pct} percent: ${readiness.counts.passed} of ${readiness.member_count} tests passed`;

  return (
    <Card>
      <div data-testid="milestone-readiness" className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
        <div className="flex min-w-[120px] flex-none flex-col gap-0.5">
          <span data-testid="milestone-readiness-percent" className="font-mono text-4xl font-medium leading-none text-fg-0">
            {view.percentLabel}
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-3">overall readiness</span>
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          <span
            role="img"
            aria-label={ariaLabel}
            data-testid="milestone-readiness-bar"
            className="flex h-1 overflow-hidden rounded-1 bg-surface-4"
          >
            {view.segments.map(segment => (
              <span
                key={segment.outcome}
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
                data-testid={`milestone-readiness-chip-${item.outcome}`}
                className="status-chip"
                data-status={chipToken(item.outcome)}
              >
                <span className="dot" data-status={chipToken(item.outcome)} />
                {item.label}
                <span className="font-mono font-semibold">{item.count}</span>
              </span>
            ))}
          </div>
          <span data-testid="milestone-readiness-note" className="text-xs text-fg-3">
            {readinessNote({ passed: readiness.counts.passed, total: readiness.member_count, planCount: readiness.plan_count })}
          </span>
        </div>
      </div>
    </Card>
  );
}
