'use client';

import type { TestPlanStatus } from '@components/test-plans/TestPlanStatusChip';
import type { TestPlanMemberTest } from '@components/test-plans/TestPlanTestsTable';
import { TestPickerDialog } from '@components/test-plans/TestPickerDialog';
import { TestPlanForm } from '@components/test-plans/TestPlanForm';
import { TestPlanStatusChip } from '@components/test-plans/TestPlanStatusChip';
import { TestPlanTestsTable } from '@components/test-plans/TestPlanTestsTable';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// BK-202/BK-203 — the Test Plan detail view (`/projects/[projectSlug]/plans/
// [planId]`). BK-202 shipped the plan's own identity (name, goal, status,
// description, creator) plus inline edit, over an EMPTY test area whose empty
// state named the sibling capability — that gap is what BK-203 fills: the
// member-tests table, the "Add tests" picker, and the live count.
//
// The aggregate progress card and the close flow are STILL absent — those
// belong to BK-204 and BK-207 respectively, neither of which has shipped.
// Same ratified-by-scope departure from `plan-detail.html` BK-202 already
// applied (master-design-plan §5 D25): build only what has a data source.

export interface TestPlanDetail {
  id: string
  projectId: string
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
  initialTests: TestPlanMemberTest[]
  // Member+ gate — a viewer sees the detail read-only, Edit AND the
  // Add/Remove tests controls structurally absent (business-rules.md, AC 4.4,
  // AC 5.1). The server RPCs re-check the live role on every write
  // regardless, so this is presentation, never the enforcement point.
  canEdit: boolean
}

const UNRESOLVED_CREATOR = 'a workspace member';

export function TestPlanDetailView({ testPlan, initialTests, canEdit }: TestPlanDetailViewProps) {
  const [editing, setEditing] = useState(false);
  const [tests, setTests] = useState<TestPlanMemberTest[]>(initialTests);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Membership can only be edited while the plan is Open (AC E1) — hidden
  // entirely, not disabled, matching the viewer treatment above. The server
  // RPCs enforce the identical gate as a backstop.
  const canEditMembership = canEdit && testPlan.status === 'open';

  const refetchTests = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/v1/test-plans/${testPlan.id}/tests`);
      if (!res.ok) { return; }
      const body = (await res.json()) as {
        tests: { id: string, title: string, tags: string[], added_by_email: string | null }[]
      };
      setTests(body.tests.map(t => ({
        id: t.id,
        title: t.title,
        tags: t.tags,
        addedByLabel: t.added_by_email || UNRESOLVED_CREATOR,
      })));
    }
    finally {
      setRefreshing(false);
    }
  };

  const handleRemoved = (testId: string) => {
    setTests(prev => prev.filter(t => t.id !== testId));
  };

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
                  <span data-testid="test-plan-detail-test-count" className="font-mono text-xs text-fg-3">
                    {tests.length}
                    {' '}
                    {tests.length === 1 ? 'test' : 'tests'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEditMembership && (
                  <Button
                    type="button"
                    data-testid="test-plan-detail-add-tests-button"
                    variant="primary"
                    size="sm"
                    disabled={refreshing}
                    onClick={() => setPickerOpen(true)}
                  >
                    <Plus size={13} />
                    Add tests
                  </Button>
                )}
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
              </div>
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

          {/* Progress card and close flow are still absent — BK-204 and
              BK-207 respectively, neither shipped. */}
          <TestPlanTestsTable
            planId={testPlan.id}
            tests={tests}
            canEdit={canEditMembership}
            onRemoved={handleRemoved}
          />
        </div>
      </div>

      <TestPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        planId={testPlan.id}
        projectId={testPlan.projectId}
        existingTestIds={new Set(tests.map(t => t.id))}
        onAdded={() => { void refetchTests(); }}
      />
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
