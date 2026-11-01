'use client';

import type { AttachablePlan } from '@components/milestones/AttachPlansDialog';
import type { MilestoneReadiness, OverdueInfo } from '@lib/milestones/readiness-view';
import { AttachPlansDialog } from '@components/milestones/AttachPlansDialog';
import { EditMilestoneForm } from '@components/milestones/EditMilestoneForm';
import { MilestoneAttachedPlans } from '@components/milestones/MilestoneAttachedPlans';
import { MilestoneOverdueBadge } from '@components/milestones/MilestoneOverdueBadge';
import { MilestoneReadinessCard, MilestoneReadinessUnavailable } from '@components/milestones/MilestoneReadinessCard';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { computeCountdown } from '@lib/milestones/countdown';
import { overdueNoteText } from '@lib/milestones/readiness-view';
import { AlertTriangle, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

// BK-205 shipped the Milestone detail view (`/projects/[projectSlug]/milestones/
// [milestoneId]`) with the milestone's own identity over an empty plans area
// (master-design-plan §5 D25). BK-206 restores the mockup's composition on top of it
// without altering what BK-205 ships: the Attach-plans control (member+), the overdue
// badge BESIDE the untouched neutral countdown chip plus the structural overdue note,
// the readiness card and the attached-plans table. Ratified departures from the
// mockup are recorded in §5 (BK-206 entry).
//
// Readiness and the overdue state are computed on the server (one
// `bunkai_milestones_readiness` read, one overdue predicate on the server UTC date)
// and arrive as props; this view never recomputes them. After an attach or a detach it
// refreshes the route, so readiness is recalculated on view (D1).

export interface MilestoneDetail {
  id: string
  projectId: string
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
  // null when the readiness read failed: the card says so and no overdue state is
  // claimed, rather than guessing one.
  readiness: MilestoneReadiness | null
  overdue: OverdueInfo | null
  // The project's open test plans, for the Attach-plans picker (member+ only).
  attachablePlans: AttachablePlan[]
}

const UNRESOLVED_CREATOR = 'a workspace member';

export function MilestoneDetailView({ milestone, canEdit, readiness, overdue, attachablePlans }: MilestoneDetailViewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const countdown = computeCountdown(milestone.targetDate);
  const attachedPlanIds = useMemo(() => new Set((readiness?.plans ?? []).map(plan => plan.plan_id)), [readiness]);
  const note = overdue ? overdueNoteText({ days: overdue.days, readinessPct: readiness?.passed_pct ?? null }) : null;
  const refresh = () => router.refresh();

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
                  {overdue && <MilestoneOverdueBadge label={overdue.label} testId="milestone-detail-overdue-badge" />}
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1.5">
                  {!editing && (
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
                  <Button
                    type="button"
                    data-testid="milestone-detail-attach-button"
                    variant="primary"
                    size="sm"
                    onClick={() => setPicking(true)}
                  >
                    <Plus size={13} />
                    Attach plans
                  </Button>
                </div>
              )}
              {!canEdit && (
                <span data-testid="milestone-detail-viewer-note" className="text-xs text-fg-3">
                  Editing and attaching plans require the member role or higher.
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

          {overdue && note && (
            <div
              data-testid="milestone-detail-overdue-note"
              role="note"
              className="flex items-start gap-3 rounded-3 border border-stroke-2 bg-signal-fail-bg p-3 text-sm text-fg-1 shadow-card"
            >
              <AlertTriangle size={16} className="mt-px shrink-0 text-signal-fail" aria-hidden="true" />
              <span>
                <b className="font-semibold text-fg-0">This milestone is overdue.</b>
                {' '}
                Its target date
                {' '}
                <span className="font-mono">{milestone.targetDate}</span>
                {' '}
                {note.passed}
                {' and '}
                {note.readiness}
                {' — move the target date or finish the attached plans.'}
              </span>
            </div>
          )}

          {readiness ? <MilestoneReadinessCard readiness={readiness} /> : <MilestoneReadinessUnavailable />}

          {readiness && (
            <MilestoneAttachedPlans
              projectId={milestone.projectId}
              projectSlug={milestone.projectSlug}
              milestoneId={milestone.id}
              plans={readiness.plans}
              canEdit={canEdit}
              onAttach={() => setPicking(true)}
              onDetached={refresh}
            />
          )}

          {canEdit && (
            <AttachPlansDialog
              open={picking}
              onClose={() => setPicking(false)}
              projectId={milestone.projectId}
              milestoneId={milestone.id}
              milestoneName={milestone.name}
              plans={attachablePlans}
              attachedPlanIds={attachedPlanIds}
              onAttached={refresh}
            />
          )}
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
