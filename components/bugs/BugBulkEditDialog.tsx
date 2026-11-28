'use client';

import type { BugBulkChange, BugBulkEditReport, BugBulkItem, BugBulkOutcome } from '@lib/bugs/bulk-edit';
import { Button } from '@components/ui/button';
import { describeBugBulkChange, groupBugRefusals, isIrreversibleBugBulkChange, pluralBugs } from '@lib/bugs/bulk-edit';
import { runBugBulkEdit } from '@lib/bugs/bulk-edit-client';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { AlertTriangle, Check, Pencil, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// BK-2098 — the confirmation and the outcome report of a Bug bulk edit
// (master-design-plan §5 D86, §4.32), the live ATC bulk dialog (D64) with the
// Bug fields. It previews through the same evaluation the write uses
// (`dry_run`), then applies, and keeps the report on screen.

export interface BugBulkEditDialogProps {
  projectId: string
  items: BugBulkItem[]
  change: BugBulkChange
  hiddenCount: number
  // The write returned a report: the caller narrows the selection and reloads.
  onWritten: (report: BugBulkEditReport) => void
  // No answer arrived: the caller reloads the list and keeps the selection.
  onUnknown: () => void
  onClose: () => void
  onSubmittingChange?: (submitting: boolean) => void
}

type Failure
  = | { kind: 'rejected', message: string }
    | { kind: 'unknown' };

type Phase
  = | { kind: 'previewing' }
    | { kind: 'preview', report: BugBulkEditReport }
    | { kind: 'preview-failed', failure: Failure }
    | { kind: 'applying' }
    | { kind: 'done', report: BugBulkEditReport }
    | { kind: 'failed', failure: Failure };

export const BUG_BULK_REJECTED_COPY = 'Nothing was changed.';
export const BUG_BULK_UNKNOWN_COPY = 'The result could not be confirmed. Some changes may have been applied; the list was reloaded so you can check.';
export const BUG_BULK_PREVIEW_UNKNOWN_COPY = 'This change could not be checked. Nothing was written.';
export const BUG_BULK_KEPT_COPY = 'The changes that succeeded were kept. Nothing was rolled back.';
export const BUG_BULK_RACE_COPY = 'A teammate’s edit while this runs can still refuse a Bug.';
export const BUG_BULK_CLOSE_COPY = 'Closing cannot be undone: a closed Bug never moves to another status.';

const SHOWN_PER_GROUP = 5;

function bugLabel(outcome: BugBulkOutcome): string {
  return outcome.title ?? outcome.bug_id.slice(0, 8);
}

export function BugBulkEditDialog({
  projectId,
  items,
  change,
  hiddenCount,
  onWritten,
  onUnknown,
  onClose,
  onSubmittingChange,
}: BugBulkEditDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'previewing' });
  const applyingRef = useRef(false);
  const requestRef = useRef({ projectId, items, change });

  useEffect(() => {
    let current = true;
    void runBugBulkEdit(requestRef.current, { dryRun: true }).then((result) => {
      if (!current) { return; }
      setPhase(result.ok
        ? { kind: 'preview', report: result.report }
        : { kind: 'preview-failed', failure: result.kind === 'rejected' ? { kind: 'rejected', message: result.message } : { kind: 'unknown' } });
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (phase.kind !== 'applying') { return; }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase.kind]);

  const apply = useCallback(async () => {
    if (applyingRef.current) { return; }
    applyingRef.current = true;
    setPhase({ kind: 'applying' });
    onSubmittingChange?.(true);

    const result = await runBugBulkEdit(requestRef.current, { dryRun: false });
    applyingRef.current = false;
    onSubmittingChange?.(false);

    if (!result.ok) {
      if (result.kind === 'unknown') { onUnknown(); }
      setPhase({
        kind: 'failed',
        failure: result.kind === 'rejected' ? { kind: 'rejected', message: result.message } : { kind: 'unknown' },
      });
      return;
    }
    onWritten(result.report);
    setPhase({ kind: 'done', report: result.report });
  }, [onSubmittingChange, onUnknown, onWritten]);

  const showCloseWarning = isIrreversibleBugBulkChange(change) && phase.kind !== 'done' && phase.kind !== 'failed';

  return (
    <div
      data-testid="bugs-bulk-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bugs-bulk-dialog-heading"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div
        id="bugs-bulk-dialog-heading"
        className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-2"
      >
        {phase.kind === 'done' ? 'Bulk edit result' : 'Bulk edit Bugs'}
      </div>

      <p className="m-0 mb-3 text-sm text-fg-1">
        <span data-testid="bugs-bulk-change" className="font-semibold text-fg-0">{describeBugBulkChange(change)}</span>
        {' on '}
        <span data-testid="bugs-bulk-count" className="font-semibold text-fg-0">{pluralBugs(items.length)}</span>
        .
      </p>

      {hiddenCount > 0 && (
        <p data-testid="bugs-bulk-dialog-hidden" className="m-0 mb-3 text-xs text-fg-2">
          {hiddenCount === 1
            ? '1 of them is not shown in the current list.'
            : `${hiddenCount} of them are not shown in the current list.`}
        </p>
      )}

      {showCloseWarning && (
        <p data-testid="bugs-bulk-close-warning" className="m-0 mb-3 flex items-start gap-2 text-xs text-signal-blocked">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          {BUG_BULK_CLOSE_COPY}
        </p>
      )}

      <div aria-live="polite">
        {phase.kind === 'previewing' && (
          <div
            data-testid="bugs-bulk-preview-loading"
            aria-busy="true"
            aria-label="Checking the change"
            className="mb-4 h-10 animate-pulse rounded-2 bg-surface-2"
          />
        )}

        {phase.kind === 'preview-failed' && (
          <FailureBlock failure={phase.failure} testId="bugs-bulk-preview-failed" unknownCopy={BUG_BULK_PREVIEW_UNKNOWN_COPY} />
        )}

        {phase.kind === 'preview' && <ReportBlock report={phase.report} mode="preview" />}

        {phase.kind === 'applying' && (
          <p data-testid="bugs-bulk-applying" role="status" className="m-0 mb-4 text-xs text-fg-2">
            Applying the change. Keep this page open until it finishes.
          </p>
        )}

        {phase.kind === 'done' && <ReportBlock report={phase.report} mode="done" />}

        {phase.kind === 'failed' && (
          <FailureBlock failure={phase.failure} testId="bugs-bulk-failed" unknownCopy={BUG_BULK_UNKNOWN_COPY} />
        )}
      </div>

      {phase.kind === 'preview' && (
        <p className="m-0 mb-4 text-xs text-fg-3">{BUG_BULK_RACE_COPY}</p>
      )}

      <div className="flex items-center gap-2">
        {(phase.kind === 'previewing' || phase.kind === 'preview' || phase.kind === 'preview-failed' || phase.kind === 'applying') && (
          <>
            <Button
              type="button"
              data-testid="bugs-bulk-apply"
              variant="primary"
              size="sm"
              onClick={() => { void apply(); }}
              disabled={phase.kind !== 'preview' || phase.report.changed === 0}
            >
              <Pencil size={13} aria-hidden />
              {phase.kind === 'applying'
                ? 'Applying…'
                : phase.kind === 'preview' && phase.report.changed > 0
                  ? `Apply to ${pluralBugs(phase.report.changed)}`
                  : 'Apply'}
            </Button>
            <Button
              type="button"
              data-testid="bugs-bulk-cancel"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={phase.kind === 'applying'}
            >
              Cancel
            </Button>
          </>
        )}

        {phase.kind === 'done' && (
          <Button type="button" data-testid="bugs-bulk-done" variant="primary" size="sm" onClick={onClose}>
            <Check size={13} aria-hidden />
            Done
          </Button>
        )}

        {phase.kind === 'failed' && phase.failure.kind === 'rejected' && (
          <>
            <Button type="button" data-testid="bugs-bulk-retry" variant="primary" size="sm" onClick={() => { void apply(); }}>
              <RefreshCw size={13} aria-hidden />
              Try again
            </Button>
            <Button type="button" data-testid="bugs-bulk-close" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {phase.kind === 'failed' && phase.failure.kind === 'unknown' && (
          <Button type="button" data-testid="bugs-bulk-close" variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

function FailureBlock({ failure, testId, unknownCopy }: { failure: Failure, testId: string, unknownCopy: string }) {
  if (failure.kind === 'unknown') {
    return (
      <div role="alert" data-testid={testId} className="mb-4 flex items-start gap-2 text-xs text-signal-fail">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
        <p data-testid="bugs-bulk-unknown" className="m-0">{unknownCopy}</p>
      </div>
    );
  }
  return (
    <div role="alert" data-testid={testId} className="mb-4 text-xs text-signal-fail">
      <p className="m-0 font-semibold">{BUG_BULK_REJECTED_COPY}</p>
      <p data-testid="bugs-bulk-server-message" className="m-0 mt-0.5 font-mono text-fg-3">{failure.message}</p>
    </div>
  );
}

function ReportBlock({ report, mode }: { report: BugBulkEditReport, mode: 'preview' | 'done' }) {
  const groups = groupBugRefusals(report);
  const preview = mode === 'preview';
  return (
    <div data-testid={preview ? 'bugs-bulk-preview' : 'bugs-bulk-result'} className="mb-4 flex flex-col gap-2 text-sm text-fg-1">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        <li data-testid="bugs-bulk-n-changed">
          <span className="font-semibold text-fg-0">{report.changed}</span>
          {preview ? ' will change' : ' changed'}
        </li>
        <li data-testid="bugs-bulk-n-unchanged">
          <span className="font-semibold text-fg-0">{report.unchanged}</span>
          {preview ? ' already set (no write)' : ' already set'}
        </li>
        <li data-testid="bugs-bulk-n-refused">
          <span className="font-semibold text-fg-0">{report.refused}</span>
          {preview ? ' will be refused' : ' refused'}
        </li>
      </ul>

      {report.changed === 0 && preview && (
        <p data-testid="bugs-bulk-nothing" className="m-0 text-xs text-fg-2">Nothing to change.</p>
      )}

      {groups.length > 0 && (
        <div
          role={preview ? undefined : 'alert'}
          data-testid="bugs-bulk-refusals"
          className="rounded-2 border border-signal-blocked bg-signal-blocked-bg p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-signal-blocked" aria-hidden />
            <div className="flex min-w-0 flex-col gap-2">
              {groups.map(group => (
                <div key={group.reason} data-testid={`bugs-bulk-refusal-${group.reason}`}>
                  <p className="m-0 font-semibold text-fg-0">
                    {group.label}
                    {' ('}
                    {group.outcomes.length}
                    )
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-fg-1">
                    {group.outcomes.slice(0, SHOWN_PER_GROUP).map(o => (
                      <li key={o.bug_id} className="truncate" title={bugLabel(o)}>{bugLabel(o)}</li>
                    ))}
                    {group.outcomes.length > SHOWN_PER_GROUP && (
                      <li className="text-fg-3">{`and ${group.outcomes.length - SHOWN_PER_GROUP} more`}</li>
                    )}
                  </ul>
                </div>
              ))}
              {!preview && <p className="m-0 text-xs text-fg-2">{BUG_BULK_KEPT_COPY}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function BugBulkEditOverlay(props: Omit<BugBulkEditDialogProps, 'onSubmittingChange'>) {
  const { onClose } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  const requestClose = useCallback(() => {
    if (submittingRef.current) { return; }
    onClose();
  }, [onClose]);

  useModalDismiss(true, requestClose, panelRef);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('[data-testid="bugs-bulk-cancel"]')?.focus();
    return () => {
      if (opener?.isConnected) { opener.focus(); }
    };
  }, []);

  const onSubmittingChange = useCallback((submitting: boolean) => { submittingRef.current = submitting; }, []);

  return (
    <div
      data-testid="bugs-bulk-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={requestClose}
    >
      <div ref={panelRef} className="w-full max-w-[460px]" onClick={e => e.stopPropagation()}>
        <BugBulkEditDialog {...props} onSubmittingChange={onSubmittingChange} />
      </div>
    </div>
  );
}
