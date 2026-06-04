'use client';

import { Button } from '@components/ui/button';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string }
  }
}

interface DeleteModuleDialogProps {
  // The module UUID to soft-delete.
  moduleId: string
  moduleName: string
  // Counts of what the cascade will archive alongside this module, used to make
  // the confirmation honest about the blast radius.
  subModuleCount: number
  atcCount: number
  // Invoked after a successful archive so the host can close the dialog.
  onDeleted?: () => void
  // Invoked when the user dismisses the dialog.
  onCancel?: () => void
}

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'already_archived':
      return 'This module was already archived.';
  }
  switch (body.error?.code) {
    case 'not_found':
      return 'This module no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Could not archive the module.';
  }
}

export function DeleteModuleDialog({
  moduleId,
  moduleName,
  subModuleCount,
  atcCount,
  onDeleted,
  onCancel,
}: DeleteModuleDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cascades = subModuleCount > 0 || atcCount > 0;

  const onConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/modules/${moduleId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success(`Archived “${moduleName}”`);
      router.refresh();
      onDeleted?.();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="delete-module-dialog"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail">
        Delete module
      </div>

      <p className="m-0 mb-2 text-sm text-fg-1">
        Archive
        {' '}
        <span className="font-semibold text-fg-0">{moduleName}</span>
        ?
      </p>

      <p className="m-0 mb-4 text-xs text-fg-3">
        {cascades
          ? (
              <>
                This also archives
                {' '}
                {subModuleCount > 0 && (
                  <span className="text-fg-2">
                    {subModuleCount}
                    {' '}
                    sub-module
                    {subModuleCount === 1 ? '' : 's'}
                  </span>
                )}
                {subModuleCount > 0 && atcCount > 0 ? ' and ' : ''}
                {atcCount > 0 && (
                  <span className="text-fg-2">
                    {atcCount}
                    {' '}
                    ATC
                    {atcCount === 1 ? '' : 's'}
                  </span>
                )}
                {' '}
                beneath it. Archived items are retained, not destroyed — they just
                leave the active tree.
              </>
            )
          : 'It is retained, not destroyed — it just leaves the active tree.'}
      </p>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="delete-module-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="delete-module-confirm"
          variant="primary"
          size="sm"
          onClick={() => { void onConfirm(); }}
          disabled={submitting}
        >
          <Trash2 size={13} />
          {submitting ? 'Archiving…' : 'Archive module'}
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="delete-module-cancel"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
