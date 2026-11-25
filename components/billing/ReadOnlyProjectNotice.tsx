import { Lock } from 'lucide-react';
import Link from 'next/link';

export function ReadOnlyProjectNotice() {
  return (
    <div
      role="status"
      data-testid="project-read-only-notice"
      className="flex items-center gap-2 border-b border-stroke-1 bg-signal-blocked-bg px-4 py-2 text-sm text-fg-1"
    >
      <Lock size={13} className="shrink-0 text-signal-blocked" aria-hidden="true" />
      <span>
        Read-only: this workspace is over its plan&apos;s project limit. Everything stays viewable; nothing was deleted.
      </span>
      <Link href="/settings/billing" className="ml-auto shrink-0 text-fg-0 underline underline-offset-2 hover:text-accent">
        See billing
      </Link>
    </div>
  );
}
