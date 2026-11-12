'use client';

import type { PlanLimitOwner, PlanLimitResource } from '@lib/billing/plan-limit';
import { buttonVariants } from '@components/ui/button';
import { ownerLabel, resourceNoun, usageLine } from '@lib/billing/plan-limit';
import { meterFillPercent } from '@lib/billing/plan-tiers';
import { cn } from '@lib/utils';
import { AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export const UPGRADE_HREF = '/settings/billing/upgrade';

interface PlanLimitBannerProps {
  workspaceId: string
  resource: PlanLimitResource
  // 'warning' = at 80% or more but below the cap; 'limit-reached' = at the cap
  // (a non-blocking notice: the blocking modal only opens when an action is refused).
  state: 'warning' | 'limit-reached'
  used: number
  limit: number
  planName: string
  isOwner: boolean
  owners: PlanLimitOwner[]
}

// Dismissal lives in sessionStorage for the browser session. The key carries the
// workspace, the resource AND the state, so a dismissed "approaching" banner
// comes back as "limit reached" when the count crosses the cap (BK-232).
export function dismissalKey(workspaceId: string, resource: PlanLimitResource, state: string): string {
  return `bk:plan-limit-banner:${workspaceId}:${resource}:${state}`;
}

function readDismissed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  }
  catch {
    return false;
  }
}

// Non-blocking, dismissible plan-limit banner (BK-232). Shared by every
// plan-limited resource: the caller passes the resource and numbers, the copy
// and the role split live here. Owners get a route to the upgrade flow; anyone
// else is told who the owner is and never sees a checkout.
export function PlanLimitBanner({ workspaceId, resource, state, used, limit, planName, isOwner, owners }: PlanLimitBannerProps) {
  const key = dismissalKey(workspaceId, resource, state);
  // `null` until the browser has been asked, so a dismissed banner never flashes.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    setDismissed(readDismissed(key));
  }, [key]);

  if (dismissed !== false) {
    return null;
  }

  const noun = resourceNoun(resource);
  const remaining = Math.max(0, limit - used);
  const reached = state === 'limit-reached';
  const owner = ownerLabel(owners);
  const title = reached ? `${capitalize(noun.singular)} limit reached` : 'Approaching plan limit';
  const body = reached
    ? `Your existing ${noun.plural} are untouched. Creating a new ${noun.singular} is blocked until the plan has room.`
    : `You can still create ${remaining} more. Nothing is blocked yet.`;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(key, '1');
    }
    catch {
      // Storage unavailable (private mode): dismissing still hides it for this render.
    }
    setDismissed(true);
  };

  return (
    <section
      role="status"
      data-testid="plan-limit-banner"
      data-state={state}
      data-resource={resource}
      className="flex shrink-0 items-start gap-4 border-b border-stroke-2 bg-signal-blocked-bg px-5 py-3"
    >
      <AlertTriangle size={16} className="mt-px shrink-0 text-signal-blocked" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-fg-0" data-testid="plan-limit-banner-title">{title}</p>
        <p className="mt-0.5 max-w-[68ch] text-sm text-fg-2" data-testid="plan-limit-banner-body">
          <span className="font-mono text-fg-0" data-testid="plan-limit-banner-usage">{usageLine(resource, used, limit)}</span>
          {` on the ${planName} plan. ${body} `}
          {isOwner
            ? (
                <Link href={UPGRADE_HREF} data-testid="plan-limit-banner-upgrade" className="text-fg-1 underline underline-offset-2 hover:text-fg-0">
                  Upgrade plan
                </Link>
              )
            : (
                <span data-testid="plan-limit-banner-owner">
                  {owner ? `Ask ${owner}, the workspace owner, to upgrade.` : 'Ask the workspace owner to upgrade.'}
                </span>
              )}
        </p>
        <div className="mt-2 flex items-center gap-3" aria-hidden="true">
          <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-4">
            <i className="block h-full bg-signal-blocked" style={{ width: `${meterFillPercent(used, limit)}%` }} />
          </div>
          <span className="font-mono text-2xs text-fg-3">{`${meterFillPercent(used, limit)}%`}</span>
        </div>
      </div>
      <button
        type="button"
        data-testid="plan-limit-banner-dismiss"
        aria-label="Dismiss for this session"
        onClick={dismiss}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0 text-fg-3')}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </section>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
