'use client';

import type { AttachedPlanReadiness } from '@lib/milestones/readiness-view';
import { PlanMiniBar } from '@components/test-plans/TestPlanProgress';
import { TestPlanStatusChip } from '@components/test-plans/TestPlanStatusChip';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { asProgressSummary } from '@lib/milestones/readiness-view';
import { Layers, Lock, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// BK-206 — "Attached test plans" (`milestones-board.html` attached-plans table): one
// row per plan with its own status, passed-of-tests count and the live mini bar
// (`PlanMiniBar`, BK-204), each plan's OWN progress beside the milestone's pooled
// figure (AC 2.2). A closed plan shows the progress it froze at close time (BK-207).
// The name opens the plan's detail page (the app's routed equivalent of the mockup's
// tab click-through). No PLAN id column: plans have a uuid, no short id (same as D46).
//
// Detach is a per-row icon with the same inline Yes/No confirm the plan's own
// member-tests table uses; it is structurally absent for a viewer (AC 4.8, 5.3).
// Detaching never touches the plan: the row simply leaves this milestone.
// The empty card keeps BK-205's `milestone-detail-plans-empty` test id (existing ids
// are never renamed).

interface MilestoneAttachedPlansProps {
  projectId: string
  projectSlug: string
  milestoneId: string
  plans: AttachedPlanReadiness[]
  canEdit: boolean
  onAttach: () => void
  onDetached: () => void
}

interface ApiErrorBody {
  error?: { message?: string }
}

export function MilestoneAttachedPlans({ projectId, projectSlug, milestoneId, plans, canEdit, onAttach, onDetached }: MilestoneAttachedPlansProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [detachingId, setDetachingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDetach = async (planId: string) => {
    setDetachingId(planId);
    setError(null);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/milestones/${milestoneId}/plans/${planId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(body.error?.message ?? 'Could not detach this test plan.');
        return;
      }
      onDetached();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setDetachingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <section data-testid="milestone-attached-plans" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="m-0 text-sm font-semibold text-fg-1">Attached test plans</h2>
        <span data-testid="milestone-attached-count" className="font-mono text-xs text-fg-3">{plans.length}</span>
      </div>

      {plans.length === 0
        ? (
            <Card>
              <div
                data-testid="milestone-detail-plans-empty"
                className="flex flex-col items-center gap-2 px-4 py-8 pt-4 text-center"
              >
                <Layers size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">No test plans attached yet</span>
                <span className="max-w-[52ch] text-sm text-fg-3">
                  Attach the test plans that gate this milestone. Their pass rates roll up into one readiness
                  number, and detaching a plan here never changes the plan itself.
                </span>
                {canEdit
                  ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        data-testid="milestone-attached-empty-attach-button"
                        onClick={onAttach}
                      >
                        <Plus size={13} />
                        Attach test plans
                      </Button>
                    )
                  : (
                      <span data-testid="milestone-attached-viewer-note" className="inline-flex items-center gap-1.5 text-xs text-fg-3">
                        <Lock size={12} />
                        Attaching test plans requires the member role or higher.
                      </span>
                    )}
              </div>
            </Card>
          )
        : (
            <Card className="overflow-hidden">
              {error && (
                <p data-testid="milestone-attached-error" className="m-0 border-b border-stroke-2 px-3 py-2 text-xs text-signal-fail">
                  {error}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Name', 'Status', 'Tests passed', 'Plan progress', ...(canEdit ? [''] : [])].map(column => (
                        <th
                          key={column || 'actions'}
                          scope="col"
                          className="whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody data-testid="milestone-attached-rows">
                    {plans.map(plan => (
                      <tr key={plan.plan_id} data-testid={`milestone-attached-row-${plan.plan_id}`}>
                        <td className="border-t border-stroke-1 px-3 py-1.5">
                          <Link
                            href={`/projects/${projectSlug}/plans/${plan.plan_id}`}
                            className="text-sm font-medium text-fg-0 hover:underline focus-visible:underline"
                          >
                            {plan.name}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <TestPlanStatusChip status={plan.status} testId={`milestone-attached-status-${plan.plan_id}`} />
                        </td>
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <span data-testid={`milestone-attached-passed-${plan.plan_id}`} className="font-mono text-xs text-fg-2">
                            {plan.counts.passed}
                            /
                            {plan.member_count}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <PlanMiniBar
                            planId={plan.plan_id}
                            summary={asProgressSummary({ id: plan.plan_id, member_count: plan.member_count, passed_pct: plan.passed_pct, counts: plan.counts })}
                          />
                        </td>
                        {canEdit && (
                          <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5 text-right">
                            {confirmingId === plan.plan_id
                              ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="text-xs text-fg-3">Detach?</span>
                                    <button
                                      type="button"
                                      data-testid={`milestone-attached-detach-confirm-${plan.plan_id}`}
                                      disabled={detachingId === plan.plan_id}
                                      onClick={() => { void handleDetach(plan.plan_id); }}
                                      className="rounded-1 px-1.5 py-0.5 text-xs font-medium text-signal-fail hover:bg-surface-3"
                                    >
                                      {detachingId === plan.plan_id ? 'Detaching…' : 'Yes'}
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`milestone-attached-detach-cancel-${plan.plan_id}`}
                                      disabled={detachingId === plan.plan_id}
                                      onClick={() => setConfirmingId(null)}
                                      className="rounded-1 px-1.5 py-0.5 text-xs text-fg-3 hover:bg-surface-3"
                                    >
                                      No
                                    </button>
                                  </span>
                                )
                              : (
                                  <button
                                    type="button"
                                    data-testid={`milestone-attached-detach-${plan.plan_id}`}
                                    aria-label={`Detach ${plan.name} from this milestone`}
                                    title="Detach from this milestone"
                                    onClick={() => setConfirmingId(plan.plan_id)}
                                    className="inline-flex shrink-0 rounded-1 p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg-0"
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
    </section>
  );
}
