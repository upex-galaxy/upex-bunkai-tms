'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { isLeaveConfirmEnabled } from '@lib/account/leave-workspace';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface DeleteWorkspaceTarget {
  id: string
  slug: string
  name: string
  otherMemberCount: number
}

interface DeleteWorkspaceModalProps {
  workspace: DeleteWorkspaceTarget | null
  onClose: () => void
}

interface DeleteWorkspaceSuccessBody {
  wasActiveWorkspace: boolean
  newActiveWorkspaceId: string | null
  newActiveWorkspaceName: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

// Settings > Workspaces delete confirmation (BK-512, ADR-0015). Structurally
// mirrors `LeaveWorkspaceModal` (overlay, `role="alertdialog"`,
// `useModalDismiss`, type-to-confirm gate via the same `isLeaveConfirmEnabled`
// pure check — reused as-is, the semantics ("typed value === workspace
// name") are identical for both destructive confirmations) — plus two
// additions this action needs that Leave does not: a counted disclosure of
// the OTHER people it evicts (AC-19; the message shape `bunkai_delete_
// environment`'s `environment_in_use` already uses) and an export-first
// offer (AC-06). AC-04/AC-05/AC-20 come for free from the shared gate +
// `useModalDismiss` + the always-reset-on-(re)open pattern below — reopening
// after following the export link starts with an empty field exactly like
// any other reopen (N6: one reset rule for the whole confirmation).
export function DeleteWorkspaceModal({ workspace, onClose }: DeleteWorkspaceModalProps) {
  const router = useRouter();
  const [typedValue, setTypedValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = workspace !== null;

  const requestClose = () => {
    if (!submitting) {
      setTypedValue('');
      onClose();
    }
  };

  useModalDismiss(open, requestClose, containerRef);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open, workspace?.id]);

  if (!workspace) {
    return null;
  }

  const confirmEnabled = isLeaveConfirmEnabled(typedValue, workspace.name);

  const handleConfirm = async () => {
    if (!confirmEnabled || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspace.id}`, { method: 'DELETE' });

      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as Partial<DeleteWorkspaceSuccessBody>;
        setTypedValue('');
        onClose();

        // AC-10: deleting the caller's only (and active) workspace lands
        // them on onboarding. AC-11: deleting the active one of several
        // re-points them to a remaining workspace, announced by name (same
        // toast shape Leave uses). Deleting a workspace that was NOT the
        // caller's active one changes nothing about their context — stay put
        // with a plain confirmation, matching Leave's identical short-circuit.
        if (!body.wasActiveWorkspace) {
          toast.success(`${workspace.name} was deleted.`);
          router.refresh();
          return;
        }

        if (!body.newActiveWorkspaceId) {
          toast.success(`${workspace.name} was deleted.`);
          router.push('/onboarding');
          return;
        }

        toast.success(`${workspace.name} was deleted. ${body.newActiveWorkspaceName ?? 'Another workspace'} is now your active workspace.`);
        router.refresh();
        return;
      }

      const errBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
      toast.error(errBody.error?.message ?? 'Could not delete the workspace.');
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
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
        data-testid="delete-workspace-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-workspace-title"
        aria-describedby="delete-workspace-desc"
        className="w-full max-w-[460px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div
          id="delete-workspace-title"
          className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-0"
        >
          <Trash2 size={14} className="text-signal-fail" />
          Delete workspace
        </div>

        <p id="delete-workspace-desc" className="m-0 text-sm text-fg-1">
          You are about to delete
          {' '}
          <span className="font-mono text-fg-0">{workspace.name}</span>
          {' '}
          (
          <span className="font-mono text-fg-0">{workspace.slug}</span>
          ) and everything inside it. Access ends immediately for everyone,
          including you
          {workspace.otherMemberCount > 0 && (
            <>
              {' '}
              — this removes access for
              {' '}
              {workspace.otherMemberCount}
              {' '}
              other
              {' '}
              {workspace.otherMemberCount === 1 ? 'person' : 'people'}
            </>
          )}
          . The workspace becomes permanently erased 30 days from now; you
          can restore it with everything it held before that deadline
          passes, from the link in the confirmation email.
        </p>

        <p className="mt-3 text-xs text-fg-3">
          Export this workspace&apos;s data first — you cannot export it once
          the workspace is deleted.
          {' '}
          <a
            href="/settings/data-export"
            data-testid="delete-workspace-export-link"
            className="font-medium text-accent underline underline-offset-2"
          >
            Go to Data export
          </a>
        </p>

        <div className="mt-4 flex flex-col gap-1">
          <Label htmlFor="delete-workspace-input">Type the workspace&apos;s exact name to confirm:</Label>
          <Input
            ref={inputRef}
            id="delete-workspace-input"
            data-testid="delete-workspace-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={workspace.name}
            value={typedValue}
            onChange={e => setTypedValue(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            data-testid="delete-workspace-confirm"
            onClick={() => { void handleConfirm(); }}
            disabled={!confirmEnabled || submitting}
          >
            {submitting
              ? 'Deleting…'
              : (
                  <>
                    Delete
                    {' '}
                    <span className="font-mono">{workspace.name}</span>
                  </>
                )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="delete-workspace-cancel"
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
