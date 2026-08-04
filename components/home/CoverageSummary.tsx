import type { WorkspaceCoverageRollup } from '@lib/home/coverage';
import type { ReactNode } from 'react';
import { Card } from '@components/ui/card';
import { coveragePercent } from '@lib/home/coverage';
import { AlertTriangle } from 'lucide-react';

// BK-259 — Home's "Coverage" stat card (master-design-plan §4.2, `home.jsx`'s
// COVERAGE KPI): how much of the workspace's acceptance criteria has test
// coverage, so a QA Lead can tell a coverage story she trusts without opening
// every project's Metrics screen and adding them up by hand.
//
// The headline is the SAME quantity the project Metrics screen prints as its
// first KPI tile — acceptance criteria with at least one ATC bound, over all
// acceptance criteria — summed across the workspace's projects. What "bound",
// "never run" and "executed" mean is decided once, in the shipped coverage RPC;
// see `lib/home/coverage.ts` for the roll-up rule and why it is AC-weighted.
//
// THE BREAKDOWN IS NOT DECORATION
// -------------------------------
// §4.7 requires "never run" (ATCs bound, zero executions) to read differently
// from "no coverage" (nothing bound at all), and this card is where the two are
// easiest to blur: a single percentage that counts a bound-but-never-executed
// acceptance criterion as covered will read as "verified" to everyone who
// glances at it. So the three states always ship together, each with the tone
// the project Metrics screen already gives it — executed `pass`, bound-never-run
// `skipped`, unbound `fail` — and each chip spells out its own word, so the
// distinction survives greyscale, a screenshot, and a red-green deficiency.
//
// Departures from the mockup, both deliberate:
//   * NO delta. The mockup's KPI reads "+4.2 vs last sprint". Nothing in this
//     product can source that: `atc_acceptance_criteria` carries no timestamp
//     (so which ATCs were bound to which acceptance criteria at any past
//     instant is unrecoverable), `run_atcs` carries neither a timestamp nor
//     execution history (only each row's CURRENT status), and no coverage
//     snapshot is stored anywhere. Computing a "prior period" figure would mean
//     applying TODAY's bindings to yesterday's executions and presenting the
//     result as history — a number that looks authoritative and is not. The
//     card therefore prints no trend rather than an invented one. Recorded as
//     master-design-plan §5 D24, and it is the story's AC2 gap.
//     (There is no Sprint entity either — §5 D20 struck it — so even a
//     sourceable delta could not be "vs last sprint".)
//   * NOT one cell of a 4-up KPI grid. Same call BK-258's card made and for the
//     same reason: of the mockup's four KPI cards only two have stories, so a
//     four-column grid today means two empty cells or two invented metrics. The
//     card ships full-width in Home's single-column stack, directly under the
//     open-bugs card in the KPI row's position.

interface CoverageSummaryCardProps {
  rollup: WorkspaceCoverageRollup
}

