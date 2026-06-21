'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { ENVIRONMENT_NAME_MAX } from '@lib/environments/validation';
import { ArrowRight } from 'lucide-react';
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

interface RenameEnvironmentFormProps {
  // The environment UUID being renamed.
  environmentId: string
  // Current name, used to prefill the form.
  initialName: string
  // Invoked after a successful rename so the host can close the form.
  onUpdated?: () => void
  // Invoked when the user dismisses the form.
  onCancel?: () => void
}

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'environment_name_length':
      return `Name must be between 1 and ${ENVIRONMENT_NAME_MAX} characters.`;
    case 'environment_name_taken':
      return 'An environment with this name already exists.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'not_found':
      return 'This environment no longer exists.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return 'Could not save the environment — check your input.';
    default:
      return body.error?.message ?? 'Could not save the environment.';
  }
}

export function RenameEnvironmentForm({
  environmentId,
  initialName,
  onUpdated,
  onCancel,
}: RenameEnvironmentFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const tooLong = trimmedName.length > ENVIRONMENT_NAME_MAX;
  const isValid = trimmedName.length >= 1 && !tooLong && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/environments/${environmentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success('Environment updated');
      // Refresh the Server Component so the explorer + any env picker pick up the
      // new name (runs keep referencing the same row — rename is not a new row).
      router.refresh();
      onUpdated?.();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      data-testid="rename-environment-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Rename environment
        </div>
        <p className="m-0 text-xs text-fg-3">
          Existing runs keep referencing this environment after the rename.
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Environment name
        </span>
        <Input
          autoFocus
          data-testid="rename-environment-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Production"
          className="h-9 text-sm"
        />
        {tooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="rename-environment-name-hint">
            Name must be
            {' '}
            {ENVIRONMENT_NAME_MAX}
            {' '}
            characters or fewer.
          </span>
        )}
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="rename-environment-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="rename-environment-submit"
          variant="primary"
          size="sm"
          disabled={!isValid}
        >
          {submitting ? 'Saving…' : 'Save changes'}
          <ArrowRight size={13} />
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="rename-environment-cancel"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
