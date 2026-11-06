'use client';

import { Button } from '@components/ui/button';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface DisconnectJiraDialogProps {
  open: boolean
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Confirmation before removing the workspace's Jira connection (BK-1170). Same
// hand-built `alertdialog` + `useModalDismiss` as QueueConfirmDialog / RevokeTokenModal.
// Cancel is focused first so Enter never confirms by accident.
export function DisconnectJiraDialog({ open, submitting, onConfirm, onCancel }: DisconnectJiraDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

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
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={requestClose}>
      <div
        ref={containerRef}
        data-testid="jira-disconnect-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="jira-disconnect-title"
        aria-describedby="jira-disconnect-desc"
        className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div
          id="jira-disconnect-title"
          className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-signal-blocked"
        >
          <AlertTriangle size={13} />
          Disconnect Jira
        </div>
        <p id="jira-disconnect-desc" className="m-0 text-sm text-fg-1">
          This removes the saved site, email and API token for this workspace. Imports from Jira and defect sync stop working until someone connects Jira again.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            data-testid="jira-disconnect-confirm"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? 'Disconnecting…' : 'Disconnect'}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            size="sm"
            data-testid="jira-disconnect-cancel"
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
