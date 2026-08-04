import type { ActivityItemResponse } from '@app/api/v1/activity/response';
import { Card } from '@components/ui/card';
import { extractRunVerdict, resolveActorLabel } from '@lib/activity/view';
import { HOME_CHANGE_WINDOW_HOURS } from '@lib/home/constants';
import { formatAbsoluteTime, formatRelativeTime } from '@lib/home/recent-activity';
import { AlertTriangle, Box, Bug, ChevronRight, History, Play } from 'lucide-react';
import Link from 'next/link';

// BK-260 — Home's condensed "Recent activity" feed (master-design-plan §4.2,
// `home.jsx`'s right-hand card). The last 24 hours of workspace events, capped
// at a handful of rows, so a member landing on Home can see what changed
// without leaving the screen.
//
// It is a PRESENTATION layer over BK-49's feed, not a second one. Every string
// a row shows — the action label, the actor fallback, the item label, the
// run verdict chip — is produced by the SAME code `/activity` renders from
// (`app/api/v1/activity/response.ts` + `lib/activity/{labels,view}.ts`), so one
// event cannot read one way here and another way there. No new endpoint, no new
// event allowlist, no second copy of the label map.
//
// Departures from the mockup, all deliberate (recorded as §5 D22):
//   * Full-width card in Home's single-column stack, not the mockup's
//     right-hand grid column. The live page has stacked its widgets since
//     BK-255; re-cutting BK-256's and BK-257's shipped layout to restore a
//     two-column grid is not this story's change to make (Critical Rule #14 —
//     the live UI is the fidelity source, the mockup is inspiration).
//   * Relative time ("12m ago") is the visible label — AC1 asks for it in so
//     many words, and it is the whole point of a "what just happened" surface.
//     The absolute UTC value every other timestamp in this app shows is one
//     hover away in `title`, so this widget and `/activity` never contradict
//     each other; they differ in granularity only.
//   * Rows are not clickable. `/activity` does not link its rows either (a
//     drill-through into the source entity has no story yet), and a widget
//     that invented one would be the only place in the product where an
//     activity row navigates.
//
// Kept from the mockup: the card + section-header anatomy, the "Last 24h"
// hint, the per-entity glyph, the two-line row (who + action, then target)
// with the time on the right.

interface RecentActivityCardProps {
  items: ActivityItemResponse[]
  // Captured ONCE by the caller and passed down, so every row on one render
  // ages against the same instant — otherwise the last row could be a
  // millisecond "newer" than the first purely because it was formatted later.
  now: Date
}

