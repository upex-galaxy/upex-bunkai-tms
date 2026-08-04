import type { ActiveRun } from '@lib/home/active-runs';
import type { LucideIcon } from 'lucide-react';
import { buttonVariants } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { AlertTriangle, Bot, CircleCheckBig, Play, Server, User } from 'lucide-react';
import Link from 'next/link';

// BK-256 — Home's "Active test runs" table (master-design-plan §4.2, `home.jsx`'s
// "Active runs" section): every run in progress across the workspace, so a QA
// Lead can spot a stalled or blocked one without opening each project.
//
// Chip grammar is REUSED, not re-derived: the `.status-chip[data-status]` /
// `.dot[data-status]` atoms in `app/globals.css` that BK-37/BK-38 already use.
// `blocked` is the amber signal family per §4.8, and every chip carries its text
// label — status is never conveyed by colour alone.
//
// Departures from the mockup, all deliberate:
//   * NO per-row overflow menu. The mockup ends each row with an `Icon.More`;
//     there is no per-run action in the live app, and a menu with nothing in it
//     is a dead affordance.
//   * NO "fail"-status row. The mockup's sample data lists one; a failed run is
//     finished, which this story's Business Rule excludes from the active set.
//     Failed STEPS inside a still-running run are shown instead — in the
//     progress bar, where they belong.
//   * NO "All runs" header button. There is no workspace-wide runs index to
//     point it at; the run report is per project (`/projects/{slug}/runs`).
//   * Run identifiers are the first 8 characters of the run's uuid in mono,
//     matching `ProjectRunsReportView`. This product has no `RUN-1839` display
//     code, and inventing one on Home only would make the two screens disagree.
//   * Absolute UTC start time, not "24m ago" — the live app renders timestamps
//     as `YYYY-MM-DD HH:MM` everywhere (`/activity`, run history, BK-257's
//     recent projects) because relative formatting drifts between server and
//     browser. Live-UI-first (Critical Rule #14).
//   * The row grid becomes a real <table> in a horizontally scrollable
//     container. The mockup's fixed 8-column CSS grid drops columns on a narrow
//     viewport; AC1 asks for six fields on every row, so they scroll instead of
//     disappearing.
//
// Kept from the mockup: the card + section header shape, the run count beside
// the title, the Resume action for the most recent run, and the column order.

interface ActiveRunsCardProps {
  runs: ActiveRun[]
  activeCount: number
}

const MODE_LABEL: Record<string, string> = { human: 'Manual', agent: 'Agent', ci: 'CI' };
const MODE_ICON: Record<string, LucideIcon> = { human: User, agent: Bot, ci: Server };
const STATE_LABEL: Record<ActiveRun['state'], string> = { running: 'Running', blocked: 'Blocked' };

export function ActiveRunsCard({ runs, activeCount }: ActiveRunsCardProps) {
  // Ordered `started_at` desc by the rollup, so the first row IS the most
  // recently started run — AC3's resume target. `started_at` (not `updated_at`)
  // is the only honest recency signal for an in-flight run; see the note in
  // `lib/home/active-runs.ts`.
  const resumeTarget = runs[0] ?? null;

  return (
    <ActiveRunsShell
      count={activeCount}
      action={resumeTarget === null
        ? null
        : (
            <Link
              href={`/projects/${resumeTarget.projectSlug}/runs/${resumeTarget.id}`}
              data-testid="home-active-runs-resume"
              className={buttonVariants({ size: 'sm' })}
              title={`Resume the most recently started run (${resumeTarget.testTitle})`}
            >
              <Play size={11} />
              Resume
              {' '}
              <span className="font-mono">{shortRunId(resumeTarget.id)}</span>
            </Link>
          )}
    >
      {runs.length === 0
        ? (
            <div
              data-testid="home-active-runs-empty"
              className="flex flex-col items-center gap-2 px-4 py-8 text-center"
            >
              <CircleCheckBig size={18} className="text-fg-3" />
              <span className="text-md font-semibold text-fg-1">Nothing running right now</span>
              <span className="max-w-[46ch] text-sm text-fg-3">
                No test run is in progress anywhere in this workspace. Start one from a
                Test and it will show up here while it executes.
              </span>
            </div>
          )
        : (
            <div className="overflow-x-auto">
              <table data-testid="home-active-runs-table" className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Run', 'Project', 'Mode', 'Status', 'Progress', 'Executor', 'Started'].map(column => (
                      <th
                        key={column}
                        scope="col"
                        className="whitespace-nowrap border-b border-stroke-2 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => <ActiveRunRow key={run.id} run={run} />)}
                </tbody>
              </table>
            </div>
          )}
    </ActiveRunsShell>
  );
}