export function CoverageSummaryCard({ rollup }: CoverageSummaryCardProps) {
  const percent = coveragePercent(rollup.acBound, rollup.acTotal);

  // `null` means the workspace has no acceptance criteria at all — nothing to
  // measure, which is not the same as measuring zero. It renders an em dash and
  // says so, exactly as the project Metrics screen's `percentLabel` does,
  // instead of a "0%" that would read as a failing workspace.
  if (percent === null) {
    return (
      <CoverageSummaryShell
        primary={(
          <>
            <span
              data-testid="home-coverage-percent"
              className="font-mono text-[28px] font-bold leading-none tracking-[-0.02em] text-fg-3"
            >
              —
            </span>
            <span data-testid="home-coverage-empty" className="max-w-[64ch] text-2xs text-fg-4">
              No acceptance criteria to measure yet. Coverage appears once a project
              has user stories with acceptance criteria under them.
            </span>
          </>
        )}
        aside={null}
      />
    );
  }

  return (
    <CoverageSummaryShell
      primary={(
        <>
          <span
            data-testid="home-coverage-percent"
            className="font-mono text-[28px] font-bold leading-none tracking-[-0.02em] text-fg-0"
          >
            {percent}
            %
          </span>
          <span className="max-w-[64ch] text-2xs text-fg-4">
            {`of ${rollup.acTotal} acceptance criteria across this workspace have at least one test case bound.`}
          </span>
        </>
      )}
      aside={(
        <ul
          data-testid="home-coverage-breakdown"
          className="m-0 flex flex-wrap items-center gap-1.5 p-0"
        >
          <li>
            <span
              data-testid="home-coverage-executed"
              className="status-chip"
              data-status="pass"
              title={`${rollup.acExecuted} acceptance criteria have test coverage that has actually been executed`}
            >
              <span className="font-mono font-semibold">{rollup.acExecuted}</span>
              executed
            </span>
          </li>
          <li>
            <span
              data-testid="home-coverage-not-run"
              className="status-chip"
              data-status="skipped"
              title={`${rollup.acNotRun} acceptance criteria have test cases bound but at least one of them has never been run`}
            >
              <span className="font-mono font-semibold">{rollup.acNotRun}</span>
              bound, never run
            </span>
          </li>
          <li>
            <span
              data-testid="home-coverage-uncovered"
              className="status-chip"
              data-status="fail"
              title={`${rollup.acUncovered} acceptance criteria have no test case bound at all`}
            >
              <span className="font-mono font-semibold">{rollup.acUncovered}</span>
              no coverage
            </span>
          </li>
        </ul>
      )}
    />
  );
}

// A read that failed gets its own state, never a percentage. A coverage figure
// computed over a partial read is the worst possible version of this card: it
// looks exactly like a real one. Same line the Home banner (BK-255), recent
// projects (BK-257), active runs (BK-256) and open bugs (BK-258) draw.
export function CoverageSummaryError() {
  return (
    <CoverageSummaryShell
      primary={(
        <span
          data-testid="home-coverage-error"
          className="flex items-start gap-2 text-sm text-fg-3"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-signal-fail" />
          <span className="max-w-[52ch]">
            This workspace&apos;s test coverage could not be measured just now. Reload
            the page to try again — nothing has been changed.
          </span>
        </span>
      )}
      aside={null}
    />
  );
}

// Suspense fallback. Same `animate-status-pulse` treatment the sibling widgets
// use, sized to the percentage and the three chips so the page does not jump
// when the real figures arrive.
export function CoverageSummarySkeleton() {
  return (
    <CoverageSummaryShell
      primary={(
        <span data-testid="home-coverage-skeleton" className="flex flex-col gap-2" aria-hidden="true">
          <span className="h-7 w-16 animate-status-pulse rounded-1 bg-surface-3" />
          <span className="h-3 w-72 animate-status-pulse rounded-1 bg-surface-3" />
        </span>
      )}
      aside={(
        <span aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
          <span className="h-[18px] w-24 animate-status-pulse rounded-1 bg-surface-3" />
          <span className="h-[18px] w-32 animate-status-pulse rounded-1 bg-surface-3" />
          <span className="h-[18px] w-28 animate-status-pulse rounded-1 bg-surface-3" />
        </span>
      )}
    />
  );
}

// The card, shared by every state so the section title and the layout stay put
// whichever body renders underneath — the shape `OpenBugs.tsx` established for
// the KPI row directly above this one. `primary` holds the percentage (or
// whatever stands in for it), `aside` the three-way breakdown.
function CoverageSummaryShell({ primary, aside }: { primary: ReactNode, aside: ReactNode }) {
  return (
    <section data-testid="home-coverage" aria-labelledby="home-coverage-title">
      <Card className="flex flex-col gap-4 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h2
            id="home-coverage-title"
            className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-3"
          >
            Coverage
          </h2>
          {primary}
        </div>
        {aside}
      </Card>
    </section>
  );
}
