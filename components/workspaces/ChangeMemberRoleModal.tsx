'use client';

import { Button } from '@components/ui/button';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { UserCog } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface MemberRoleChange {
  userId: string
  email: string
  from: string
  to: string
}

interface ChangeMemberRoleModalProps {
  workspaceId: string
  workspaceName: string
  change: MemberRoleChange | null
  onClose: () => void
  onChanged: () => void
  onRefused: () => void
}

interface ApiErrorBody {
  error?: { message?: string }
}

interface ChangeRoleBody {
  changed?: boolean
  unassigned_bug_count?: number
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

export function roleChangeSuccessMessage(params: { email: string, role: string, workspaceName: string, unassigned: number }): string {
  const base = `${params.email} is now ${roleLabel(params.role)} in ${params.workspaceName}.`;
  if (params.unassigned === 1) {
    return `${base} 1 Bug was unassigned.`;
  }
  if (params.unassigned > 1) {
    return `${base} ${params.unassigned} Bugs were unassigned.`;
  }
  return base;
}

export function ChangeMemberRoleModal({ workspaceId, workspaceName, change, onClose, onChanged, onRefused }: ChangeMemberRoleModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = change !== null;

  const requestClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  useModalDismiss(open, requestClose, containerRef);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open, change?.userId, change?.to]);

  if (!change) {
    return null;
  }

  const failureMessage = `Could not change ${change.email}'s role. Nothing was changed. Try again.`;

  const handleConfirm = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/members/${change.userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: change.to }),
      });
      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as ChangeRoleBody;
        if (body.changed === false) {
          toast.info(`${change.email} is already ${roleLabel(change.to)}. Nothing changed.`);
          onClose();
          onRefused();
          return;
        }
        toast.success(roleChangeSuccessMessage({ email: change.email, role: change.to, workspaceName, unassigned: body.unassigned_bug_count ?? 0 }));
        onClose();
        onChanged();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      if (response.status === 404) {
        toast.error('This teammate is no longer a member of this workspace.');
        onClose();
        onRefused();
        return;
      }
      if (response.status === 403 || response.status === 409 || response.status === 422) {
        toast.error(body.error?.message ?? 'This role change is not allowed.');
        onClose();
        onRefused();
        return;
      }
      toast.error(failureMessage);
    }
    catch {
      toast.error(failureMessage);
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
        data-testid="change-member-role-modal"
        role="alertdialog"
        aria-modal="true"
        aria-busy={submitting}
        aria-labelledby="change-member-role-title"
        aria-describedby="change-member-role-desc"
        className="w-full max-w-[460px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div
          id="change-member-role-title"
          className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-fg-2"
        >
          <UserCog size={13} aria-hidden="true" />
          Change role
        </div>

        <div id="change-member-role-desc" className="grid gap-2 text-sm text-fg-1">
          <p className="m-0">
            Change
            {' '}
            <span className="font-mono text-fg-0">{change.email}</span>
            {' '}
            from
            {' '}
            <span className="text-fg-0">{roleLabel(change.from)}</span>
            {' '}
            to
            {' '}
            <span className="text-fg-0">{roleLabel(change.to)}</span>
            {' '}
            in
            {' '}
            <span className="text-fg-0">{workspaceName}</span>
            . The new role applies from their next action. Their Personal Access Tokens stay, and what a token may do follows the new role.
          </p>
          {change.to === 'viewer' && (
            <p className="m-0" data-testid="change-member-role-viewer-note">
              A Viewer cannot be assigned Bugs, so every Bug assigned to them in this workspace becomes unassigned.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="change-member-role-confirm"
            className="max-w-full"
            onClick={() => { void handleConfirm(); }}
            disabled={submitting}
          >
            <span className="truncate">{submitting ? 'Changing…' : `Change to ${roleLabel(change.to)}`}</span>
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            size="sm"
            data-testid="change-member-role-cancel"
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
