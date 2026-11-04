'use client';

import { Button } from '@components/ui/button';
import { archiveAtc, fetchAtcUsage } from '@lib/atcs/archive-client';
import {
  ARCHIVE_USAGE_KEEP_COPY,
  archiveMoreCopy,
  archiveUsageHeadline,
  boundUsageTitles,
} from '@lib/atcs/archive-usage';
import { AlertTriangle, Archive, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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
}

interface ArchiveAtcOverlayProps extends ArchiveAtcDialogProps {}

type UsageState
  = | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready', count: number, titles: string[] };

export const ARCHIVE_USAGE_ERROR_COPY = 'Couldn’t load which Tests chain this ATC.';
export const ARCHIVE_FAILURE_COPY = 'Could not archive this ATC. Nothing changed.';
export const ARCHIVE_FORBIDDEN_COPY = 'You do not have permission to archive in this project.';

export function ArchiveAtcDialog({ atc, onArchived, onCancel }: ArchiveAtcDialogProps) {
  const router = useRouter();
  const [usage, setUsage] = useState<UsageState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ detail: string } | null>(null);

  const loadUsage = useCallback((isCurrent: () => boolean = () => true) => {
    setUsage({ status: 'loading' });
    void fetchAtcUsage(atc.id).then((result) => {
      if (!isCurrent()) { return; }
      setUsage(result.ok
        ? { status: 'ready', count: result.count, titles: result.tests.map(t => t.title) }
        : { status: 'error' });
    });
  }, [atc.id]);

  useEffect(() => {
    let current = true;
    loadUsage(() => current);
    return () => { current = false; };
  }, [loadUsage]);

  const onConfirm = async () => {
    setSubmitting(true);
    setError(null);
    const result = await archiveAtc(atc.id);
    if (!result.ok) {
      setError({ detail: result.forbidden ? ARCHIVE_FORBIDDEN_COPY : result.errorMessage });
      setSubmitting(false);
      return;
    }
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
// closes, panel stops propagation), plus its own Escape so the dialog closes
// from the editor and the table too, where there is no explorer-wide handler.
export function ArchiveAtcOverlay({ atc, onArchived, onCancel }: ArchiveAtcOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      data-testid="archive-atc-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onCancel}
    >
      <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
        <ArchiveAtcDialog atc={atc} onArchived={onArchived} onCancel={onCancel} />
      </div>
    </div>
  );
}
