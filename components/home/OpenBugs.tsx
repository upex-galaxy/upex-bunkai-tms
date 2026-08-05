import type { BugSeverity } from '@lib/bugs/constants';
import type { OpenBugsRollup } from '@lib/home/open-bugs';
import type { ReactNode } from 'react';
import { Card } from '@components/ui/card';
import { BUG_SEVERITY_LABEL, BUG_SEVERITY_VALUES } from '@lib/bugs/constants';
import { AlertTriangle, CircleCheckBig } from 'lucide-react';

// BK-258 — Home's "Open bugs" stat card (master-design-plan §4.2, `home.jsx`'s
// OPEN BUGS KPI): how many defects are outstanding across the workspace and how
// they sit across P1-P4, so a QA Lead can answer "what does quality look like
// right now" without opening the bug tracker.
//
// Chip grammar is REUSED, not re-derived: the `.status-chip[data-status]` atoms
// in `app/globals.css`, mapped through the same P1->fail / P2->blocked /
// P3->running / P4->skipped tones `BugsListView` (BK-41) already renders its
// severity filters and rows with. Every chip carries BOTH the P-code and its
// word label — severity is never conveyed by colour alone (§4.6's standing
// rule), and the count sits inside the chip so the pairing survives a
// screenshot, a greyscale print, and a red-green deficiency.
//
// The tone map is a local copy rather than an import, matching the precedent
// `BugsListView.tsx` records for the same map and `RunHistoryView.tsx` sets for
// its own: `lib/bugs/list-view.ts` keeps its `BUG_SEVERITY_TOKEN` unexported,
// and widening that module's exports is outside this story's file scope. The
// P-code -> word labels ARE imported (`BUG_SEVERITY_LABEL`), so the vocabulary
// itself has one source.
//
// Departures from the mockup, all deliberate:
//   * NOT one cell of a 4-up KPI grid. The mockup draws four cards (Total ATCs /
//     Active runs / Open bugs / Coverage). Only two of them have stories: this
//     one and BK-259's Coverage. "Total ATCs" has none, and "Active runs" ships
//     as BK-256's full table lower down the page — so a 4-column grid today
//     would mean two empty cells or two invented metrics. The card therefore
//     ships full-width in Home's existing single-column stack, in the KPI row's
//     position directly under the banner.
//   * The breakdown is FOUR chips, not the mockup's "7 P1 · 12 P2 · 14 P3+"
//     hint. AC1 asks for how many open bugs fall into EACH severity; the
//     mockup's sample copy collapses P3 and P4 into one bucket, which cannot
//     answer that. The full width the card gained above is what pays for them.
//   * NO drill-through affordance. The mockup puts an `ArrowUpRight` in the card
//     corner. The bug list is per project (`/projects/{slug}/bugs`) — there is
//     no workspace-wide bugs screen to point at, and this count is
//     workspace-wide, so any single link would land somewhere showing a
//     different number. Same call BK-256 made about its "All runs" button.
//   * NO delta ("+7 vs last sprint"). There is no Sprint entity in this product
//     (§5 D20 struck it from the contract), and nothing snapshots a historical
//     bug count to diff against.

interface OpenBugsCardProps {
  rollup: OpenBugsRollup
}

// Severity -> the live `.status-chip` `data-status` family. Matches the mockup's
// own `data-tone` values on `bug-reports-index.html`'s chip toggles, and
// BugsListView's `SEVERITY_FILTER_TONE`, verbatim.
const SEVERITY_TONE: Record<BugSeverity, string> = {
  P1: 'fail',
  P2: 'blocked',
  P3: 'running',
  P4: 'skipped',
};

export function OpenBugsCard({ rollup }: OpenBugsCardProps) {
  return (
    <OpenBugsShell
      primary={(
        <>
          <span
            data-testid="home-open-bugs-count"
            className="font-mono text-[28px] font-bold leading-none tracking-[-0.02em] text-fg-0"
          >
            {rollup.totalOpen}
          </span>
          <span className="text-2xs text-fg-4">
            Open and in progress, across every project in this workspace.
          </span>
        </>
      )}
      aside={rollup.totalOpen === 0
        ? (
            <span
              data-testid="home-open-bugs-empty"
              className="flex items-center gap-2 text-sm text-fg-3"
            >
              <CircleCheckBig size={15} className="shrink-0 text-fg-3" />
              Nothing outstanding right now.
            </span>
          )
        : (
            <ul
              data-testid="home-open-bugs-severities"
              className="m-0 flex flex-wrap items-center gap-1.5 p-0"
            >
              {BUG_SEVERITY_VALUES.map(severity => (
                <li key={severity}>
                  <span
                    data-testid={`home-open-bugs-severity-${severity}`}
                    className="status-chip"
                    data-status={SEVERITY_TONE[severity]}
                    // The chip already spells out code, label and count, so the
                    // title adds the one thing the layout cannot: what the
                    // number is a count OF.
                    title={`${rollup.bySeverity[severity]} open ${severity} (${BUG_SEVERITY_LABEL[severity]}) bugs`}
                  >
                    <span className="font-mono font-semibold">{severity}</span>
                    {BUG_SEVERITY_LABEL[severity]}
                    <span className="font-mono font-semibold">
                      {rollup.bySeverity[severity]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
    />
  );
}

// A read that failed gets its own state, never a zero. Printing "0 open bugs" to
// a lead whose workspace is full of them is exactly the false all-clear this
// card exists to prevent — the same line the Home banner (BK-255), recent
// projects (BK-257) and active runs (BK-256) draw.
export function OpenBugsError() {
  return (
    <OpenBugsShell
      primary={(
        <span
          data-testid="home-open-bugs-error"
          className="flex items-start gap-2 text-sm text-fg-3"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-signal-fail" />
          <span className="max-w-[52ch]">
            This workspace&apos;s open bugs could not be counted just now. Reload the
            page to try again — nothing has been changed.
          </span>
        </span>
      )}
      aside={null}
    />
  );
}

// Suspense fallback. Same `animate-status-pulse` treatment the sibling widgets
// use, sized to the number and the chip row so the page does not jump when the
// real figures arrive.
export function OpenBugsSkeleton() {
  return (
    <OpenBugsShell
      primary={(
        <span data-testid="home-open-bugs-skeleton" className="flex flex-col gap-2" aria-hidden="true">
          <span className="h-7 w-16 animate-status-pulse rounded-1 bg-surface-3" />
          <span className="h-3 w-56 animate-status-pulse rounded-1 bg-surface-3" />
        </span>
      )}
      aside={(
        <span aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
          {BUG_SEVERITY_VALUES.map(severity => (
            <span
              key={severity}
              className="h-[18px] w-20 animate-status-pulse rounded-1 bg-surface-3"
            />
          ))}
        </span>
      )}
    />
  );
}

// The card, shared by every state so the section title and the layout stay put
// whichever body renders underneath. `primary` holds the headline figure (or
// whatever stands in for it), `aside` the severity breakdown. Unlike the sibling
// widgets' shells this one carries no count in its header — the number IS the
// body here, and the states with no trustworthy figure (loading, failed read)
// render none rather than a zero that would assert an all-clear.
function OpenBugsShell({ primary, aside }: { primary: ReactNode, aside: ReactNode }) {
  return (
    <section data-testid="home-open-bugs" aria-labelledby="home-open-bugs-title">
      <Card className="flex flex-col gap-4 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h2
            id="home-open-bugs-title"
            className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-3"
          >
            Open bugs
          </h2>
          {primary}
        </div>
        {aside}
      </Card>
    </section>
  );
}
