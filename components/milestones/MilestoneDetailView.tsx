'use client';

import { EditMilestoneForm } from '@components/milestones/EditMilestoneForm';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { computeCountdown } from '@lib/milestones/countdown';
import { Layers, Pencil } from 'lucide-react';
import { useState } from 'react';

// BK-205 — the Milestone detail view (`/projects/[projectSlug]/milestones/
// [milestoneId]`). Ships ONLY the milestone's own identity — name, target
// date, countdown, description, creator — over an EMPTY plans area whose
// empty state names the sibling capability. This is a RATIFIED DEPARTURE
// from the mockup (`milestones-board.html` renders BK-205+BK-206 as one
// combined screen) — see `.context/design/master-design-plan.md` §5 D25. The
// Attach-plans control, readiness card/bar, per-plan breakdown row and
// overdue block are ABSENT, not disabled: none of them has a data source yet
// (`milestone_plans` does not exist; BK-202/BK-206 are both Backlog).

export interface MilestoneDetail {
  id: string
  projectSlug: string
  name: string
  targetDate: string
  description: string
  creatorLabel: string
}

interface MilestoneDetailViewProps {
  milestone: MilestoneDetail
  // Member+ gate — a viewer sees the detail read-only, the Edit action
  // structurally absent (business-rules.md).
  canEdit: boolean
}

const UNRESOLVED_CREATOR = 'a workspace member';

export function MilestoneDetailView({ milestone, canEdit }: MilestoneDetailViewProps) {
  const [editing, setEditing] = useState(false);
  const countdown = computeCountdown(milestone.targetDate);

  return (
    <div data-testid="milestone-detail-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <h1 data-testid="milestone-detail-name" className="m-0 text-md font-semibold text-fg-0">
                  {milestone.name}
                </h1>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-mono text-xs text-fg-2">{milestone.targetDate}</span>
                  <span
                    className="inline-flex items-center rounded-1 bg-surface-3 px-2 py-0.5 text-xs text-fg-2"
                    data-testid="milestone-detail-countdown"
                  >
                    {countdown.label}
                  </span>
                </div>
              </div>
              {canEdit && !editing && (
                <Button
                  type="button"
                  data-testid="milestone-detail-edit-button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={13} />
                  Edit
                </Button>
              )}
              {!canEdit && (
                <span data-testid="milestone-detail-viewer-note" className="text-xs text-fg-3">
                  Editing requires the member role or higher.
                </span>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {milestone.description.length > 0 && (
                <p data-testid="milestone-detail-description" className="m-0 text-sm text-fg-1">
                  {milestone.description}
                </p>
              )}
              <p className="m-0 text-xs text-fg-3">
                Created by
                {' '}
                <span className="text-fg-2">{milestone.creatorLabel || UNRESOLVED_CREATOR}</span>
              </p>
            </CardContent>
          </Card>

          {editing && (
            <EditMilestoneForm
              milestoneId={milestone.id}
              initialName={milestone.name}
              initialTargetDate={milestone.targetDate}
              initialDescription={milestone.description}
              onUpdated={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          )}

          {/* Empty plans area — BK-205 ships no Attach-plans control, no
              readiness card, no attached-plans table (§5 D25). The empty
              state names the sibling capability rather than promising a
              figure this story cannot compute. */}
          <Card>
            <CardContent
              data-testid="milestone-detail-plans-empty"
              className="flex flex-col items-center gap-2 px-4 py-8 pt-4 text-center"
            >
              <Layers size={18} className="text-fg-3" />
              <span className="text-md font-semibold text-fg-1">No test plans attached</span>
              <span className="max-w-[46ch] text-sm text-fg-3">
                Attaching test plans and tracking readiness against this milestone arrives with a
                later capability.
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function MilestoneDetailSkeleton() {
  return (
    <div data-testid="milestone-detail-skeleton" className="flex flex-1 flex-col overflow-hidden">
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
