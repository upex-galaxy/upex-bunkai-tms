'use client';

import { Card } from '@components/ui/card';
import { FlaskConical, X } from 'lucide-react';
import { useState } from 'react';

// BK-203 — the plan's member-tests table (plan-detail.html:567-598 member
// table anatomy: test name, tags, added-by, per-row remove). Removing asks
// for a lightweight confirm (business-rules.md "Design intent") — a plain
// inline Yes/No swap in the row, matching this table's own scale rather than
// a separate confirm dialog. No kebab menu: neither the mockup nor any other
// list in this app uses one for a single row action (AtcChainPicker's own
// remove is a bare icon button).

export interface TestPlanMemberTest {
  id: string
  title: string
  tags: string[]
  addedByLabel: string
}

interface TestPlanTestsTableProps {
  planId: string
  tests: TestPlanMemberTest[]
  // Member+ gate — a viewer sees the table with the remove action
  // structurally absent (AC 5.1), and a closed plan hides it too (AC E1).
  canEdit: boolean
  onRemoved: (testId: string, memberCount: number) => void
}

interface ApiErrorBody {
  error?: { message?: string }
}

export function TestPlanTestsTable({ planId, tests, canEdit, onRemoved }: TestPlanTestsTableProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (tests.length === 0) {
    return (
      <Card>
        <div
          data-testid="test-plan-detail-tests-empty"
          className="flex flex-col items-center gap-2 px-4 py-8 pt-4 text-center"
        >
          <FlaskConical size={18} className="text-fg-3" />
          <span className="text-md font-semibold text-fg-1">This plan has no tests yet</span>
          <span className="max-w-[52ch] text-sm text-fg-3">
            {canEdit
              ? 'Add tests from the project\'s test library to give this plan a scope.'
              : 'No tests have been added to this plan yet.'}
          </span>
        </div>
      </Card>
    );
  }

  const handleRemove = async (testId: string) => {
    setRemovingId(testId);
    setError(null);
    try {
      const response = await fetch(`/api/v1/test-plans/${planId}/tests/${testId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(body.error?.message ?? 'Could not remove this test.');
        setRemovingId(null);
        setConfirmingId(null);
        return;
      }
      const body = (await response.json()) as { member_count: number };
      setRemovingId(null);
      setConfirmingId(null);
      onRemoved(testId, body.member_count);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setRemovingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      {error && (
        <p data-testid="test-plan-tests-table-error" className="m-0 border-b border-stroke-2 px-3 py-2 text-xs text-signal-fail">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Name', 'Tags', 'Added by', ...(canEdit ? [''] : [])].map(column => (
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
          <tbody data-testid="test-plan-tests-rows">
            {tests.map(test => (
              <tr key={test.id} data-testid={`test-plan-test-row-${test.id}`}>
                <td className="border-t border-stroke-1 px-3 py-1.5">
                  <span className="text-sm font-medium text-fg-0">{test.title}</span>
                </td>
                <td className="border-t border-stroke-1 px-3 py-1.5">
                  {test.tags.length > 0
                    ? (
                        <span className="text-xs text-fg-3">{test.tags.join(', ')}</span>
                      )
                    : <span className="text-sm text-fg-4">—</span>}
                </td>
                <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                  <span className="text-sm text-fg-2">{test.addedByLabel}</span>
                </td>
                {canEdit && (
                  <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5 text-right">
                    {confirmingId === test.id
                      ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-xs text-fg-3">Remove?</span>
                            <button
                              type="button"
                              data-testid={`test-plan-test-remove-confirm-${test.id}`}
                              disabled={removingId === test.id}
                              onClick={() => { void handleRemove(test.id); }}
                              className="rounded-1 px-1.5 py-0.5 text-xs font-medium text-signal-fail hover:bg-surface-3"
                            >
                              {removingId === test.id ? 'Removing…' : 'Yes'}
                            </button>
                            <button
                              type="button"
                              data-testid={`test-plan-test-remove-cancel-${test.id}`}
                              disabled={removingId === test.id}
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
                            data-testid={`test-plan-test-remove-${test.id}`}
                            aria-label={`Remove ${test.title} from this plan`}
                            title="Remove from this plan"
                            onClick={() => setConfirmingId(test.id)}
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
  );
}