function ActiveRunRow({ run }: { run: ActiveRun }) {
  const ModeIcon = MODE_ICON[run.executorMode] ?? User;

  return (
    <tr
      data-testid={`home-active-runs-row-${run.id}`}
      className="transition-colors duration-token ease-token hover:bg-surface-3"
    >
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <Link
          href={`/projects/${run.projectSlug}/runs/${run.id}`}
          className="font-mono text-xs font-medium text-fg-0 hover:text-accent hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
          title={run.testTitle}
        >
          {shortRunId(run.id)}
        </Link>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <Link
          href={`/projects/${run.projectSlug}`}
          className="text-sm text-fg-1 hover:text-accent hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {run.projectName}
        </Link>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-1">
          <ModeIcon size={13} className="shrink-0 text-fg-2" />
          {MODE_LABEL[run.executorMode] ?? run.executorMode}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="status-chip" data-status={run.state}>
          <span className="dot" data-status={run.state} />
          {STATE_LABEL[run.state]}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <StepProgress run={run} />
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="max-w-[200px] truncate text-sm text-fg-2" title={run.executorLabel}>
          {run.executorLabel}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2" title={`${run.startedAt} (UTC)`}>
          {formatStartedAt(run.startedAt)}
        </span>
      </td>
    </tr>
  );
}

// The mockup's segmented bar, wired to the exact step counts. The bar is
// `aria-hidden` and the whole cell carries one spoken label, so a screen reader
// gets the numbers once instead of four unlabelled slivers — and the `n/m` text
// beside it means the progress is never colour-only.
function StepProgress({ run }: { run: ActiveRun }) {
  const total = run.totalSteps;
  const passed = Math.max(0, run.doneSteps - run.failedSteps - run.blockedSteps);
  const pct = (value: number) => (total === 0 ? 0 : (value / total) * 100);

  return (
    <span
      className="flex items-center gap-2"
      role="img"
      aria-label={`${run.doneSteps} of ${total} steps done: ${run.failedSteps} failed, ${run.blockedSteps} blocked`}
    >
      <span
        aria-hidden="true"
        className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-4"
      >
        <span className="h-full bg-signal-pass" style={{ width: `${pct(passed)}%` }} />
        <span className="h-full bg-signal-fail" style={{ width: `${pct(run.failedSteps)}%` }} />
        <span className="h-full bg-signal-blocked" style={{ width: `${pct(run.blockedSteps)}%` }} />
      </span>
      <span aria-hidden="true" className="shrink-0 font-mono text-2xs text-fg-3">
        {run.doneSteps}
        /
        {total}
      </span>
    </span>
  );
}

// A read that failed gets its own state, never the empty one. "Nothing running
// right now" shown to a lead whose team has four runs in flight is exactly the
// stalled-run blindness this widget exists to prevent — the same line the Home
// banner (BK-255) and recent projects (BK-257) draw.
export function ActiveRunsError() {
  return (
    <ActiveRunsShell count={null} action={null}>
      <div
        data-testid="home-active-runs-error"
        className="flex flex-col items-center gap-2 px-4 py-8 text-center"
      >
        <AlertTriangle size={16} className="text-signal-fail" />
        <span className="text-md font-semibold text-fg-1">Could not load active runs</span>
        <span className="max-w-[46ch] text-sm text-fg-3">
          This workspace&apos;s runs could not be read just now. Reload the page to try
          again — nothing has been changed.
        </span>
      </div>
    </ActiveRunsShell>
  );
}

// Suspense fallback. Same `animate-status-pulse` treatment the welcome summary
// and the recent-projects skeleton use, sized to the row height so the page does
// not jump when the real rows arrive.
export function ActiveRunsSkeleton() {
  return (
    <ActiveRunsShell count={null} action={null}>
      <div
        data-testid="home-active-runs-skeleton"
        className="flex flex-col gap-3 px-4 py-4"
        aria-hidden="true"
      >
        {[0, 1, 2].map(row => (
          <div key={row} className="h-6 w-full animate-status-pulse rounded-1 bg-surface-3" />
        ))}
      </div>
    </ActiveRunsShell>
  );
}

// The card and its header, shared by every state so the section title and the
// Resume action stay put whichever body renders underneath. `count` is null in
// the states where no trustworthy number exists (loading, failed read) — showing
// a zero there would assert "nothing is running", which is precisely the claim
// those states cannot make.
function ActiveRunsShell({ count, action, children }: {
  count: number | null
  action: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section data-testid="home-active-runs" aria-labelledby="home-active-runs-title">
      <Card className="overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-3">
          <h2
            id="home-active-runs-title"
            className="text-sm font-semibold tracking-tight text-fg-0"
          >
            Active test runs
            {count !== null && (
              <span data-testid="home-active-runs-count" className="ml-1.5 font-mono text-2xs text-fg-4">
                ·
                {' '}
                {count}
              </span>
            )}
          </h2>
          {action}
        </header>
        {children}
      </Card>
    </section>
  );
}

// Matches `ProjectRunsReportView`'s run column: the first 8 characters of the
// uuid, which is what this product shows anywhere a run is identified.
function shortRunId(id: string): string {
  return id.slice(0, 8);
}

// Timezone-stable UTC, matching `/activity`'s `formatActivityTime`, run
// history's `formatRanAt` and BK-257's `formatLastActivity`:
// '2026-08-04T09:41:00+00:00' -> '2026-08-04 09:41'.
function formatStartedAt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
