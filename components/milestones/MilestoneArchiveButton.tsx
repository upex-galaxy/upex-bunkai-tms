'use client';

import { Button } from '@components/ui/button';
import { runArchiveAction } from '@lib/milestones/archive-action';
import { setMilestoneArchived } from '@lib/milestones/archive-client';
import { ARCHIVED_LABEL } from '@lib/milestones/archive-view';
import { Archive, ArchiveRestore } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

// BK-1899 — the one Archive / Restore control, mounted on the list row and on the
// Milestone's own screen (AI Product Owner P11: one click, no confirmation dialog,
// because it is reversible with one click and changes nothing the Milestone
// groups). While the request runs the button is disabled and says so; success
// names the Milestone and refreshes the route; a failure leaves everything where
// it was and offers Try again. Rendered only for members who can write: a Viewer's
// render has no control at all (business rule "a Viewer reads, never acts").

interface MilestoneArchiveButtonProps {
  milestoneId: string
  name: string
  archived: boolean
  projectSlug: string
  testId: string
  variant?: 'ghost' | 'default' | 'primary'
}

export function MilestoneArchiveButton({ milestoneId, name, archived, projectSlug, testId, variant = 'ghost' }: MilestoneArchiveButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // The toast's Try again lives outside the disabled button, so a second request
  // is refused here while one is in flight.
  const inFlight = useRef(false);

  const run = async () => {
    if (inFlight.current) { return; }
    inFlight.current = true;
    setPending(true);
    try {
      await runArchiveAction(
        { milestoneId, name, archived, projectSlug },
        {
          request: setMilestoneArchived,
          success: (message, options) => { toast.success(message, options); },
          error: (message, options) => { toast.error(message, options); },
          push: (href) => { router.push(href); },
          refresh: () => { router.refresh(); },
        },
        () => { void run(); },
      );
    }
    finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const Icon = archived ? ArchiveRestore : Archive;
  const idleLabel = archived ? 'Restore' : 'Archive';
  const pendingLabel = archived ? 'Restoring…' : 'Archiving…';

  return (
    <Button
      type="button"
      data-testid={testId}
      variant={variant}
      size="sm"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${pending ? pendingLabel : idleLabel} ${name}`}
      onClick={() => { void run(); }}
    >
      <Icon size={13} aria-hidden="true" />
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

// The archived marking (P4): label and icon, in the live archived-ATC chip grammar
// (`status-chip`, neutral tone).
export function MilestoneArchivedBadge({ testId }: { testId: string }) {
  return (
    <span data-testid={testId} className="status-chip flex-shrink-0" data-status="skipped">
      <Archive size={11} aria-hidden="true" />
      {ARCHIVED_LABEL}
    </span>
  );
}
