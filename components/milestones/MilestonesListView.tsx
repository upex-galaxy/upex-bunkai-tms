'use client';

import { CreateMilestoneForm } from '@components/milestones/CreateMilestoneForm';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { computeCountdown } from '@lib/milestones/countdown';
import { Flag, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// BK-205 — the project-scoped Milestones list (`/projects/[projectSlug]/
// milestones`). Reuses the live `Card` + list-row grammar `/activity` and
// `/bugs` already render with (§4.11 spec + Critical Rule #14 live-UI-first).
//
// The days-remaining chip is rendered with NEUTRAL styling in every row
// (2026-07-24 Three Amigos design decision) — no urgency/overdue color
// treatment here; that arrives with BK-206's readiness. See
// `lib/milestones/countdown.ts` for the full ratified copy rulebook.

export interface MilestoneListItem {
  id: string
  name: string
  targetDate: string
  description: string
  creatorLabel: string
}

interface MilestonesListViewProps {
  projectId: string
  projectSlug: string
  milestones: MilestoneListItem[]
  // Member+ gate — a viewer sees the list with the create action
  // STRUCTURALLY absent, not merely hidden (business-rules.md).
  canCreate: boolean
}

const UNRESOLVED_CREATOR = 'a workspace member';

export function MilestonesListView({ projectId, projectSlug, milestones, canCreate }: MilestonesListViewProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div data-testid="milestones-list-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="m-0 text-md font-semibold text-fg-0">Milestones</h1>
              <p className="m-0 text-xs text-fg-3">
                {milestones.length}
                {' '}
                {milestones.length === 1 ? 'milestone' : 'milestones'}
              </p>
            </div>
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
            {!canCreate && (
              <span data-testid="milestones-viewer-note" className="text-xs text-fg-3">
                Creating milestones requires the member role or higher.
              </span>
            )}
          </div>

          {creating && (
            <CreateMilestoneForm
              projectId={projectId}
              onCreated={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          )}

          <Card className="overflow-hidden">
            {milestones.length === 0
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
                          {['Name', 'Target date', 'Countdown', 'Creator'].map(column => (
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
                      <tbody data-testid="milestones-rows">
                        {milestones.map(milestone => (
                          <MilestoneRow key={milestone.id} milestone={milestone} projectSlug={projectSlug} />
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

function MilestoneRow({ milestone, projectSlug }: { milestone: MilestoneListItem, projectSlug: string }) {
  const countdown = computeCountdown(milestone.targetDate);

  return (
    <tr
      data-testid={`milestone-row-${milestone.id}`}
      className="cursor-pointer transition-colors duration-token ease-token hover:bg-surface-3"
    >
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <Link
          href={`/projects/${projectSlug}/milestones/${milestone.id}`}
          className="text-sm font-medium text-fg-0 hover:underline focus-visible:underline"
        >
          {milestone.name}
        </Link>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2">{milestone.targetDate}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="inline-flex items-center rounded-1 bg-surface-3 px-2 py-0.5 text-xs text-fg-2" data-testid={`milestone-countdown-${milestone.id}`}>
          {countdown.label}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="text-sm text-fg-2">{milestone.creatorLabel || UNRESOLVED_CREATOR}</span>
      </td>
    </tr>
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
