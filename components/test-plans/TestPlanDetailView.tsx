'use client';

import type { TestPlanStatus } from '@components/test-plans/TestPlanStatusChip';
import { TestPlanForm } from '@components/test-plans/TestPlanForm';
import { TestPlanStatusChip } from '@components/test-plans/TestPlanStatusChip';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { ChevronLeft, FlaskConical, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// BK-202 — the Test Plan detail view (`/projects/[projectSlug]/plans/
// [planId]`). Ships ONLY the plan's own identity — name, goal, status,
// description, creator — plus inline edit, over an EMPTY test area whose
// empty state names the sibling capability.
//
// This is a RATIFIED-BY-SCOPE departure from `plan-detail.html`, which renders
// BK-202 + BK-203 + BK-204 + BK-207 as one combined screen. The add-tests
// picker, the member-test table, the aggregate progress card and the close
// flow are ABSENT, not disabled: none of them has a data source yet (no
// membership table exists, and no plan can be closed). Same treatment
// BK-205's milestone detail applied for the same reason
// (master-design-plan §5 D25).

export interface TestPlanDetail {
  id: string
  projectSlug: string
  name: string
  description: string
  goal: string
  status: TestPlanStatus
  creatorLabel: string
  createdAtLabel: string
}

interface TestPlanDetailViewProps {
  testPlan: TestPlanDetail
  // Member+ gate — a viewer sees the detail read-only, the Edit action
  // structurally absent (business-rules.md, AC 4.4). The server RPC re-checks
  // the live role on every write regardless, so this is presentation, never
  // the enforcement point.
  canEdit: boolean
}

const UNRESOLVED_CREATOR = 'a workspace member';

export function TestPlanDetailView({ testPlan, canEdit }: TestPlanDetailViewProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div data-testid="test-plan-detail-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[900px] flex-col gap-3">
          <Link
            href={`/projects/${testPlan.projectSlug}/plans`}
            data-testid="test-plan-detail-back"
            className="inline-flex w-fit items-center gap-1 text-xs text-fg-3 transition-colors duration-token ease-token hover:text-fg-1"
          >
            <ChevronLeft size={13} />
            Test Plans
          </Link>

          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 data-testid="test-plan-detail-name" className="m-0 text-md font-semibold text-fg-0">
                    {testPlan.name}
                  </h1>
                  <TestPlanStatusChip status={testPlan.status} testId="test-plan-detail-status" />
                  {testPlan.goal.length > 0 && (
                    <span
                      data-testid="test-plan-detail-goal"
                      className="inline-flex items-center rounded-1 border border-stroke-2 bg-surface-3 px-2 py-0.5 font-mono text-xs text-fg-2"
                    >
                      {testPlan.goal}
                    </span>
                  )}
                </div>
              </div>
              {canEdit && !editing && (
                <Button
                  type="button"
                  data-testid="test-plan-detail-edit-button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={13} />
                  Edit details
                </Button>
              )}
              {!canEdit && (
                <span data-testid="test-plan-detail-viewer-note" className="text-xs text-fg-3">
                  Editing requires the member role or higher.
                </span>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {testPlan.description.length > 0 && (
                <p data-testid="test-plan-detail-description" className="m-0 text-sm text-fg-1">
                  {testPlan.description}
                </p>
              )}
              <p className="m-0 text-xs text-fg-3">
                Created by
                {' '}
                <span className="text-fg-2">{testPlan.creatorLabel || UNRESOLVED_CREATOR}</span>
                {' · '}
                <span className="font-mono">{testPlan.createdAtLabel}</span>
              </p>
            </CardContent>
          </Card>

          {editing && (
            <TestPlanForm
              mode="edit"
              targetId={testPlan.id}
              initialName={testPlan.name}
              initialDescription={testPlan.description}
              initialGoal={testPlan.goal}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          )}

          {/* Empty test area — BK-202 ships no add-tests picker, no member
              table, no progress card and no close flow. The empty state names
              the sibling capability rather than promising a figure this story
              cannot compute. */}
          <Card>
            <CardContent
              data-testid="test-plan-detail-tests-empty"
              className="flex flex-col items-center gap-2 px-4 py-8 pt-4 text-center"
            >
              <FlaskConical size={18} className="text-fg-3" />
              <span className="text-md font-semibold text-fg-1">This plan has no tests yet</span>
              <span className="max-w-[52ch] text-sm text-fg-3">
                Adding tests to a plan, and tracking its progress from run outcomes, arrives with a
                later capability.
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function TestPlanDetailSkeleton() {
  return (
    <div data-testid="test-plan-detail-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[900px] flex-col gap-3" aria-hidden="true">
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
