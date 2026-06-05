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

interface DeleteUserStoryDialogProps {
  storyId: string
  storyTitle: string
  onDeleted?: () => void
  onCancel?: () => void
}

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'already_archived':
      return 'This story was already removed.';
  }
  switch (body.error?.code) {
    case 'not_found':
      return 'This story no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Could not remove the story.';
  }
}

export function DeleteUserStoryDialog({ storyId, storyTitle, onDeleted, onCancel }: DeleteUserStoryDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/user-stories/${storyId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success(`Removed “${storyTitle}”`);
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
      data-testid="delete-user-story-dialog"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail">
        Remove user story
      </div>
      <p className="m-0 mb-4 text-sm text-fg-1">
        Remove
        {' '}
        <span className="font-semibold text-fg-0">{storyTitle}</span>
        ? It is archived, not destroyed — it just leaves the module's list.
      </p>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="delete-user-story-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="delete-user-story-confirm"
          variant="primary"
          size="sm"
          onClick={() => { void onConfirm(); }}
          disabled={submitting}
        >
          <Trash2 size={13} />
          {submitting ? 'Removing…' : 'Remove story'}
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="delete-user-story-cancel"
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
