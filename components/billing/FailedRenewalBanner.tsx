'use client';

import { formatUtcDateTime, readApiError } from '@components/billing/billing-format';
import { Button } from '@components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface FailedRenewalBannerProps {
  workspaceId: string
  graceEndsAt: string
  subscriptionState: 'grace_period' | 'free_after_grace'
  canEdit: boolean
  retryAvailable: boolean
  onReplacePaymentMethod: () => void
  onRecovered: () => void
}

const RETRY_FALLBACK_MESSAGE = 'Could not retry the charge. Please try again.';

// Persistent failed-renewal banner (BK-231). Stays above the billing details
// until the charge succeeds. The owner gets "Replace payment method" and a
// "Retry charge" that stays disabled until a new payment method is on file
// (server rule: 409 `retry_not_available` otherwise). An admin reads the same
// text but the action buttons are structurally absent, not just disabled.
export function FailedRenewalBanner({
  workspaceId,
  graceEndsAt,
  subscriptionState,
  canEdit,
  retryAvailable,
  onReplacePaymentMethod,
  onRecovered,
}: FailedRenewalBannerProps) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = formatUtcDateTime(graceEndsAt);
  const body = subscriptionState === 'grace_period'
    ? (date
        ? `Your workspace keeps its paid limits until ${date} UTC.`
        : 'Your workspace keeps its paid limits until the grace period ends.')
    : (date
        ? `Your grace period ended on ${date} UTC. This workspace is on Community limits and nothing was deleted. Replace the payment method and retry the charge to restore your plan.`
        : 'Your grace period has ended. This workspace is on Community limits and nothing was deleted. Replace the payment method and retry the charge to restore your plan.');

  const retry = async () => {
    if (retrying || !retryAvailable) { return; }
    setRetrying(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/retry`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      if (!response.ok) {
        const info = await readApiError(response);
        setError(info.message ?? RETRY_FALLBACK_MESSAGE);
        return;
      }
      onRecovered();
    }
    catch {
      setError(RETRY_FALLBACK_MESSAGE);
    }
    finally {
      setRetrying(false);
    }
  };

  return (
    <section
      role="status"
      data-testid="failed-renewal-banner"
      data-state={subscriptionState}
      className="flex items-start gap-4 rounded-3 border border-stroke-2 bg-signal-blocked-bg px-6 py-5"
    >
      <AlertTriangle size={18} className="mt-px shrink-0 text-signal-blocked" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-base font-semibold text-fg-0">Renewal charge failed</p>
        <p className="mt-0.5 max-w-[62ch] text-sm text-fg-2" data-testid="failed-renewal-body">{body}</p>

        {canEdit
          ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="button" data-testid="failed-renewal-replace" onClick={onReplacePaymentMethod}>
                  Replace payment method
                </Button>
                <Button
                  type="button"
                  data-testid="failed-renewal-retry"
                  disabled={!retryAvailable || retrying}
                  aria-busy={retrying}
                  aria-describedby={retryAvailable ? undefined : 'failed-renewal-retry-note'}
                  onClick={() => { void retry(); }}
                >
                  <RefreshCw size={13} aria-hidden="true" className={retrying ? 'motion-safe:animate-spin' : undefined} />
                  {retrying ? 'Retrying charge…' : 'Retry charge'}
                </Button>
                {!retryAvailable && (
                  <span id="failed-renewal-retry-note" data-testid="failed-renewal-retry-note" className="text-sm text-fg-3">
                    Retry becomes available once a new payment method is on file.
                  </span>
                )}
              </div>
            )
          : (
              <p className="mt-3 text-sm text-fg-3" data-testid="failed-renewal-owner-only">
                Only the workspace owner can fix this.
              </p>
            )}

        {error && (
          <p role="alert" data-testid="failed-renewal-error" className="mt-3 text-sm text-signal-fail">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
