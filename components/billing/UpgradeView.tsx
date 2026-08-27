'use client';

import type { WorkspacePlan } from '@lib/types';
import { Button } from '@components/ui/button';
import { Card, CardContent } from '@components/ui/card';
import { PLAN_TIERS } from '@lib/billing/plan-tiers';
import { resolveSeatQuantityBounds } from '@lib/billing/seat-quantity';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface BillingOverview {
  plan: WorkspacePlan
  active_seats: number
}

type ViewState = 'loading' | 'success' | 'error' | 'forbidden';

const FETCH_TIMEOUT_MS = 10_000;
const SALES_EMAIL = 'sales@bunkai.dev';

interface UpgradeViewProps {
  workspaceId: string | null
  isOwner: boolean
}

// Client view for Settings > Billing > Upgrade (BK-230). Reuses the same
// fetch/loading/error/retry lifecycle shape as BillingOverviewView. Owns:
// the tier comparison, the owner-only seat-quantity step, starting checkout
// (redirect to Stripe), and the return-from-Stripe cancel handling.
//
// `isOwner` gates ONLY the seat step's visibility — never trust it as the
// authorization boundary (the checkout route re-verifies
// bunkai_is_workspace_owner server-side on every write).
export function UpgradeView({ workspaceId, isOwner }: UpgradeViewProps) {
  const [state, setState] = useState<ViewState>('loading');
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [seatStepOpen, setSeatStepOpen] = useState(false);
  const [seatQuantity, setSeatQuantity] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [canceledBanner, setCanceledBanner] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const load = useCallback(async () => {
    if (!workspaceId) {
      setState('error');
      return;
    }
    setState('loading');
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing`, { signal: controller.signal });
      if (controller.signal.aborted) { return; }
      if (response.status === 404) {
        setState('forbidden');
        return;
      }
      if (!response.ok) {
        setState('error');
        return;
      }
      const data = await response.json() as BillingOverview;
      if (controller.signal.aborted) { return; }
      setOverview(data);
      setSeatQuantity(resolveSeatQuantityBounds(data.active_seats).min);
      setState('success');
    }
    catch {
      if (controller.signal.aborted) { return; }
      setState('error');
    }
    finally {
      clearTimeout(timeout);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  // Landing back from Stripe's cancel_url: release the one-open-session
  // lock immediately instead of stranding the owner for the session's TTL.
  // Fires at most once per mount — the query param is stripped afterward so
  // a manual refresh does not re-fire the cancel call.
  useEffect(() => {
    if (!workspaceId || searchParams.get('checkout') !== 'canceled') {
      return;
    }
    setCanceledBanner(true);
    void fetch(`/api/v1/workspaces/${workspaceId}/billing/checkout/cancel`, { method: 'POST' })
      .catch(() => {
        // Best-effort — Stripe's own checkout.session.expired webhook (or a
        // 30-minute TTL) releases the lock regardless.
      });
    router.replace('/settings/billing/upgrade');
    // Deliberately scoped to `workspaceId` only — this must fire once per
    // mount when `?checkout=canceled` is present, not on every
    // router/searchParams identity change `router.replace` itself causes.
  }, [workspaceId]);

  const startCheckout = useCallback(async () => {
    if (!workspaceId || seatQuantity === null) { return; }
    setCheckoutError(null);
    setRedirecting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ seat_quantity: seatQuantity }),
      });
      const body = await response.json().catch(() => null) as { url?: string, error?: { message?: string } } | null;
      if (!response.ok || !body?.url) {
        setCheckoutError(body?.error?.message ?? 'Could not start checkout. Please try again.');
        setRedirecting(false);
        return;
      }
      window.location.href = body.url;
    }
    catch {
      setCheckoutError('Could not start checkout. Please try again.');
      setRedirecting(false);
    }
  }, [workspaceId, seatQuantity]);

  if (state === 'loading') {
    return <UpgradeSkeleton />;
  }

  if (state === 'forbidden') {
    return (
      <Card data-testid="upgrade-not-available">
        <CardContent className="p-4">
          <p className="text-sm text-fg-2">Billing isn&apos;t available for your role in this workspace. Only the owner and admins can view it.</p>
        </CardContent>
      </Card>
    );
  }

  if (state === 'error' || !overview) {
    return (
      <Card data-testid="upgrade-error">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal-fail" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg-0">Unable to load billing info</p>
            <p className="mt-1 text-sm text-fg-2">The request failed. Your plan is unchanged.</p>
            <button
              type="button"
              data-testid="upgrade-retry"
              onClick={() => { void load(); }}
              className="mt-3 inline-flex h-8 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-3 px-3 text-sm font-medium text-fg-1 hover:bg-surface-4"
            >
              <RefreshCw size={13} aria-hidden="true" />
              Retry
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const bounds = resolveSeatQuantityBounds(overview.active_seats);

  return (
    <div className="flex flex-col gap-6" data-testid="upgrade-view">
      {canceledBanner && (
        <div className="rounded-2 border border-stroke-2 bg-surface-2 px-4 py-3 text-sm text-fg-2" data-testid="upgrade-canceled-banner">
          Checkout canceled. Nothing was charged.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="upgrade-comparison">
        <TierColumn
          planKey="community"
          isCurrent={overview.plan === 'community'}
          isOwner={isOwner}
          onUpgradeClick={() => setSeatStepOpen(true)}
        />
        <TierColumn
          planKey="cloud"
          isCurrent={overview.plan === 'cloud'}
          isOwner={isOwner}
          onUpgradeClick={() => setSeatStepOpen(true)}
        />
        <TierColumn
          planKey="enterprise"
          isCurrent={overview.plan === 'enterprise'}
          isOwner={isOwner}
          onUpgradeClick={() => setSeatStepOpen(true)}
        />
      </div>

      {seatStepOpen && overview.plan === 'community' && isOwner && seatQuantity !== null && (
        <Card data-testid="upgrade-seat-step">
          <CardContent className="flex flex-col gap-3 p-4">
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-fg-2">Seats</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease seats"
                data-testid="upgrade-seat-minus"
                onClick={() => setSeatQuantity(q => Math.max(bounds.min, (q ?? bounds.min) - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-2 border border-stroke-2 bg-surface-3 text-fg-1 hover:bg-surface-4"
              >
                −
              </button>
              <span className="min-w-[2ch] text-center font-mono text-base text-fg-0" data-testid="upgrade-seat-count">{seatQuantity}</span>
              <button
                type="button"
                aria-label="Increase seats"
                data-testid="upgrade-seat-plus"
                onClick={() => setSeatQuantity(q => Math.min(bounds.max, (q ?? bounds.min) + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-2 border border-stroke-2 bg-surface-3 text-fg-1 hover:bg-surface-4"
              >
                +
              </button>
              <span className="text-[12.5px] text-fg-3">
                {bounds.min}
                –
                {bounds.max}
                {' '}
                seats on Cloud
              </span>
            </div>
            <p className="text-[12.5px] text-fg-3">You&apos;ll see your exact rate on the next screen (Stripe Checkout).</p>
            {checkoutError && (
              <p className="text-sm text-signal-fail" data-testid="upgrade-checkout-error">{checkoutError}</p>
            )}
            <Button
              type="button"
              variant="primary"
              data-testid="upgrade-continue-to-payment"
              disabled={redirecting || bounds.min > bounds.max}
              onClick={() => { void startCheckout(); }}
            >
              {redirecting ? 'Redirecting to Stripe…' : 'Continue to payment'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface TierColumnProps {
  planKey: WorkspacePlan
  isCurrent: boolean
  isOwner: boolean
  onUpgradeClick: () => void
}

function TierColumn({ planKey, isCurrent, isOwner, onUpgradeClick }: TierColumnProps) {
  const tier = PLAN_TIERS[planKey];

  return (
    <Card data-testid={`upgrade-tier-${planKey}`} data-current={isCurrent}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-fg-0">{tier.displayName}</h2>
          {isCurrent && (
            <span className="rounded-1 border border-stroke-2 px-1.5 py-px font-mono text-2xs uppercase tracking-wide text-fg-3">Current plan</span>
          )}
        </div>
        <ul className="flex flex-col gap-1 text-sm text-fg-2">
          <li>
            Seats
            {' '}
            <span className="text-fg-0">{tier.seatLimit ?? 'unlimited'}</span>
          </li>
          <li>
            Projects
            {' '}
            <span className="text-fg-0">{tier.projectLimit ?? 'unlimited'}</span>
          </li>
          <li>
            History retention
            {' '}
            <span className="text-fg-0">{tier.retentionDays ? `${tier.retentionDays}d` : 'unlimited'}</span>
          </li>
        </ul>

        {planKey === 'cloud' && (
          <p className="text-[12.5px] text-fg-3">See your exact rate on the next screen (Stripe Checkout).</p>
        )}
        {planKey === 'enterprise' && (
          <p className="text-[12.5px] text-fg-3">Sales-assisted. No self-serve checkout — our team scopes seats, data residency, and contract terms with you.</p>
        )}

        {isCurrent
          ? null
          : planKey === 'enterprise'
            ? (
                <a
                  href={`mailto:${SALES_EMAIL}`}
                  data-testid="upgrade-contact-sales"
                  className="inline-flex h-8 items-center justify-center rounded-2 border border-stroke-2 bg-surface-3 px-3 text-sm font-medium text-fg-1 hover:bg-surface-4"
                >
                  Contact sales
                </a>
              )
            : planKey === 'cloud'
              ? isOwner
                ? (
                    <Button type="button" variant="primary" data-testid="upgrade-cta-cloud" onClick={onUpgradeClick}>
                      Upgrade to Cloud
                    </Button>
                  )
                : (
                    <p className="text-[12.5px] text-fg-3" data-testid="upgrade-owner-only-note">
                      Only the workspace owner can upgrade the plan. Ask the workspace owner to confirm this change.
                    </p>
                  )
              : null}
      </CardContent>
    </Card>
  );
}

function UpgradeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="upgrade-loading" role="status" aria-label="Loading plan comparison">
      {[0, 1, 2].map(i => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="h-3 w-1/3 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-4 w-2/3 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-4 w-1/2 animate-status-pulse rounded-1 bg-surface-3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
