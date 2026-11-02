'use client';

import { Button } from '@components/ui/button';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { UserMinus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface RemoveMemberTarget {
  userId: string
  email: string
  role: string
}

interface RemoveMemberModalProps {
  workspaceId: string
  workspaceName: string
  member: RemoveMemberTarget | null
  onClose: () => void
  // Called after a successful removal, once the dialog has closed: the
  // caller refreshes the list and moves focus (the row that opened the
  // dialog no longer exists).
  onRemoved: () => void
  // Called after a refusal (403 / 404 / 409): the row may have changed since
  // the page loaded, so the caller refreshes.
  onRefused: () => void
}

interface ApiErrorBody {
  error?: { message?: string }
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };

// Members > Remove a teammate confirmation (BK-572, master-design-plan §4.22,
// D56). Structural precedent: `RevokeTokenModal` (single-step alertdialog,
// `useModalDismiss`, danger + ghost sm buttons, server copy on error). No
// type-to-confirm gate (that guards deleting a whole workspace; a removal is
// undone by one re-invite). Focus starts on Cancel, the least destructive
// control. A 5xx or network failure keeps the dialog open so the caller can
// retry (AC-14); a refusal closes it, because retrying would only repeat it.
export function RemoveMemberModal({ workspaceId, workspaceName, member, onClose, onRemoved, onRefused }: RemoveMemberModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = member !== null;

  const requestClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  useModalDismiss(open, requestClose, containerRef);

  // The focus trap only wraps focus that is already inside the dialog, so
  // focus has to be moved in explicitly (the LeaveWorkspaceModal lesson).
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open, member?.userId]);

  if (!member) {
    return null;
  }

  const handleConfirm = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success(`${member.email} was removed from ${workspaceName}.`);
        onClose();
        onRemoved();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      if (response.status === 404) {
        toast.error('This teammate is no longer a member of this workspace.');
        onClose();
        onRefused();
        return;
      }
      if (response.status === 403 || response.status === 409) {
        toast.error(body.error?.message ?? 'This removal is not allowed.');
        onClose();
        onRefused();
        return;
      }
      toast.error(`Could not remove ${member.email}. Nothing was changed. Try again.`);
    }
    catch {
      toast.error(`Could not remove ${member.email}. Nothing was changed. Try again.`);
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={requestClose}
    >
      <div
        ref={containerRef}
        data-testid="remove-member-modal"
        role="alertdialog"
        aria-modal="true"
        aria-busy={submitting}
        aria-labelledby="remove-member-title"
        aria-describedby="remove-member-desc"
        className="w-full max-w-[460px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div
          id="remove-member-title"
          className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail"
        >
          <UserMinus size={13} aria-hidden="true" />
          Remove teammate
        </div>

        <p id="remove-member-desc" className="m-0 text-sm text-fg-1">
          You are about to remove
          {' '}
          <span className="font-mono text-fg-0">{member.email}</span>
          {' '}
          (
          {ROLE_LABEL[member.role] ?? member.role}
          ) from
          {' '}
          <span className="text-fg-0">{workspaceName}</span>
          . Their access ends immediately. Their Personal Access Tokens for this workspace stop working, and any Bugs assigned to them become unassigned. Everything they created stays attributed to them. To give them access again, send a new invite.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            data-testid="remove-member-confirm"
            className="max-w-full"
            onClick={() => { void handleConfirm(); }}
            disabled={submitting}
          >
            <span className="truncate">{submitting ? 'Removing…' : `Remove ${member.email}`}</span>
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            size="sm"
            data-testid="remove-member-cancel"
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
