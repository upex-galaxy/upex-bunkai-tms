import { UPGRADE_HREF } from '@components/billing/PlanLimitBanner';
import { buttonVariants } from '@components/ui/button';
import { cn } from '@lib/utils';
import { Lock } from 'lucide-react';
import Link from 'next/link';

export type ReadOnlyAudience = 'owner' | 'admin' | 'other';

export function readOnlyRestoreLine(audience: ReadOnlyAudience): string {
  return audience === 'owner'
    ? 'Upgrade the billing plan to edit it again.'
    : 'Ask the workspace owner to upgrade the billing plan to edit it again.';
}

export function ReadOnlyProjectNotice({ audience }: { audience: ReadOnlyAudience }) {
  return (
    <div
      role="status"
      data-testid="project-read-only-notice"
      data-audience={audience}
      className="flex items-center gap-2 border-b border-stroke-1 bg-signal-blocked-bg px-4 py-2 text-sm text-fg-1"
    >
      <Lock size={13} className="shrink-0 text-signal-blocked" aria-hidden="true" />
      <span>
        {`Read-only: this workspace is over its plan's project limit. Everything stays viewable; nothing was deleted. ${readOnlyRestoreLine(audience)}`}
      </span>
      {audience !== 'other' && (
        <Link href="/settings/billing" data-testid="project-read-only-billing" className="ml-auto shrink-0 text-fg-0 underline underline-offset-2 hover:text-accent">
          See billing
        </Link>
      )}
    </div>
  );
}

export function ReadOnlyExplorerHint({ audience }: { audience: ReadOnlyAudience }) {
  return (
    <>
      <p data-testid="modules-empty-read-only" className="text-xs text-fg-4">
        {`This project is read-only because the workspace is over its plan's project limit. ${readOnlyRestoreLine(audience)}`}
      </p>
      {audience === 'owner' && (
        <Link href={UPGRADE_HREF} data-testid="modules-empty-upgrade" className={cn(buttonVariants(), 'mt-1')}>
          Upgrade plan
        </Link>
      )}
    </>
  );
}
