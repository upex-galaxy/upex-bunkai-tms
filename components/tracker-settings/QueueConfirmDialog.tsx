'use client';

import { Button } from '@components/ui/button';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { queueDialogCopy } from '@lib/tracker-settings/form-state';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface QueueConfirmDialogProps {
  // The number the server reported; null = dialog closed. A resend that comes
  // back with a DIFFERENT number simply re-renders this dialog with the new one.
  queueCount: number | null
  destinationKey: string
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Confirmation before a save that queues defects for Jira (BK-371, PO Q1 / AC-8).
// Same hand-built `alertdialog` + `useModalDismiss` as RevokeTokenModal (the PO's
// Q6 ruling: no new component); copy frozen by the PO. Cancel is focused first so
// Enter never confirms by accident: the queued issues cannot be removed from Bunkai.
export function QueueConfirmDialog({ queueCount, destinationKey, submitting, onConfirm, onCancel }: QueueConfirmDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = queueCount !== null;

  const requestClose = () => {
    if (!submitting) {
      onCancel();
    }
  };

  useModalDismiss(open, requestClose, containerRef);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open, queueCount]);

  if (queueCount === null) {
    return null;
  }

  const copy = queueDialogCopy({ queueCount, destinationKey });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={requestClose}
    >
      <div
        ref={containerRef}
        data-testid="queue-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="queue-confirm-title"
        aria-describedby="queue-confirm-desc"
        className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div
          id="queue-confirm-title"
          className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-signal-blocked"
        >
          <AlertTriangle size={13} />
          Queue defects for Jira
        </div>

        <p id="queue-confirm-desc" className="m-0 text-sm text-fg-1" data-testid="queue-confirm-description">
          {copy.description}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="queue-confirm-submit"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : copy.confirmLabel}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            size="sm"
            data-testid="queue-confirm-cancel"
            onClick={requestClose}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
