'use client';

import type { MilestoneReadiness, OverdueInfo } from '@lib/milestones/readiness-view';
import { READ_ONLY_PROJECT_NOTE } from '@components/billing/ReadOnlyProjectNotice';
import { CreateMilestoneForm } from '@components/milestones/CreateMilestoneForm';
import { MilestoneArchiveButton, MilestoneArchivedBadge } from '@components/milestones/MilestoneArchiveButton';
import { MilestoneOverdueBadge } from '@components/milestones/MilestoneOverdueBadge';
import { PlanMiniBar } from '@components/test-plans/TestPlanProgress';
import { Button, buttonVariants } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { allArchivedCopy, milestonesListHref, milestonesSubline, overdueUnlessArchived } from '@lib/milestones/archive-view';
import { computeCountdown } from '@lib/milestones/countdown';
import { asProgressSummary, planCountLabel } from '@lib/milestones/readiness-view';
import { Archive, Flag, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// BK-205 — the project-scoped Milestones list (`/projects/[projectSlug]/
// milestones`). Reuses the live `Card` + list-row grammar `/activity` and
// `/bugs` already render with (§4.11 spec + Critical Rule #14 live-UI-first).
//
// The days-remaining chip is rendered with NEUTRAL styling in every row
// (2026-07-24 Three Amigos design decision). See `lib/milestones/countdown.ts`
// for the full ratified copy rulebook.
//
// BK-206 adds the mockup's Readiness column (pooled percentage + mini bar + plan
// count, or "No plans attached") and the overdue badge BESIDE the untouched
// countdown chip (Q5; AI Product Owner decisions PO-1/PO-2), plus "· N overdue" in
// the subline. Readiness and the overdue state are computed on the server and arrive
// on each item; this view never recomputes them.
//
// BK-1899 adds archive (master-design-plan §5 D69, spec-only): archived Milestones are
// out of the default list and one Show archived choice away (`?archived=show`, AI
// Product Owner P3); an archived row carries the Archived label beside its name (P4)
// and never an overdue badge (P2, the server drops it); members who can write get an
// Archive or Restore control at the end of each row (P11).

export interface MilestoneListItem {
  id: string
  name: string
  targetDate: string
  description: string
  creatorLabel: string
  // null when the readiness read failed for this milestone: a dash, never a guess.
  readiness: Pick<MilestoneReadiness, 'plan_count' | 'member_count' | 'passed_pct' | 'counts'> | null
  overdue: OverdueInfo | null
  // BK-1899 — set when the Milestone is archived (only listed with Show archived on).
  archivedAt: string | null
}

interface MilestonesListViewProps {
  projectId: string
  projectSlug: string
  milestones: MilestoneListItem[]
  // Member+ gate — a viewer sees the list with the create action
  // STRUCTURALLY absent, not merely hidden (business-rules.md).
  canCreate: boolean
  readOnly?: boolean
  // The server's UTC date, so every countdown chip uses the same day as the
  // overdue badges (D7), never the browser's clock.
  todayIso: string
  // BK-1899 — whether the address asks for archived Milestones too, and how many
  // the Project has (counted on the server whatever the choice).
  showArchived: boolean
  archivedCount: number
}

const UNRESOLVED_CREATOR = 'a workspace member';
const COLUMNS = ['Name', 'Target date', 'Countdown', 'Readiness', 'Creator'];
// BK-1899 — the trailing Archive / Restore column, only for members who can write.
const ACTIONS_COLUMN = 'actions';

export function MilestonesListView({ projectId, projectSlug, milestones, canCreate: canCreateRole, readOnly = false, todayIso, showArchived, archivedCount }: MilestonesListViewProps) {
  const canCreate = canCreateRole && !readOnly;
  const [creating, setCreating] = useState(false);
  const overdueCount = milestones.filter(milestone => overdueUnlessArchived(milestone.overdue, milestone.archivedAt) !== null).length;

  return (
    <div data-testid="milestones-list-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="m-0 text-md font-semibold text-fg-0">Milestones</h1>
              <p className="m-0 text-xs text-fg-3">
                <span data-testid="milestones-count">
                  {milestonesSubline({ shownCount: milestones.length, archivedCount, showArchived })}
                </span>
                {overdueCount > 0 && (
                  <span data-testid="milestones-overdue-count">
                    {' · '}
                    {overdueCount}
                    {' overdue'}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {(archivedCount > 0 || showArchived) && (
                <Link
                  href={milestonesListHref(projectSlug, !showArchived)}
                  data-testid="milestones-show-archived-toggle"
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  <Archive size={13} aria-hidden="true" />
                  {showArchived ? 'Hide archived' : 'Show archived'}
                </Link>
              )}
              {canCreate && !creating && (
                <Button
                  type="button"
                  data-testid="milestones-new-button"
                  variant="primary"
                  size="sm"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={13} />
                  New milestone
                </Button>
              )}
              {readOnly && (
                <span data-testid="milestones-read-only-note" className="text-xs text-fg-3">
                  {READ_ONLY_PROJECT_NOTE}
                </span>
              )}
              {!canCreateRole && !readOnly && (
                <span data-testid="milestones-viewer-note" className="text-xs text-fg-3">
                  Creating milestones requires the member role or higher.
                </span>
              )}
            </div>
          </div>

          {creating && (
            <CreateMilestoneForm
              projectId={projectId}
              onCreated={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          )}

          <Card className="overflow-hidden">
            {milestones.length === 0 && archivedCount > 0 && !showArchived
              ? (
                  <div
                    data-testid="milestones-all-archived"
                    className="flex flex-col items-center gap-2 px-4 py-8 text-center"
                  >
                    <Archive size={18} className="text-fg-3" aria-hidden="true" />
                    <span className="text-md font-semibold text-fg-1">No active milestones</span>
                    <span className="max-w-[46ch] text-sm text-fg-3">{allArchivedCopy(archivedCount)}</span>
                    <Link
                      href={milestonesListHref(projectSlug, true)}
                      data-testid="milestones-all-archived-show"
                      className={buttonVariants({ variant: 'default', size: 'sm' })}
                    >
                      Show archived
                    </Link>
                  </div>
                )
              : milestones.length === 0
                ? (
                    <div
                      data-testid="milestones-empty"
                      className="flex flex-col items-center gap-2 px-4 py-8 text-center"
                    >
                      <Flag size={18} className="text-fg-3" />
                      <span className="text-md font-semibold text-fg-1">No milestones yet</span>
                      <span className="max-w-[46ch] text-sm text-fg-3">
                        {canCreate
                          ? 'Anchor the team\'s testing work to a concrete delivery goal, like "Release 2.4".'
                          : 'No milestone has been created for this project yet.'}
                      </span>
                      {canCreate && !creating && (
                        <Button
                          type="button"
                          data-testid="milestones-empty-new-button"
                          variant="primary"
                          size="sm"
                          onClick={() => setCreating(true)}
                        >
                          <Plus size={13} />
                          New milestone
                        </Button>
                      )}
                    </div>
                  )
                : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            {[...COLUMNS, ...(canCreate ? [ACTIONS_COLUMN] : [])].map(column => (
                              <th
                                key={column}
                                scope="col"
                                className="whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
                              >
                                {column === ACTIONS_COLUMN ? <span className="sr-only">Actions</span> : column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody data-testid="milestones-rows">
                          {milestones.map(milestone => (
                            <MilestoneRow key={milestone.id} milestone={milestone} projectSlug={projectSlug} todayIso={todayIso} canManage={canCreate} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({ milestone, projectSlug, todayIso, canManage }: { milestone: MilestoneListItem, projectSlug: string, todayIso: string, canManage: boolean }) {
  const countdown = computeCountdown(milestone.targetDate, todayIso);
  const archived = milestone.archivedAt !== null;
  const overdue = overdueUnlessArchived(milestone.overdue, milestone.archivedAt);

  return (
    <tr
      data-testid={`milestone-row-${milestone.id}`}
      data-archived={archived ? 'true' : undefined}
      className="cursor-pointer transition-colors duration-token ease-token hover:bg-surface-3"
    >
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="inline-flex items-center gap-2">
          <Link
            href={`/projects/${projectSlug}/milestones/${milestone.id}`}
            className={`text-sm font-medium hover:underline focus-visible:underline ${archived ? 'text-fg-2' : 'text-fg-0'}`}
          >
            {milestone.name}
          </Link>
          {archived && <MilestoneArchivedBadge testId={`milestone-archived-${milestone.id}`} />}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2">{milestone.targetDate}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-1 bg-surface-3 px-2 py-0.5 text-xs text-fg-2" data-testid={`milestone-countdown-${milestone.id}`}>
            {countdown.label}
          </span>
          {overdue && <MilestoneOverdueBadge label={overdue.label} testId={`milestone-overdue-${milestone.id}`} />}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <ReadinessCell milestone={milestone} />
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="text-sm text-fg-2">{milestone.creatorLabel || UNRESOLVED_CREATOR}</span>
      </td>
      {canManage && (
        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5 text-right">
          <MilestoneArchiveButton
            milestoneId={milestone.id}
            name={milestone.name}
            archived={archived}
            projectSlug={projectSlug}
            testId={`milestone-${archived ? 'restore' : 'archive'}-${milestone.id}`}
          />
        </td>
      )}
    </tr>
  );
}

function ReadinessCell({ milestone }: { milestone: MilestoneListItem }) {
  const { readiness } = milestone;
  if (readiness === null) {
    return (
      <span data-testid={`milestone-readiness-unavailable-${milestone.id}`} title="Readiness unavailable" className="text-sm text-fg-4">
        —
      </span>
    );
  }
  if (readiness.plan_count === 0) {
    return <span data-testid={`milestone-readiness-none-${milestone.id}`} className="text-xs text-fg-3">No plans attached</span>;
  }
  if (readiness.member_count === 0) {
    // Plans attached, no tests in them: a sentence, never the dash a failed read shows.
    return (
      <span data-testid={`milestone-readiness-no-tests-${milestone.id}`} className="text-xs text-fg-3">
        No tests ·
        {' '}
        {planCountLabel(readiness.plan_count)}
      </span>
    );
  }
  return (
    <span data-testid={`milestone-readiness-${milestone.id}`} className="inline-flex items-center gap-2">
      <PlanMiniBar planId={milestone.id} summary={asProgressSummary({ id: milestone.id, ...readiness })} />
      <span className="text-xs text-fg-3">{planCountLabel(readiness.plan_count)}</span>
    </span>
  );
}

export function MilestonesListSkeleton() {
  return (
    <div data-testid="milestones-list-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3" aria-hidden="true">
          <Card className="flex flex-col gap-2 p-4">
            <div className="h-3 w-full animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-5/6 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-4/6 animate-status-pulse rounded-1 bg-surface-3" />
          </Card>
        </div>
      </div>
    </div>
  );
}
