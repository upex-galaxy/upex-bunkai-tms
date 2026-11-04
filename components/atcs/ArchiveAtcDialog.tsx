'use client';

import { revalidateAfterArchiveChange } from '@app/(app)/atcs/actions';
import { Button } from '@components/ui/button';
import { archiveAtc, fetchAtcUsage } from '@lib/atcs/archive-client';
import {
  ARCHIVE_USAGE_KEEP_COPY,
  archiveMoreCopy,
  archiveUsageHeadline,
  boundUsageTitles,
} from '@lib/atcs/archive-usage';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { AlertTriangle, Archive, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// BK-571 — the archive confirmation. The panel grammar is the delete dialogs'
// (`DeleteUserStoryDialog`); the overlay around it is `ArchiveAtcOverlay`, so
// every entry point (table row, explorer menu, editor topbar) mounts the same
// thing. The usage warning names real usage BEFORE anything is written, so a
// failed usage read keeps Archive disabled rather than archiving blind.

export interface ArchiveAtcTarget {
  id: string
  title: string
}

interface ArchiveAtcDialogProps {
  atc: ArchiveAtcTarget
  onArchived: () => void
  onCancel: () => void
  // The open editor has edits that are not saved: archiving leaves them behind.
  hasUnsavedEdits?: boolean
  onSubmittingChange?: (submitting: boolean) => void
}

interface ArchiveAtcOverlayProps extends Omit<ArchiveAtcDialogProps, 'onSubmittingChange'> {}

type UsageState
  = | { status: 'loading' }
    | { status: 'error' }
    | { status: 'gone' }
    | { status: 'ready', count: number, titles: string[] };

export const ARCHIVE_USAGE_ERROR_COPY = 'Couldn’t load which Tests chain this ATC.';
export const ARCHIVE_FAILURE_COPY = 'Could not archive this ATC. Nothing changed.';
export const ARCHIVE_FORBIDDEN_COPY = 'You do not have permission to archive in this project.';
export const ARCHIVE_GONE_COPY = 'This ATC is no longer available. It may already be archived.';
export const ARCHIVE_UNSAVED_COPY = 'Your unsaved edits to this ATC will be lost.';

export function ArchiveAtcDialog({ atc, onArchived, onCancel, hasUnsavedEdits = false, onSubmittingChange }: ArchiveAtcDialogProps) {
  const router = useRouter();
  const [usage, setUsage] = useState<UsageState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ detail: string } | null>(null);

  // Only a new ATC should re-read the usage. Next's router is stable, but a test
  // double or a wrapper that hands out a new object per render would otherwise
  // re-run the effect below on every render (and `setUsage` renders again).
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  const loadUsage = useCallback((isCurrent: () => boolean = () => true) => {
    setUsage({ status: 'loading' });
    void fetchAtcUsage(atc.id).then((result) => {
      if (!isCurrent()) { return; }
      if (result.ok) {
        setUsage({ status: 'ready', count: result.count, titles: result.tests.map(t => t.title) });
        return;
      }
      setUsage({ status: result.gone ? 'gone' : 'error' });
      // The row behind this dialog is stale: bring the list up to date.
      if (result.gone) { routerRef.current.refresh(); }
    });
  }, [atc.id]);

  useEffect(() => {
    let current = true;
    loadUsage(() => current);
    return () => { current = false; };
  }, [loadUsage]);

  const onConfirm = async () => {
    setSubmitting(true);
    onSubmittingChange?.(true);
    setError(null);
    const result = await archiveAtc(atc.id);
    if (!result.ok) {
      setError({ detail: result.forbidden ? ARCHIVE_FORBIDDEN_COPY : result.errorMessage });
      setSubmitting(false);
      onSubmittingChange?.(false);
      return;
    }
    // The archive already happened: a failed revalidate must not read as a failed
    // archive, and the caller still refreshes.
    await revalidateAfterArchiveChange().catch(() => {});
    toast.success(`Archived “${atc.title}”. Restore it from the archived view in the ATC Library.`, {
      action: { label: 'View archived', onClick: () => { router.push('/atcs?view=archived'); } },
    });
    onArchived();
  };

  return (
    <div
      data-testid="archive-atc-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-atc-dialog-heading"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div
        id="archive-atc-dialog-heading"
        className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-2"
      >
        Archive ATC
      </div>
      <p className="m-0 mb-3 text-sm text-fg-1">
        Archive
        {' '}
        <span className="font-semibold text-fg-0">{atc.title}</span>
        ? Archiving is reversible: restore it any time from the archived view in the ATC Library.
      </p>

      <UsageBlock usage={usage} onRetry={() => loadUsage()} />

      {hasUnsavedEdits && (
        <p data-testid="archive-atc-unsaved" className="m-0 mb-4 text-xs text-fg-2">
          {ARCHIVE_UNSAVED_COPY}
        </p>
      )}

      {error && (
        <div role="alert" className="mb-3 text-xs text-signal-fail" data-testid="archive-atc-error">
          <p className="m-0 font-semibold">{ARCHIVE_FAILURE_COPY}</p>
          <p className="m-0 mt-0.5 font-mono text-fg-3">{error.detail}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="archive-atc-confirm"
          variant="primary"
          size="sm"
          onClick={() => { void onConfirm(); }}
          disabled={submitting || usage.status !== 'ready'}
        >
          <Archive size={13} />
          {submitting ? 'Archiving…' : 'Archive ATC'}
        </Button>
        <Button
          type="button"
          data-testid="archive-atc-cancel"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function UsageBlock({ usage, onRetry }: { usage: UsageState, onRetry: () => void }) {
  if (usage.status === 'loading') {
    return (
      <div
        data-testid="archive-atc-usage-loading"
        aria-busy="true"
        aria-label="Loading which Tests chain this ATC"
        className="mb-4 h-8 animate-pulse rounded-2 bg-surface-2"
      />
    );
  }

  if (usage.status === 'gone') {
    return (
      <p role="alert" data-testid="archive-atc-usage-gone" className="m-0 mb-4 text-xs text-signal-fail">
        {ARCHIVE_GONE_COPY}
      </p>
    );
  }

  if (usage.status === 'error') {
    return (
      <div role="alert" data-testid="archive-atc-usage-error" className="mb-4 flex items-start gap-2 text-xs">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-signal-fail" aria-hidden />
        <div className="flex flex-col items-start gap-1.5">
          <p className="m-0 text-signal-fail">{ARCHIVE_USAGE_ERROR_COPY}</p>
          <Button type="button" size="sm" data-testid="archive-atc-usage-retry" onClick={onRetry}>
            <RefreshCw size={12} aria-hidden />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (usage.count === 0) {
    return (
      <p data-testid="archive-atc-usage-none" className="m-0 mb-4 text-xs text-fg-2">
        {archiveUsageHeadline(0)}
      </p>
    );
  }

  const { shown, more } = boundUsageTitles(usage.titles);
  return (
    <div
      role="alert"
      data-testid="archive-atc-usage-warning"
      className="mb-4 flex items-start gap-2 rounded-2 border border-signal-blocked bg-signal-blocked-bg p-3 text-sm text-fg-1"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-signal-blocked" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="m-0 font-semibold text-fg-0">{archiveUsageHeadline(usage.count)}</p>
        <ul data-testid="archive-atc-usage-titles" className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-fg-1">
          {shown.map((title, i) => (
            <li key={`${i}-${title}`} className="truncate" title={title}>{title}</li>
          ))}
          {more > 0 && <li className="text-fg-3">{archiveMoreCopy(more)}</li>}
        </ul>
        <p className="m-0 text-xs text-fg-2">{ARCHIVE_USAGE_KEEP_COPY}</p>
      </div>
    </div>
  );
}

// The overlay grammar every explorer dialog uses (fixed scrim, click-outside
// closes, panel stops propagation). `useModalDismiss` adds Escape and the focus
// trap, so the dialog behaves the same from the editor and the table. While the
// archive is in flight nothing dismisses it: it would read as cancelled while the
// write completes, and a failure would go to a dialog nobody can see.
export function ArchiveAtcOverlay({ atc, onArchived, onCancel, hasUnsavedEdits }: ArchiveAtcOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  const requestClose = useCallback(() => {
    if (!submittingRef.current) { onCancel(); }
  }, [onCancel]);

  useModalDismiss(true, requestClose, panelRef);

  // The trap only wraps focus already inside, so move it in, and hand it back to
  // the opener when the dialog closes (if the opener's row is still there).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('[data-testid="archive-atc-cancel"]')?.focus();
    return () => {
      if (opener?.isConnected) { opener.focus(); }
    };
  }, []);

  return (
    <div
      data-testid="archive-atc-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={requestClose}
    >
      <div ref={panelRef} className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
        <ArchiveAtcDialog
          atc={atc}
          onArchived={onArchived}
          onCancel={onCancel}
          hasUnsavedEdits={hasUnsavedEdits}
          onSubmittingChange={(submitting) => { submittingRef.current = submitting; }}
        />
      </div>
    </div>
  );
}
