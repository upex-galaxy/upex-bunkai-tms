'use client';

import type { WorkspacePlan } from '@lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import { Meter, MeterWarningChip } from '@components/ui/meter';
import { formatPrice, meterFillPercent, meterLabel, meterState, PLAN_TIERS } from '@lib/billing/plan-tiers';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface BillingOverview {
  plan: WorkspacePlan
  active_seats: number
  project_count: number
  oldest_run_age_days: number | null
}

type ViewState = 'loading' | 'success' | 'error' | 'forbidden';

const FETCH_TIMEOUT_MS = 10_000;

interface BillingOverviewViewProps {
  workspaceId: string | null
}

// Client view for Settings > Billing (BK-229 — AC1-AC18). Owns the whole
// fetch/loading/error/retry lifecycle: the RPC's own step-0 admin gate is
// the single source of truth for access, so this component does not
// pre-guess who may see the page — a non-admin caller's 404 is rendered as
// an honest "not available" state, never a generic error, and never a 403
// (matches the route's non-disclosure contract).
export function BillingOverviewView({ workspaceId }: BillingOverviewViewProps) {
  const [state, setState] = useState<ViewState>('loading');
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const inFlight = useRef<AbortController | null>(null);

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
      // A superseded request (a newer `load()` call already aborted this
      // one, or the component unmounted) must never overwrite state a later
      // call already set — mirrors `ActivityView.tsx`'s abort guard.
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

  if (state === 'loading') {
    return <BillingOverviewSkeleton />;
  }

  if (state === 'forbidden') {
    return (
      <Card data-testid="billing-not-available">
        <CardContent className="p-4">
          <p className="text-sm text-fg-2">Billing isn&apos;t available for your role in this workspace. Only the owner and admins can view it.</p>
        </CardContent>
      </Card>
    );
  }

  if (state === 'error' || !overview) {
    return (
      <Card data-testid="billing-error">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal-fail" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg-0">Unable to load billing info</p>
            <p className="mt-1 text-sm text-fg-2">The request failed. Your plan is unchanged.</p>
            <button
              type="button"
              data-testid="billing-retry"
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

  const tier = PLAN_TIERS[overview.plan];
  const seatState = meterState(overview.active_seats, tier.seatLimit);
  const projectState = meterState(overview.project_count, tier.projectLimit);
  const retentionState = tier.retentionDays === null
    ? 'normal'
    : meterState(overview.oldest_run_age_days ?? 0, tier.retentionDays);

  return (
    <div className="flex flex-col gap-6" data-testid="billing-overview">
      {/* Plan card */}
      <Card data-testid="billing-plan-card">
        <CardContent className="flex items-start justify-between gap-6 p-6">
          <div>
            <div className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-fg-2">Current plan</div>
            <div className="mb-3 flex items-baseline gap-4">
              <h2 data-testid="billing-plan-name" className="text-lg font-bold leading-tight text-fg-0">{tier.displayName}</h2>
              <span className="font-mono text-base text-fg-1" data-testid="billing-plan-price">{formatPrice(tier)}</span>
            </div>
            {tier.renewalNote && (
              <div className="text-[12.5px] text-fg-2" data-testid="billing-renewal-note">{tier.renewalNote}</div>
            )}
          </div>
          {!tier.isPaid && (
            // BK-230 — D34(d): this was the BK-229 inert "soon" affordance;
            // it becomes a live link now that the upgrade flow ships. Owner
            // gating happens on /settings/billing/upgrade itself, not here —
            // any admin/member/viewer may open the comparison read-only
            // (Q4, 2026-08-17 ratification).
            <Link
              href="/settings/billing/upgrade"
              data-testid="billing-upgrade-entry"
              className="flex h-8 shrink-0 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-3 px-3 text-sm font-medium text-fg-1 hover:bg-surface-4"
            >
              Upgrade plan
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Seats */}
      <Card data-testid="billing-seats-card">
        <CardHeader className="border-b border-stroke-1 p-4">
          <CardTitle>Seats</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <Meter
            testId="billing-seats-meter"
            label="Active members"
            countLabel={meterLabel(overview.active_seats, tier.seatLimit, 'seats')}
            used={overview.active_seats}
            limit={tier.seatLimit}
            fillPercent={meterFillPercent(overview.active_seats, tier.seatLimit)}
            state={seatState}
            note="Active members only. Pending invitations and suspended members never count toward the limit."
          />
          {seatState !== 'normal' && (
            <div className="mt-2">
              <MeterWarningChip label={seatState === 'limit-reached' ? 'Limit reached' : 'Near limit'} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage */}
      <Card data-testid="billing-usage-card">
        <CardHeader className="border-b border-stroke-1 p-4">
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <Meter
            testId="billing-projects-meter"
            label="Projects"
            countLabel={meterLabel(overview.project_count, tier.projectLimit, 'projects')}
            used={overview.project_count}
            limit={tier.projectLimit}
            fillPercent={meterFillPercent(overview.project_count, tier.projectLimit)}
            state={projectState}
          />
          {projectState !== 'normal' && (
            <div className="mb-2">
              <MeterWarningChip label={projectState === 'limit-reached' ? 'Limit reached' : 'Near limit'} />
            </div>
          )}
          <Meter
            testId="billing-retention-meter"
            label="Run history retention"
            countLabel={tier.retentionDays === null
              ? 'Unlimited'
              : meterLabel(overview.oldest_run_age_days ?? 0, tier.retentionDays, 'days')}
            used={overview.oldest_run_age_days ?? 0}
            limit={tier.retentionDays}
            fillPercent={meterFillPercent(overview.oldest_run_age_days ?? 0, tier.retentionDays)}
            state={retentionState}
            note="Reflects how much of the plan's retention window is currently in use."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function BillingOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="billing-loading" role="status" aria-label="Loading billing data">
      <Card>
        <CardContent className="flex flex-col gap-2 p-6">
          <div className="h-3 w-1/3 animate-status-pulse rounded-1 bg-surface-3" />
          <div className="h-4 w-1/2 animate-status-pulse rounded-1 bg-surface-3" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-2 p-6">
          <div className="h-3 w-2/5 animate-status-pulse rounded-1 bg-surface-3" />
          <div className="h-1 w-full animate-status-pulse rounded-full bg-surface-3" />
        </CardContent>
      </Card>
    </div>
  );
}
