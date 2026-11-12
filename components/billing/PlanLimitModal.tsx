'use client';

import type { PlanLimitDetails } from '@lib/billing/plan-limit';
import { UPGRADE_HREF } from '@components/billing/PlanLimitBanner';
import { Button, buttonVariants } from '@components/ui/button';
import { ownerLabel, resourceNoun, usageLine } from '@lib/billing/plan-limit';
import { PLAN_TIERS } from '@lib/billing/plan-tiers';
import * as Dialog from '@radix-ui/react-dialog';
import { Info, Lock } from 'lucide-react';
import Link from 'next/link';

interface PlanLimitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  details: PlanLimitDetails
}

// Paywall-style modal for a creation the plan refused (BK-232). Shared by every
// plan-limited resource. Closing it has no side effect: the caller keeps the
// form and its values. Owner: one primary action routing to the upgrade flow.
// Everyone else: the owner's name and no checkout of any kind.
export function PlanLimitModal({ open, onOpenChange, details }: PlanLimitModalProps) {
  const noun = resourceNoun(details.resource);
  const planName = PLAN_TIERS[details.plan].displayName;
  const owner = ownerLabel(details.owners);
  const heading = `${noun.singular.charAt(0).toUpperCase()}${noun.singular.slice(1)} limit reached`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          data-testid="plan-limit-modal"
          data-role={details.is_owner ? 'owner' : 'non-owner'}
          className="fixed left-1/2 top-1/2 z-50 flex w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-3 border border-stroke-3 bg-surface-3 p-6 shadow-pop"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-7 items-center justify-center rounded-2 bg-signal-blocked-bg text-signal-blocked">
              <Lock size={15} aria-hidden="true" />
            </span>
            <Dialog.Title className="text-lg font-semibold text-fg-0">{heading}</Dialog.Title>
          </div>

          <Dialog.Description asChild>
            <div className="flex flex-col gap-3 text-base text-fg-1">
              <span className="font-mono text-sm text-fg-0" data-testid="plan-limit-modal-usage">
                {usageLine(details.resource, details.used, details.limit)}
              </span>
              <p className="m-0" data-testid="plan-limit-modal-body">
                {`The ${planName} plan caps this workspace at `}
                <span className="font-mono">{details.limit ?? 'unlimited'}</span>
                {` ${noun.plural}, so creating a new one is blocked until there is room on the plan. `}
                {details.is_owner
                  ? 'You can upgrade the plan now.'
                  : (owner
                      ? (
                          <>
                            {'Only the workspace owner can change the plan. Ask '}
                            <span className="font-semibold text-fg-0" data-testid="plan-limit-modal-owner">{owner}</span>
                            , the workspace owner, to upgrade.
                          </>
                        )
                      : (
                          <span data-testid="plan-limit-modal-owner">Only the workspace owner can change the plan. Ask the workspace owner to upgrade.</span>
                        ))}
              </p>
              <p className="m-0 text-sm text-fg-3">
                {`Your existing ${noun.plural} and their data are untouched: limits only gate new ones.`}
              </p>
              <p className="m-0 flex items-start gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-sm text-fg-2">
                <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-3" />
                <span>
                  {details.is_owner
                    ? 'After upgrading, retry the action. It succeeds right away in this same session.'
                    : 'Once the owner upgrades, retry the action. It succeeds right away in this same session.'}
                </span>
              </p>
            </div>
          </Dialog.Description>

          <div className="flex items-center justify-end gap-2">
            {details.is_owner
              ? (
                  <>
                    <Button type="button" variant="ghost" data-testid="plan-limit-modal-close" onClick={() => { onOpenChange(false); }}>
                      Cancel
                    </Button>
                    <Link href={UPGRADE_HREF} data-testid="plan-limit-modal-upgrade" className={buttonVariants({ variant: 'primary' })}>
                      Upgrade plan
                    </Link>
                  </>
                )
              : (
                  <Button type="button" data-testid="plan-limit-modal-close" onClick={() => { onOpenChange(false); }}>
                    Got it
                  </Button>
                )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
