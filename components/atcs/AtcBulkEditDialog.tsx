'use client';

import type { BulkEditChange, BulkEditItem, BulkEditReport, BulkOutcome } from '@lib/atcs/bulk-edit';
import { revalidateAfterAtcBulkEdit } from '@app/(app)/atcs/actions';
import { Button } from '@components/ui/button';
import { describeBulkChange, groupRefusals, pluralAtcs } from '@lib/atcs/bulk-edit';
import { runBulkEdit } from '@lib/atcs/bulk-edit-client';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { AlertTriangle, Check, Pencil, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// BK-507 — the confirmation and the outcome report of a bulk edit (master-design-
// plan §5 D64, §4.26). The panel grammar is the archive dialog's. It previews
// through the SAME evaluation the write uses (`dry_run`), so it names the exact
// change, the exact number of ATCs and the refusals before anything is written;
// then it applies, and the report stays on screen because a partial failure needs
// a list a person can read and act on. Nothing is presented as rolled back: what
// succeeded stays.

export interface AtcBulkEditDialogProps {
  projectId: string
  items: BulkEditItem[]
  change: BulkEditChange
  moduleLabel?: string
  // Selected ATCs the filters hide: the change applies to them, so it is said.
  hiddenCount: number
  // After a write attempt, when the dialog should close. `report` is null when the
  // result is unknown (no answer arrived): the caller refreshes and keeps the
  // selection.
  onFinished: (report: BulkEditReport | null) => void
  onCancel: () => void
  onSubmittingChange?: (submitting: boolean) => void
  // Called when the outcome report is on screen with refusals, so the overlay can
  // treat Esc or a click outside like Done (the selection narrows to the refused).
  onReportShown?: (report: BulkEditReport) => void
}

type Failure
  = | { kind: 'rejected', message: string, forbidden: boolean }
    | { kind: 'unknown' };

type Phase
  = | { kind: 'previewing' }
    | { kind: 'preview', report: BulkEditReport }
    | { kind: 'preview-failed', failure: Failure }
    | { kind: 'applying' }
    | { kind: 'done', report: BulkEditReport }
    | { kind: 'failed', failure: Failure };

export const BULK_FORBIDDEN_COPY = 'You do not have permission to edit ATCs in this project.';
export const BULK_REJECTED_COPY = 'Nothing changed.';
export const BULK_UNKNOWN_COPY = 'We could not confirm the result. Some changes may have been applied. Refresh the list to see where things stand.';
export const BULK_PREVIEW_UNKNOWN_COPY = 'We could not check this change. Nothing was written.';
export const BULK_KEPT_COPY = 'The changes that succeeded were kept. Nothing was rolled back.';
export const BULK_RACE_COPY = 'A teammate’s edit while this runs can still refuse a row.';

const SHOWN_PER_GROUP = 5;

function atcLabel(outcome: BulkOutcome): string {
  return outcome.title ?? outcome.slug ?? outcome.atc_id;
}

export function AtcBulkEditDialog({
  projectId,
  items,
  change,
  moduleLabel,
  hiddenCount,
  onFinished,
  onCancel,
  onSubmittingChange,
  onReportShown,
}: AtcBulkEditDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'previewing' });
  const applyingRef = useRef(false);
  // The request is fixed for the life of the dialog: it is mounted per action.
  const requestRef = useRef({ projectId, items, change });

  useEffect(() => {
    let current = true;
    void runBulkEdit(requestRef.current, { dryRun: true }).then((result) => {
      if (!current) { return; }
      setPhase(result.ok
        ? { kind: 'preview', report: result.report }
        : { kind: 'preview-failed', failure: result.kind === 'rejected' ? { kind: 'rejected', message: result.message, forbidden: result.forbidden } : { kind: 'unknown' } });
    });
    return () => { current = false; };
  }, []);

  // E5 — leaving while the write runs: the browser asks first.
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
    // E4 — a double confirm is one write.
    if (applyingRef.current) { return; }
    applyingRef.current = true;
    setPhase({ kind: 'applying' });
    onSubmittingChange?.(true);

    const result = await runBulkEdit(requestRef.current, { dryRun: false });
    applyingRef.current = false;
    onSubmittingChange?.(false);

    if (!result.ok) {
      // No answer: the write may have happened, so the list must be refreshed.
      if (result.kind === 'unknown') { await revalidateAfterAtcBulkEdit().catch(() => {}); }
      setPhase({
        kind: 'failed',
        failure: result.kind === 'rejected'
          ? { kind: 'rejected', message: result.message, forbidden: result.forbidden }
          : { kind: 'unknown' },
      });
      return;
    }

    // The write already happened: a failed revalidate must not read as a failed edit.
    await revalidateAfterAtcBulkEdit().catch(() => {});
    const { report } = result;
    if (report.refused === 0) {
      toast.success(
        report.changed === 0
          ? `Nothing to change: ${pluralAtcs(report.unchanged)} already as requested.`
          : `Changed ${pluralAtcs(report.changed)}.`,
      );
      onFinished(report);
      return;
    }
    onReportShown?.(report);
    setPhase({ kind: 'done', report });
  }, [onFinished, onSubmittingChange, onReportShown]);

  const changeText = describeBulkChange(change, moduleLabel);

  return (
    <div
      data-testid="atc-bulk-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atc-bulk-dialog-heading"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div
        id="atc-bulk-dialog-heading"
        className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-2"
      >
        {phase.kind === 'done' ? 'Bulk edit result' : 'Bulk edit ATCs'}
      </div>

      <p className="m-0 mb-3 text-sm text-fg-1">
        <span data-testid="atc-bulk-change" className="font-semibold text-fg-0">{changeText}</span>
        {' on '}
        <span data-testid="atc-bulk-count" className="font-semibold text-fg-0">{pluralAtcs(items.length)}</span>
        .
      </p>

      {hiddenCount > 0 && (
        <p data-testid="atc-bulk-dialog-hidden" className="m-0 mb-3 text-xs text-fg-2">
          {hiddenCount === 1
            ? '1 of them is hidden by your current filters.'
            : `${hiddenCount} of them are hidden by your current filters.`}
        </p>
      )}

      <div aria-live="polite">
        {phase.kind === 'previewing' && (
          <div
            data-testid="atc-bulk-preview-loading"
            aria-busy="true"
            aria-label="Checking the change"
            className="mb-4 h-10 animate-pulse rounded-2 bg-surface-2"
          />
        )}

        {phase.kind === 'preview-failed' && (
          <FailureBlock failure={phase.failure} testId="atc-bulk-preview-failed" unknownCopy={BULK_PREVIEW_UNKNOWN_COPY} />
        )}

        {phase.kind === 'preview' && <ReportBlock report={phase.report} mode="preview" />}

        {phase.kind === 'applying' && (
          <p data-testid="atc-bulk-applying" role="status" className="m-0 mb-4 text-xs text-fg-2">
            Applying the change. Keep this page open until it finishes.
          </p>
        )}

        {phase.kind === 'done' && <ReportBlock report={phase.report} mode="done" />}

        {phase.kind === 'failed' && (
          <FailureBlock failure={phase.failure} testId="atc-bulk-failed" unknownCopy={BULK_UNKNOWN_COPY} />
        )}
      </div>

      {phase.kind === 'preview' && (
        <p className="m-0 mb-4 text-xs text-fg-3">{BULK_RACE_COPY}</p>
      )}

      <div className="flex items-center gap-2">
        {(phase.kind === 'previewing' || phase.kind === 'preview' || phase.kind === 'preview-failed' || phase.kind === 'applying') && (
          <>
            <Button
              type="button"
              data-testid="atc-bulk-apply"
              variant="primary"
              size="sm"
              onClick={() => { void apply(); }}
              disabled={phase.kind !== 'preview' || phase.report.changed === 0}
            >
              <Pencil size={13} aria-hidden />
              {phase.kind === 'applying'
                ? 'Applying…'
                : phase.kind === 'preview' && phase.report.changed > 0
                  ? `Apply to ${pluralAtcs(phase.report.changed)}`
                  : 'Apply'}
            </Button>
            <Button
              type="button"
              data-testid="atc-bulk-cancel"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={phase.kind === 'applying'}
            >
              Cancel
            </Button>
          </>
        )}

        {phase.kind === 'done' && (
          <Button type="button" data-testid="atc-bulk-done" variant="primary" size="sm" onClick={() => onFinished(phase.report)}>
            <Check size={13} aria-hidden />
            Done
          </Button>
        )}

        {phase.kind === 'failed' && phase.failure.kind === 'rejected' && (
          <>
            <Button type="button" data-testid="atc-bulk-retry" variant="primary" size="sm" onClick={() => { void apply(); }}>
              <RefreshCw size={13} aria-hidden />
              Try again
            </Button>
            <Button type="button" data-testid="atc-bulk-close" variant="ghost" size="sm" onClick={onCancel}>
              Close
            </Button>
          </>
        )}

        {phase.kind === 'failed' && phase.failure.kind === 'unknown' && (
          <Button type="button" data-testid="atc-bulk-refresh" variant="primary" size="sm" onClick={() => onFinished(null)}>
            <RefreshCw size={13} aria-hidden />
            Refresh the list
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
        <p data-testid="atc-bulk-unknown" className="m-0">{unknownCopy}</p>
      </div>
    );
  }
  return (
    <div role="alert" data-testid={testId} className="mb-4 text-xs text-signal-fail">
      <p className="m-0 font-semibold">{BULK_REJECTED_COPY}</p>
      <p className="m-0 mt-0.5 font-mono text-fg-3">{failure.forbidden ? BULK_FORBIDDEN_COPY : failure.message}</p>
    </div>
  );
}

