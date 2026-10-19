'use client';

import type { PlanVerdict } from '@lib/test-plans/close-validation';
import { Button } from '@components/ui/button';
import { normalizePlanSummary, PLAN_SUMMARY_MAX, PLAN_VERDICTS, planSummaryLength } from '@lib/test-plans/close-validation';
import { notRunWarning, verdictChipToken, verdictLabel } from '@lib/test-plans/close-view';
import { cn } from '@lib/utils';
import { AlertTriangle, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// BK-207 — the "Close plan" confirmation dialog: a required verdict (passed | failed),
// an optional plain-text outcome summary and, when some member tests were never run, a
// warning that names the count. The warning informs and never blocks (ratified
// 2026-10-04). Same modal family as TestPickerDialog / BugFormDialog (fixed inset,
// role="dialog"). The server RPC is the enforcement point: the verdict-required message
// shown here is the SAME one the API answers with (lib/test-plans/close-validation.ts).

interface CloseTestPlanDialogProps {
  open: boolean
  onClose: () => void
  planId: string
  planName: string
  // Member tests with no run at all, from the live progress read. null when that read
  // failed: no count is shown rather than a guessed one.
  notRunCount: number | null
  onClosed: () => void
}

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export function CloseTestPlanDialog({ open, onClose, planId, planName, notRunCount, onClosed }: CloseTestPlanDialogProps) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<PlanVerdict | null>(null);
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) { return null; }

  const warning = notRunCount === null ? null : notRunWarning(notRunCount);
  // The bound applies AFTER trimming (same rule as the server), so a trailing newline
  // never counts against the 4000 characters.
  const summaryLength = planSummaryLength(normalizePlanSummary(summary) ?? '');
  const summaryTooLong = summaryLength > PLAN_SUMMARY_MAX;

  const dismiss = () => {
    if (submitting) { return; }
    // Cancel leaves nothing behind: the next open starts clean (AC 2.2).
    setVerdict(null);
    setSummary('');
    setError(null);
    onClose();
  };

  // A stray click outside must not wipe a typed outcome summary or a chosen verdict;
  // Cancel stays the explicit way to discard.
  const backdropDismiss = () => {
    if (summary !== '' || verdict !== null) { return; }
    dismiss();
  };

  const confirm = async () => {
    if (submitting) { return; }
    if (verdict === null) {
      setError('Select a verdict (passed or failed) to close the plan.');
      return;
    }
    if (summaryTooLong) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/test-plans/${planId}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verdict, summary }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(body.error?.message ?? 'Could not close the plan.');
        setSubmitting(false);
        // 409: the plan changed under us (already closed elsewhere). Re-read the real state.
        if (response.status === 409) { router.refresh(); }
        return;
      }
      setSubmitting(false);
      setVerdict(null);
      setSummary('');
      onClosed();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={backdropDismiss}>
      <div
        data-testid="close-plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Close plan"
        className="flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-y-auto rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-fg-1">
          <Lock size={13} />
          Close plan
        </div>
        <p data-testid="close-plan-dialog-name" className="m-0 mb-3 text-sm text-fg-2">
          You are about to close
          {' '}
          <span className="font-medium text-fg-0">{planName}</span>
          . It becomes read-only history and its progress is frozen as it stands now.
        </p>

        {warning && (
          <div
            data-testid="close-plan-not-run-warning"
            role="status"
            className="mb-3 flex items-start gap-2 rounded-2 border border-signal-blocked-bg bg-signal-blocked-bg px-3 py-2 text-xs text-signal-blocked"
          >
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {warning}
          </div>
        )}

        <div role="radiogroup" aria-label="Verdict" className="mb-3">
          <span className="mb-1.5 block text-xs font-medium text-fg-2">
            Verdict
            {' '}
            <span className="font-normal text-fg-3">(required)</span>
          </span>
          <div className="flex gap-2">
            {PLAN_VERDICTS.map(option => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={verdict === option}
                data-testid={`close-plan-verdict-${option}`}
                disabled={submitting}
                onClick={() => {
                  setVerdict(option);
                  if (error) { setError(null); }
                }}
                className={cn(
                  'flex flex-1 items-center gap-2 rounded-2 border px-3 py-2 text-left text-sm transition-colors duration-token ease-token',
                  verdict === option
                    ? 'border-accent bg-accent-soft text-fg-0'
                    : 'border-stroke-2 bg-surface-2 text-fg-1 hover:border-stroke-3 hover:bg-surface-3',
                )}
              >
                <span className="dot" data-status={verdictChipToken(option)} />
                {verdictLabel(option)}
              </button>
            ))}
          </div>
        </div>

        <label className="mb-1 block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-fg-2">
            <span>
              Outcome summary
              {' '}
              <span className="font-normal text-fg-3">(optional)</span>
            </span>
            <span
              data-testid="close-plan-summary-counter"
              className={cn('font-mono text-2xs', summaryTooLong ? 'text-signal-fail' : 'text-fg-3')}
            >
              {summaryLength}
              /
              {PLAN_SUMMARY_MAX}
            </span>
          </span>
          <textarea
            data-testid="close-plan-summary"
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              if (error) { setError(null); }
            }}
            disabled={submitting}
            rows={5}
            placeholder="What the cycle found, known gaps, who accepted them"
            className="w-full rounded-2 border border-stroke-2 bg-surface-1 px-3 py-2 text-sm text-fg-0 outline-none transition-colors duration-token ease-token placeholder:text-fg-4 focus-visible:border-accent"
          />
        </label>
        {summaryTooLong && (
          <span data-testid="close-plan-summary-hint" className="mb-1 block text-xs text-signal-fail">
            Outcome summary must be
            {' '}
            {PLAN_SUMMARY_MAX}
            {' '}
            characters or fewer.
          </span>
        )}

        {error && (
          <p data-testid="close-plan-error" role="alert" className="m-0 mt-2 text-xs text-signal-fail">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-stroke-2 pt-3">
          <Button type="button" variant="ghost" size="sm" data-testid="close-plan-cancel" onClick={dismiss} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="close-plan-confirm"
            onClick={() => { void confirm(); }}
            disabled={submitting || summaryTooLong}
          >
            {submitting ? 'Closing…' : 'Close plan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
