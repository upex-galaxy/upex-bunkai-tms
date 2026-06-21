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
    details?: { reason?: string, run_count?: number }
  }
}

interface DeleteEnvironmentDialogProps {
  // The environment UUID to remove.
  environmentId: string
  environmentName: string
  // Invoked after a successful removal so the host can close the dialog.
  onDeleted?: () => void
  // Invoked when the user dismisses the dialog.
  onCancel?: () => void
}

// Maps the backend error. The in-use block (409 environment_in_use) carries the
// referencing-run count in `details.run_count`; surface the AC-exact message
// with the count so the user understands why removal is blocked.
function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'environment_in_use': {
      const count = body.error.details.run_count;
      if (typeof count === 'number') {
        return `This environment is in use by ${count} run${count === 1 ? '' : 's'} and cannot be removed.`;
      }
      return 'This environment is in use by one or more runs and cannot be removed.';
    }
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'not_found':
      return 'This environment no longer exists.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Could not remove the environment.';
  }
}

export function DeleteEnvironmentDialog({
  environmentId,
  environmentName,
  onDeleted,
  onCancel,
}: DeleteEnvironmentDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/environments/${environmentId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success(`Removed “${environmentName}”`);
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
      data-testid="delete-environment-dialog"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail">
        Remove environment
      </div>

      <p className="m-0 mb-2 text-sm text-fg-1">
        Remove
        {' '}
        <span className="font-semibold text-fg-0">{environmentName}</span>
        ?
      </p>

      <p className="m-0 mb-4 text-xs text-fg-3">
        Environments referenced by a run cannot be removed — the run history that
        targets them is preserved.
      </p>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="delete-environment-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="delete-environment-confirm"
          variant="primary"
          size="sm"
          onClick={() => { void onConfirm(); }}
          disabled={submitting}
        >
          <Trash2 size={13} />
          {submitting ? 'Removing…' : 'Remove environment'}
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="delete-environment-cancel"
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
