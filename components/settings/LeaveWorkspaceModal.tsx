'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { isLeaveConfirmEnabled } from '@lib/account/leave-workspace';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

export interface LeaveWorkspaceTarget {
  id: string
  slug: string
  name: string
  isActive: boolean
}

interface LeaveWorkspaceModalProps {
  workspace: LeaveWorkspaceTarget | null
  onClose: () => void
  onLeft: (message: string) => void
}

interface LeaveWorkspaceSuccessBody {
  newActiveWorkspaceId: string | null
  newActiveWorkspaceName: string | null
}

interface ApiErrorBody {
  error?: {
    message?: string
  }
}

// Settings > Workspaces leave confirmation (BK-90 Slice B — Scenario 1/C,
// Technical Decision 4). Mirrors `RevokeTokenModal`'s structural convention
// (overlay, `role="alertdialog"`, `useModalDismiss`, submitting-state disables
// everything, toast-on-error, stays open on failure) plus a controlled
// type-to-confirm input gating the Leave button (a genuinely new addition to
// that convention). Copy verbatim from the mockup's `#leave-overlay`
// (settings-workspaces.html:881-897).
export function LeaveWorkspaceModal({ workspace, onClose, onLeft }: LeaveWorkspaceModalProps) {
  const router = useRouter();
  const [typedValue, setTypedValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const open = workspace !== null;

  const requestClose = () => {
    if (!submitting) {
      setTypedValue('');
      onClose();
    }
  };

  useModalDismiss(open, requestClose, containerRef);

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
      const response = await fetch(`/api/v1/workspaces/${workspace.id}/membership`, { method: 'DELETE' });

      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as Partial<LeaveWorkspaceSuccessBody>;
        // Mirrors the mockup's `msg` construction exactly (settleActive()):
        // "You left {name}." plus, only when the route resolved a new active
        // workspace, " {newActiveWorkspaceName} is now your active workspace."
        let message = `You left ${workspace.name}.`;
        if (body.newActiveWorkspaceName) {
          message += ` ${body.newActiveWorkspaceName} is now your active workspace.`;
        }
        setTypedValue('');
        onLeft(message);
        onClose();
        // Soft refresh (not a browser navigation/reload) re-runs the page's
        // server component so the left row drops off the list immediately --
        // matches RevokeTokenModal's convention.
        router.refresh();
        return;
      }

      const errBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
      // Server copy is rendered verbatim, matching RevokeTokenModal/
      // IssueTokenModal's convention. Stays open on failure so the user can
      // retry without retyping the confirmation.
      toast.error(errBody.error?.message ?? 'Could not leave the workspace.');
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
        data-testid="leave-workspace-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-workspace-title"
        aria-describedby="leave-workspace-desc"
        className="w-full max-w-[460px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div
          id="leave-workspace-title"
          className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-0"
        >
          <LogOut size={14} className="text-signal-fail" />
          Leave workspace
        </div>

        <p id="leave-workspace-desc" className="m-0 text-sm text-fg-1">
          You are about to leave
          {' '}
          <span className="font-mono text-fg-0">{workspace.name}</span>
          {' '}
          (
          <span className="font-mono text-fg-0">{workspace.slug}</span>
          ). You lose access to its test cases and runs immediately. To come back, an admin must invite you again.
        </p>

        {workspace.isActive && (
          <p className="mt-3 text-xs text-fg-3">
            This is your active workspace — after leaving, the next one on your list becomes active.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-1">
          <Label htmlFor="leave-workspace-input">Type the workspace&apos;s exact name to confirm:</Label>
          <Input
            id="leave-workspace-input"
            data-testid="leave-workspace-input"
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
            data-testid="leave-workspace-confirm"
            onClick={() => { void handleConfirm(); }}
            disabled={!confirmEnabled || submitting}
          >
            {submitting
              ? 'Leaving…'
              : (
                  <>
                    Leave
                    {' '}
                    <span className="font-mono">{workspace.name}</span>
                  </>
                )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="leave-workspace-cancel"
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
