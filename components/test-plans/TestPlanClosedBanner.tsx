'use client';

import type { PlanVerdict } from '@lib/test-plans/close-validation';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { closedByLine, verdictChipToken, verdictLabel } from '@lib/test-plans/close-view';
import { Lock, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// BK-207 — the locked presentation of a closed plan: lock badge (its tooltip explains
// the immutability), verdict chip, closed-by / closed-at line, the outcome summary as a
// quiet panel and, for the creator or an admin, Reopen. Reopening asks for a second click
// because it clears the verdict, the summary and the frozen progress (the close and
// reopen entries stay in the plan's history).

interface TestPlanClosedBannerProps {
  planId: string
  verdict: PlanVerdict | null
  summary: string | null
  closedByLabel: string
  closedAtIso: string | null
  canReopen: boolean
}

interface ApiErrorBody {
  error?: { message?: string }
}

export function TestPlanClosedBanner({ planId, verdict, summary, closedByLabel, closedAtIso, canReopen }: TestPlanClosedBannerProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reopen = async () => {
    if (submitting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/test-plans/${planId}/reopen`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(body.error?.message ?? 'Could not reopen the plan.');
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setConfirming(false);
      router.refresh();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <div data-testid="test-plan-closed-banner" className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="test-plan-lock-badge"
            title="This plan is closed. Its verdict, summary and progress are frozen history and cannot be changed unless it is reopened."
            className="inline-flex items-center gap-1 rounded-1 border border-stroke-2 bg-surface-3 px-2 py-0.5 text-xs font-medium text-fg-2"
          >
            <Lock size={11} />
            Closed · read-only
          </span>
          {verdict && (
            <span data-testid="test-plan-verdict-chip" className="status-chip" data-status={verdictChipToken(verdict)}>
              <span className="dot" data-status={verdictChipToken(verdict)} />
              {verdictLabel(verdict)}
            </span>
          )}
          <span data-testid="test-plan-closed-by" className="text-xs text-fg-3">
            {closedByLine({ closedByLabel, closedAtIso })}
          </span>
          {canReopen && !confirming && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="test-plan-reopen-button"
              className="ml-auto"
              onClick={() => setConfirming(true)}
            >
              <RotateCcw size={13} />
              Reopen plan
            </Button>
          )}
        </div>

        {summary && (
          <p
            data-testid="test-plan-summary"
            className="m-0 whitespace-pre-wrap rounded-2 border border-stroke-1 bg-surface-2 px-3 py-2 text-sm text-fg-1"
          >
            {summary}
          </p>
        )}

        {canReopen && confirming && (
          <div data-testid="test-plan-reopen-confirm" className="flex flex-wrap items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2">
            <span className="flex-1 text-xs text-fg-2">
              Reopening clears the verdict, the summary and the frozen progress. The close stays in the plan&apos;s history.
            </span>
            <Button type="button" variant="primary" size="sm" data-testid="test-plan-reopen-confirm-button" disabled={submitting} onClick={() => { void reopen(); }}>
              {submitting ? 'Reopening…' : 'Reopen'}
            </Button>
            <Button type="button" variant="ghost" size="sm" data-testid="test-plan-reopen-cancel" disabled={submitting} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}

        {error && (
          <p data-testid="test-plan-reopen-error" role="alert" className="m-0 text-xs text-signal-fail">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
