'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import {
  maxTargetDateUtcIso,
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_NAME_MAX,
  todayUtcIso,
} from '@lib/milestones/validation';
import { ArrowRight } from 'lucide-react';
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

interface CreateMilestoneFormProps {
  // The project UUID, resolved server-side so the form never guesses which
  // project it operates in.
  projectId: string
  // Invoked after a successful create so the host can close the form.
  onCreated?: () => void
  // Invoked when the user dismisses the form.
  onCancel?: () => void
}

// Maps the backend's hybrid error model (house `code` + granular
// `details.reason`) to a single human-friendly message shown inline. Reason
// wins when present; otherwise we branch on the top-level code. AC-exact
// copy for the ratified messages (today-or-later, within-5-years, duplicate).
function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'milestone_name_length':
      return `Name must be between 1 and ${MILESTONE_NAME_MAX} characters.`;
    case 'milestone_description_length':
      return `Description must be ${MILESTONE_DESCRIPTION_MAX} characters or fewer.`;
    case 'milestone_name_taken':
      return 'A milestone with this name already exists.';
    case 'milestone_target_date_past':
      return 'Target date must be today or later.';
    case 'milestone_target_date_too_far':
      return 'Target date must be within the next 5 years.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return 'Could not create the milestone — check your input.';
    default:
      return body.error?.message ?? 'Could not create the milestone.';
  }
}

export function CreateMilestoneForm({
  projectId,
  onCreated,
  onCancel,
}: CreateMilestoneFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the server rules so the button doesn't enable for input the API
  // will reject — avoids a submit-and-fail round-trip. Collapse-then-trim
  // mirrors the RPC's own normalization (Tech Lead decision).
  const normalizedName = name.replaceAll(/\s+/g, ' ').trim();
  const nameTooLong = normalizedName.length > MILESTONE_NAME_MAX;
  const descriptionTooLong = description.length > MILESTONE_DESCRIPTION_MAX;
  const dateInBounds = targetDate.length > 0 && targetDate >= todayUtcIso() && targetDate <= maxTargetDateUtcIso();
  const isValid = normalizedName.length >= 1 && !nameTooLong && !descriptionTooLong && dateInBounds && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: normalizedName, target_date: targetDate, description }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success(`Created “${normalizedName}”`);
      setName('');
      setTargetDate('');
      setDescription('');
      // Refresh the Server Component so the list picks up the new milestone.
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
      data-testid="create-milestone-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          New milestone
        </div>
        <p className="m-0 text-xs text-fg-3">
          A named goal the team's testing work is anchored to, e.g. "Release 2.4".
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Milestone name
        </span>
        <Input
          autoFocus
          data-testid="create-milestone-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Release 2.4"
          className="h-9 text-sm"
        />
        {nameTooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="create-milestone-name-hint">
            Name must be
            {' '}
            {MILESTONE_NAME_MAX}
            {' '}
            characters or fewer.
          </span>
        )}
      </label>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Target date
        </span>
        <Input
          type="date"
          data-testid="create-milestone-target-date"
          value={targetDate}
          min={todayUtcIso()}
          max={maxTargetDateUtcIso()}
          onChange={(e) => {
            setTargetDate(e.target.value);
            if (error) { setError(null); }
          }}
          className="h-9 w-[160px] font-mono text-sm"
        />
        {targetDate.length > 0 && !dateInBounds && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="create-milestone-target-date-hint">
            {targetDate < todayUtcIso() ? 'Target date must be today or later.' : 'Target date must be within the next 5 years.'}
          </span>
        )}
      </label>

      <label className="mb-4 block">
        <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-fg-2">
          <span>
            Description
            {' '}
            <span className="font-normal text-fg-3">(optional)</span>
          </span>
          <span className="font-mono text-2xs text-fg-3" data-testid="create-milestone-description-counter">
            {description.length}
            /
            {MILESTONE_DESCRIPTION_MAX}
          </span>
        </span>
        <textarea
          data-testid="create-milestone-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Second summer cut"
          rows={3}
          className="w-full rounded-2 border border-stroke-2 bg-surface-1 px-3 py-2 text-sm text-fg-0 outline-none transition-colors duration-token ease-token placeholder:text-fg-4 focus-visible:border-accent"
        />
        {descriptionTooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="create-milestone-description-hint">
            Description must be
            {' '}
            {MILESTONE_DESCRIPTION_MAX}
            {' '}
            characters or fewer.
          </span>
        )}
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="create-milestone-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="create-milestone-submit"
          variant="primary"
          size="sm"
          disabled={!isValid}
        >
          {submitting ? 'Creating…' : 'Create milestone'}
          <ArrowRight size={13} />
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="create-milestone-cancel"
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