function ReportBlock({ report, mode }: { report: BulkEditReport, mode: 'preview' | 'done' }) {
  const groups = groupRefusals(report);
  const preview = mode === 'preview';
  return (
    <div data-testid={preview ? 'atc-bulk-preview' : 'atc-bulk-result'} className="mb-4 flex flex-col gap-2 text-sm text-fg-1">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        <li data-testid="atc-bulk-n-changed">
          <span className="font-semibold text-fg-0">{report.changed}</span>
          {preview ? ' will change' : ' changed'}
        </li>
        <li data-testid="atc-bulk-n-unchanged">
          <span className="font-semibold text-fg-0">{report.unchanged}</span>
          {preview ? ' already as requested (no write)' : ' already as requested'}
        </li>
        <li data-testid="atc-bulk-n-refused">
          <span className="font-semibold text-fg-0">{report.refused}</span>
          {preview ? ' will be refused' : ' not changed'}
        </li>
      </ul>

      {report.changed === 0 && report.refused === 0 && preview && (
        <p data-testid="atc-bulk-nothing" className="m-0 text-xs text-fg-2">Nothing to change.</p>
      )}

      {groups.length > 0 && (
        <div
          role={preview ? undefined : 'alert'}
          data-testid="atc-bulk-refusals"
          className="rounded-2 border border-signal-blocked bg-signal-blocked-bg p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-signal-blocked" aria-hidden />
            <div className="flex min-w-0 flex-col gap-2">
              {groups.map(group => (
                <div key={group.reason} data-testid={`atc-bulk-refusal-${group.reason}`}>
                  <p className="m-0 font-semibold text-fg-0">
                    {group.label}
                    {' ('}
                    {group.outcomes.length}
                    )
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-fg-1">
                    {group.outcomes.slice(0, SHOWN_PER_GROUP).map(o => (
                      <li key={o.atc_id} className="truncate" title={atcLabel(o)}>{atcLabel(o)}</li>
                    ))}
                    {group.outcomes.length > SHOWN_PER_GROUP && (
                      <li className="text-fg-3">{`and ${group.outcomes.length - SHOWN_PER_GROUP} more`}</li>
                    )}
                  </ul>
                </div>
              ))}
              {!preview && <p className="m-0 text-xs text-fg-2">{BULK_KEPT_COPY}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The overlay grammar every explorer dialog uses (fixed scrim, click-outside
// closes, panel stops propagation). `useModalDismiss` adds Escape and the focus
// trap. While the write is in flight nothing dismisses it: it would read as
// cancelled while the write completes (E5).
export function AtcBulkEditOverlay(props: Omit<AtcBulkEditDialogProps, 'onSubmittingChange' | 'onReportShown'>) {
  const { onCancel, onFinished } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  // The report a partial failure left on screen: closing from outside is Done.
  const reportRef = useRef<BulkEditReport | null>(null);

  const requestClose = useCallback(() => {
    if (submittingRef.current) { return; }
    if (reportRef.current) { onFinished(reportRef.current); }
    else { onCancel(); }
  }, [onCancel, onFinished]);

  useModalDismiss(true, requestClose, panelRef);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('[data-testid="atc-bulk-cancel"]')?.focus();
    return () => {
      if (opener?.isConnected) { opener.focus(); }
    };
  }, []);

  const onSubmittingChange = useCallback((submitting: boolean) => { submittingRef.current = submitting; }, []);
  const onReportShown = useCallback((report: BulkEditReport) => { reportRef.current = report; }, []);

  return (
    <div
      data-testid="atc-bulk-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={requestClose}
    >
      <div ref={panelRef} className="w-full max-w-[460px]" onClick={e => e.stopPropagation()}>
        <AtcBulkEditDialog {...props} onSubmittingChange={onSubmittingChange} onReportShown={onReportShown} />
      </div>
    </div>
  );
}
