'use client';

import type { TestPlanStatus } from '@components/test-plans/TestPlanStatusChip';
import { TestPlanForm } from '@components/test-plans/TestPlanForm';
import { TestPlanStatusChip } from '@components/test-plans/TestPlanStatusChip';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { ClipboardList, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// BK-202 — the project-scoped Test Plans list (`/projects/[projectSlug]/
// plans`, the route the mockup names). Reuses the live Card + table grammar
// `/milestones` and `/bugs` already render with (master-design-plan §4.11 +
// Critical Rule #14 live-UI-first): the mockup is the inspiration, the
// shipped components are the source of truth for how it is built.
//
// Deliberately ABSENT versus the mockup, because neither has a data source in
// this story — the same treatment BK-205 applied to the milestone detail's
// readiness block (§5 D25), and absence rather than a disabled control:
//   - the Open/Closed segmented status filter (the BRIEF attributes it to
//     BK-207, and no plan can be Closed until that story ships)
//   - the mono `PLAN-001` id column (plans have a uuid, no human-facing key)
// The "Tests" count column IS rendered — scope.md lists it — and reads the
// plan's live membership count (BK-203).

export interface TestPlanListItem {
  id: string
  name: string
  description: string
  goal: string
  status: TestPlanStatus
  testCount: number
  creatorLabel: string
}

interface TestPlansListViewProps {
  projectId: string
  projectSlug: string
  testPlans: TestPlanListItem[]
  // Member+ gate — a viewer sees the list with the create action
  // STRUCTURALLY absent, not merely hidden (business-rules.md, AC 4.1).
  canCreate: boolean
}

const UNRESOLVED_CREATOR = 'a workspace member';

export function TestPlansListView({ projectId, projectSlug, testPlans, canCreate }: TestPlansListViewProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div data-testid="test-plans-list-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[900px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="m-0 text-md font-semibold text-fg-0">Test Plans</h1>
              <p className="m-0 text-xs text-fg-3">
                {testPlans.length}
                {' '}
                {testPlans.length === 1 ? 'plan' : 'plans'}
              </p>
            </div>
            {canCreate && !creating && (
              <Button
                type="button"
                data-testid="test-plans-new-button"
                variant="primary"
                size="sm"
                onClick={() => setCreating(true)}
              >
                <Plus size={13} />
                New plan
              </Button>
            )}
            {!canCreate && (
              <span data-testid="test-plans-viewer-note" className="text-xs text-fg-3">
                Creating test plans requires the member role or higher.
              </span>
            )}
          </div>

          {creating && (
            <TestPlanForm
              mode="create"
              targetId={projectId}
              onSaved={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          )}

          <Card className="overflow-hidden">
            {testPlans.length === 0
              ? (
                  <div
                    data-testid="test-plans-empty"
                    className="flex flex-col items-center gap-2 px-4 py-8 text-center"
                  >
                    <ClipboardList size={18} className="text-fg-3" />
                    <span className="text-md font-semibold text-fg-1">No test plans yet</span>
                    <span className="max-w-[52ch] text-sm text-fg-3">
                      {canCreate
                        ? 'A plan groups tests toward a goal — a release, a milestone, a hardening pass — so a cycle runs against an agreed scope instead of ad-hoc.'
                        : 'No test plan has been created for this project yet.'}
                    </span>
                    {canCreate && !creating && (
                      <Button
                        type="button"
                        data-testid="test-plans-empty-new-button"
                        variant="primary"
                        size="sm"
                        onClick={() => setCreating(true)}
                      >
                        <Plus size={13} />
                        Create first plan
                      </Button>
                    )}
                  </div>
                )
              : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {['Name', 'Goal / release', 'Status', 'Tests', 'Created by'].map(column => (
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
                      <tbody data-testid="test-plans-rows">
                        {testPlans.map(testPlan => (
                          <TestPlanRow key={testPlan.id} testPlan={testPlan} projectSlug={projectSlug} />
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

function TestPlanRow({ testPlan, projectSlug }: { testPlan: TestPlanListItem, projectSlug: string }) {
  return (
    <tr
      data-testid={`test-plan-row-${testPlan.id}`}
      className="cursor-pointer transition-colors duration-token ease-token hover:bg-surface-3"
    >
      <td className="border-t border-stroke-1 px-3 py-1.5">
        <Link
          href={`/projects/${projectSlug}/plans/${testPlan.id}`}
          className="text-sm font-medium text-fg-0 hover:underline focus-visible:underline"
        >
          {testPlan.name}
        </Link>
        {testPlan.description.length > 0 && (
          <span className="mt-0.5 block max-w-[46ch] truncate text-xs text-fg-3">
            {testPlan.description}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        {testPlan.goal.length > 0
          ? (
              <span className="inline-flex items-center rounded-1 border border-stroke-2 bg-surface-3 px-2 py-0.5 font-mono text-xs text-fg-2">
                {testPlan.goal}
              </span>
            )
          : <span className="text-sm text-fg-4">—</span>}
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <TestPlanStatusChip status={testPlan.status} testId={`test-plan-status-${testPlan.id}`} />
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2" data-testid={`test-plan-test-count-${testPlan.id}`}>
          {testPlan.testCount}
        </span>
        <span className="ml-1 text-xs text-fg-3">{testPlan.testCount === 1 ? 'test' : 'tests'}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="text-sm text-fg-2">{testPlan.creatorLabel || UNRESOLVED_CREATOR}</span>
      </td>
    </tr>
  );
}

export function TestPlansListSkeleton() {
  return (
    <div data-testid="test-plans-list-skeleton" className="flex flex-1 flex-col overflow-hidden">
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
