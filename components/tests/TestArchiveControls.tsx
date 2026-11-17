'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { archiveTest, renameTest, restoreTest } from '@lib/tests/archive-client';
import {
  boundPlanNames,
  TEST_ARCHIVE_FAILURE_COPY,
  TEST_ARCHIVE_PLANS_KEEP_COPY,
  TEST_ARCHIVE_REVERSIBLE_COPY,
  TEST_ARCHIVED_BANNER_COPY,
  TEST_ARCHIVED_BANNER_DETAIL_COPY,
  TEST_RENAME_FAILURE_COPY,
  TEST_RESTORE_FAILURE_COPY,
  testArchivedToast,
  testArchivePlansHeadline,
  testArchiveRunsCopy,
  testRestoredToast,
} from '@lib/tests/archive-copy';
import { TEST_TITLE_MAX, testTitleFault } from '@lib/tests/validation';
import { AlertTriangle, Archive, ArchiveRestore, Pencil, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// BK-596 — rename, archive and restore on the Test detail header. Built on the
// live header (`tests/[testId]/layout.tsx`) and BK-571's archive vocabulary: the
// confirmation panel is `ArchiveAtcDialog`'s grammar, the archived banner and the
// Restore button are `ArchivedAtcDetail`'s. Spec-only departure, ratified as
// master-design-plan.md §5 D72 (no mockup draws a Test archive). Only a member
// who can change the Test is offered any of it; the API re-checks every call.

export interface TestArchiveSubject {
  id: string
  title: string
  version: number
  runCount: number
  plans: { id: string, name: string }[]
}

// ---------------------------------------------------------------- rename

export function TestRenameControl({ test }: { test: TestArchiveSubject }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(test.title);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { inputRef.current?.select(); }
  }, [editing]);

  const cancel = () => {
    setEditing(false);
    setTitle(test.title);
    setError(null);
  };

  const fault = testTitleFault(title);
  const faultCopy = fault === 'title_required'
    ? 'A Test needs a name.'
    : fault === 'title_too_long' ? `Keep the name to ${TEST_TITLE_MAX} characters or fewer.` : null;

  const save = async () => {
    if (fault) { setError(faultCopy); return; }
    setSubmitting(true);
    setError(null);
    const result = await renameTest(test.id, title.trim(), test.version);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.errorMessage);
      return;
    }
    setEditing(false);
    if (result.changed) {
      toast.success(`Renamed to “${title.trim()}”.`);
      router.refresh();
    }
  };

  if (!editing) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        data-testid="test-detail-rename"
        onClick={() => setEditing(true)}
        title="Rename this Test"
      >
        <Pencil size={12} />
        Rename
      </Button>
    );
  }

  return (
    <form
      data-testid="test-rename-form"
      className="flex min-w-0 flex-1 items-center gap-1.5"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
    >
      <Input
        ref={inputRef}
        data-testid="test-rename-input"
        aria-label="Test name"
        aria-invalid={error !== null}
        value={title}
        onChange={(e) => { setTitle(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}
        disabled={submitting}
        className="h-6 min-w-0 flex-1 text-sm"
      />
      <Button type="submit" size="sm" variant="primary" data-testid="test-rename-save" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </Button>
      <Button type="button" size="sm" variant="ghost" data-testid="test-rename-cancel" onClick={cancel} disabled={submitting}>
        Cancel
      </Button>
      {error && (
        <span role="alert" data-testid="test-rename-error" className="shrink-0 text-xs text-signal-fail" title={TEST_RENAME_FAILURE_COPY}>
          {error}
        </span>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- archive

export function TestArchiveButton({ test }: { test: TestArchiveSubject }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        data-testid="test-detail-archive"
        onClick={() => setOpen(true)}
        title="Archive this Test"
      >
        <Archive size={12} />
        Archive
      </Button>
      {open && <ArchiveTestOverlay test={test} onClose={() => setOpen(false)} />}
    </>
  );
}

interface ArchiveTestDialogProps {
  test: TestArchiveSubject
  onArchived: () => void
  onCancel: () => void
  onSubmittingChange?: (submitting: boolean) => void
}

export function ArchiveTestDialog({ test, onArchived, onCancel, onSubmittingChange }: ArchiveTestDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plansHeadline = testArchivePlansHeadline(test.plans.length);
  const { shown, more } = boundPlanNames(test.plans.map(p => p.name));

  const onConfirm = async () => {
    setSubmitting(true);
    onSubmittingChange?.(true);
    setError(null);
    const result = await archiveTest(test.id);
    if (!result.ok) {
      setError(result.errorMessage);
      setSubmitting(false);
      onSubmittingChange?.(false);
      return;
    }
    toast.success(testArchivedToast(test.title));
    onArchived();
    router.refresh();
  };

  return (
    <div
      data-testid="archive-test-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-test-dialog-heading"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div
        id="archive-test-dialog-heading"
        className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-2"
      >
        Archive Test
      </div>
      <p className="m-0 mb-3 text-sm text-fg-1">
        Archive
        {' '}
        <span className="font-semibold text-fg-0">{test.title}</span>
        ?
        {' '}
        {TEST_ARCHIVE_REVERSIBLE_COPY}
      </p>

      <p data-testid="archive-test-runs" className="m-0 mb-4 text-xs text-fg-2">
        {testArchiveRunsCopy(test.runCount)}
      </p>

      {plansHeadline && (
        <div
          role="alert"
          data-testid="archive-test-plans-warning"
          className="mb-4 flex items-start gap-2 rounded-2 border border-signal-blocked bg-signal-blocked-bg p-3 text-sm text-fg-1"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-signal-blocked" aria-hidden />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="m-0 font-semibold text-fg-0">{plansHeadline}</p>
            <ul data-testid="archive-test-plans" className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-fg-1">
              {shown.map((name, i) => (
                <li key={`${i}-${name}`} className="truncate" title={name}>{name}</li>
              ))}
              {more > 0 && <li className="text-fg-3">{`and ${more} more`}</li>}
            </ul>
            <p className="m-0 text-xs text-fg-2">{TEST_ARCHIVE_PLANS_KEEP_COPY}</p>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-3 text-xs text-signal-fail" data-testid="archive-test-error">
          <p className="m-0 font-semibold">{TEST_ARCHIVE_FAILURE_COPY}</p>
          <p className="m-0 mt-0.5 font-mono text-fg-3">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="archive-test-confirm"
          variant="primary"
          size="sm"
          onClick={() => { void onConfirm(); }}
          disabled={submitting}
        >
          {error && !submitting ? <RefreshCw size={13} /> : <Archive size={13} />}
          {submitting ? 'Archiving…' : error ? 'Retry archive' : 'Archive Test'}
        </Button>
        <Button
          type="button"
          data-testid="archive-test-cancel"
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

// The overlay grammar of `ArchiveAtcOverlay`: scrim, click-outside, Escape, focus
// trap; nothing dismisses it while the archive is in flight.
function ArchiveTestOverlay({ test, onClose }: { test: TestArchiveSubject, onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const requestClose = useCallback(() => {
    if (!submittingRef.current) { onClose(); }
  }, [onClose]);

  useModalDismiss(true, requestClose, panelRef);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('[data-testid="archive-test-cancel"]')?.focus();
    return () => {
      if (opener?.isConnected) { opener.focus(); }
    };
  }, []);

  return (
    <div
      data-testid="archive-test-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={requestClose}
    >
      <div ref={panelRef} className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
        <ArchiveTestDialog
          test={test}
          onArchived={onClose}
          onCancel={onClose}
          onSubmittingChange={(submitting) => { submittingRef.current = submitting; }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- archived state

export function TestArchivedBanner({ testId, title, archivedAt, canRestore }: { testId: string, title: string, archivedAt: string, canRestore: boolean }) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const when = formatArchivedAt(archivedAt);

  const restore = async () => {
    setRestoring(true);
    setFailure(null);
    const result = await restoreTest(testId);
    setRestoring(false);
    if (!result.ok) {
      setFailure(result.errorMessage);
      return;
    }
    toast.success(testRestoredToast(title));
    router.refresh();
  };

  return (
    <div
      role="status"
      data-testid="test-archived-banner"
      className="flex flex-shrink-0 items-start border-b border-stroke-1 bg-surface-2 px-4 py-2.5 text-sm text-fg-1"
    >
      <div className="mx-auto flex w-full max-w-[820px] items-start gap-2">
        <Archive size={14} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="m-0 font-semibold text-fg-0">{TEST_ARCHIVED_BANNER_COPY}</p>
          <p className="m-0 text-xs text-fg-2" data-testid="test-archived-banner-detail">
            {TEST_ARCHIVED_BANNER_DETAIL_COPY}
            {when ? ` Archived ${when}.` : ''}
          </p>
          {failure !== null && (
            <p role="alert" data-testid="test-detail-restore-error" className="m-0 mt-1 text-xs text-signal-fail">
              <span className="font-semibold">{TEST_RESTORE_FAILURE_COPY}</span>
              {' '}
              <span className="font-mono text-fg-3">{failure}</span>
            </p>
          )}
        </div>
        {canRestore && (
          <Button
            size="sm"
            variant="primary"
            data-testid="test-detail-restore"
            onClick={() => { void restore(); }}
            disabled={restoring}
          >
            {failure !== null && !restoring ? <RefreshCw size={11} /> : <ArchiveRestore size={11} />}
            {restoring ? 'Restoring…' : failure !== null ? 'Retry restore' : 'Restore'}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatArchivedAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) { return null; }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