export function RecentActivityCard({ items, now }: RecentActivityCardProps) {
  return (
    <RecentActivityShell>
      {items.length === 0
        ? (
            <div
              data-testid="home-recent-activity-empty"
              className="flex flex-col items-center gap-2 px-4 py-8 text-center"
            >
              <History size={18} className="text-fg-3" />
              <span className="text-md font-semibold text-fg-1">Nothing in the last 24 hours</span>
              <span className="max-w-[46ch] text-sm text-fg-3">
                Authoring an ATC, finishing a run or triaging a defect will show up here.
              </span>
              <Link
                href="/activity"
                data-testid="home-recent-activity-empty-view-all"
                className="mt-1 text-sm font-semibold text-accent hover:underline"
              >
                Browse the full activity feed
              </Link>
            </div>
          )
        : (
            <ul data-testid="home-recent-activity-list" className="m-0 grid grid-cols-1 p-0">
              {items.map(item => (
                <li
                  key={item.id}
                  data-testid={`home-recent-activity-item-${item.id}`}
                  className="flex items-start gap-2.5 border-t border-stroke-2 px-4 py-2.5 first:border-t-0"
                >
                  <ActivityGlyph entityType={item.entity_type} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="min-w-0 truncate text-xs text-fg-2">
                      <span className="font-mono text-fg-1">{resolveActorLabel(item.actor)}</span>
                      {' '}
                      {item.action_label}
                      <RunVerdictChip action={item.action} payload={item.payload} />
                    </span>
                    <span className="min-w-0 truncate text-sm text-fg-0">{item.item.label}</span>
                  </span>
                  <span
                    className="shrink-0 whitespace-nowrap pt-0.5 font-mono text-2xs text-fg-4"
                    title={`${formatAbsoluteTime(item.created_at)} UTC`}
                  >
                    {formatRelativeTime(item.created_at, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
    </RecentActivityShell>
  );
}

// A read that failed gets its own state, never the empty one. "Nothing in the
// last 24 hours" shown to a member whose team shipped all morning is a false
// statement about their workspace, and the same line the welcome banner
// (BK-255), recent projects (BK-257) and `/activity` (BK-49) each draw.
export function RecentActivityError() {
  return (
    <RecentActivityShell>
      <div
        data-testid="home-recent-activity-error"
        className="flex flex-col items-center gap-2 px-4 py-8 text-center"
      >
        <AlertTriangle size={16} className="text-signal-fail" />
        <span className="text-md font-semibold text-fg-1">Could not load recent activity</span>
        <span className="max-w-[46ch] text-sm text-fg-3">
          This workspace&apos;s activity could not be read just now. Reload the page to
          try again — nothing has been changed.
        </span>
      </div>
    </RecentActivityShell>
  );
}

// Suspense fallback. Same `animate-status-pulse` treatment the sibling widgets
// use, sized to the two-line row so the page does not jump when the rows land.
export function RecentActivitySkeleton() {
  return (
    <RecentActivityShell>
      <div
        data-testid="home-recent-activity-skeleton"
        className="flex flex-col gap-3 px-4 py-4"
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map(row => (
          <div key={row} className="h-8 w-full animate-status-pulse rounded-1 bg-surface-3" />
        ))}
      </div>
    </RecentActivityShell>
  );
}

// The card and its header, shared by every state so the section title, the
// window hint and the "View all" link stay put whichever body renders.
function RecentActivityShell({ children }: { children: React.ReactNode }) {
  return (
    <section data-testid="home-recent-activity" aria-labelledby="home-recent-activity-title">
      <Card className="overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-3">
          <h2
            id="home-recent-activity-title"
            className="text-sm font-semibold tracking-tight text-fg-0"
          >
            Recent activity
          </h2>
          <span className="flex items-center gap-3">
            <span className="hidden text-2xs text-fg-4 sm:inline">
              {`Last ${HOME_CHANGE_WINDOW_HOURS}h`}
            </span>
            <Link
              href="/activity"
              data-testid="home-recent-activity-view-all"
              className="flex items-center gap-0.5 text-xs font-semibold text-fg-2 transition-colors duration-token ease-token hover:text-fg-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              View all
              <ChevronRight size={11} />
            </Link>
          </span>
        </header>
        {children}
      </Card>
    </section>
  );
}

// The mockup's per-kind glyph, keyed off the row's own `entity_type` rather
// than a parallel "kind" the wire shape does not carry. An entity_type this
// map does not know falls back to the neutral accent box instead of rendering
// nothing, so a future event type joining `ACTIVITY_ALLOWED_ACTIONS` cannot
// leave a hole in the row.
const GLYPH_BY_ENTITY_TYPE: Record<string, { Icon: typeof Box, className: string }> = {
  bug: { Icon: Bug, className: 'text-signal-fail' },
  run: { Icon: Play, className: 'text-signal-running' },
};

function ActivityGlyph({ entityType }: { entityType: string }) {
  const glyph = GLYPH_BY_ENTITY_TYPE[entityType] ?? { Icon: Box, className: 'text-accent' };
  const { Icon } = glyph;
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-3"
    >
      <Icon size={11} className={glyph.className} />
    </span>
  );
}

// `run.finished`'s verdict is the one payload field the label map deliberately
// leaves out of the label string (`lib/activity/labels.ts`), so `/activity`
// renders it as a chip beside the action. This widget does the same, from the
// same `extractRunVerdict`, rather than dropping it — a finished run whose
// outcome is invisible is the least useful row a QA feed could show.
function RunVerdictChip({ action, payload }: { action: string, payload: Record<string, unknown> }) {
  const verdict = extractRunVerdict(action, payload);
  if (verdict === null) {
    return null;
  }
  const status = verdict === 'passed' ? 'pass' : 'fail';
  return (
    <>
      {' '}
      <span className="status-chip" data-status={status}>
        <span className="dot" data-status={status} />
        {verdict === 'passed' ? 'Passed' : 'Failed'}
      </span>
    </>
  );
}
