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

interface CreateEnvironmentFormProps {
  // The project UUID, resolved server-side so the form never guesses which
  // project it operates in.
  projectId: string
  // Invoked after a successful create so the host can close the form.
  onCreated?: () => void
  // Invoked when the user dismisses the form.
  onCancel?: () => void
}

// Maps the backend's hybrid error model (house `code` + granular
// `details.reason`) to a single human-friendly message shown inline. Reason wins
// when present; otherwise we branch on the top-level code. AC-exact copy.
function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'environment_name_length':
      return `Name must be between 1 and ${ENVIRONMENT_NAME_MAX} characters.`;
    case 'environment_name_taken':
      return 'An environment with this name already exists.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'not_found':
      return 'This project no longer exists.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return 'Could not add the environment — check your input.';
    default:
      return body.error?.message ?? 'Could not add the environment.';
  }
}

export function CreateEnvironmentForm({
  projectId,
  onCreated,
  onCancel,
}: CreateEnvironmentFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the server rules (>= 1 after trim, <= 50) so the button doesn't enable
  // for input the API will reject — avoids a submit-and-fail round-trip.
  const trimmedName = name.trim();
  const tooLong = trimmedName.length > ENVIRONMENT_NAME_MAX;
  const isValid = trimmedName.length >= 1 && !tooLong && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/environments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success(`Added “${trimmedName}”`);
      setName('');
      // Refresh the Server Component so the explorer picks up the new environment.
      router.refresh();
      onCreated?.();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      data-testid="create-environment-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          New environment
        </div>
        <p className="m-0 text-xs text-fg-3">
          A named deployment target a Run executes against (e.g. Staging, Production).
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Environment name
        </span>
        <Input
          autoFocus
          data-testid="create-environment-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Staging"
          className="h-9 text-sm"
        />
        {tooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="create-environment-name-hint">
            Name must be
            {' '}
            {ENVIRONMENT_NAME_MAX}
            {' '}
            characters or fewer.
          </span>
        )}
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="create-environment-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="create-environment-submit"
          variant="primary"
          size="sm"
          disabled={!isValid}
        >
          {submitting ? 'Adding…' : 'Add environment'}
          <ArrowRight size={13} />
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="create-environment-cancel"
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
