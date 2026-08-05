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

interface EditMilestoneFormProps {
  milestoneId: string
  initialName: string
  initialTargetDate: string
  initialDescription: string
  // Invoked after a successful edit so the host can close the form.
  onUpdated?: () => void
  // Invoked when the user dismisses the form.
  onCancel?: () => void
}

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
    case 'not_found':
      return 'This milestone no longer exists.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return 'Could not save the milestone — check your input.';
    default:
      return body.error?.message ?? 'Could not save the milestone.';
  }
}

export function EditMilestoneForm({
  milestoneId,
  initialName,
  initialTargetDate,
  initialDescription,
  onUpdated,
  onCancel,
}: EditMilestoneFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [targetDate, setTargetDate] = useState(initialTargetDate);
  const [description, setDescription] = useState(initialDescription);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedName = name.replaceAll(/\s+/g, ' ').trim();
  const nameTooLong = normalizedName.length > MILESTONE_NAME_MAX;
  const descriptionTooLong = description.length > MILESTONE_DESCRIPTION_MAX;
  // The date bound applies ONLY when the value actually changed — an
  // unchanged past-dated milestone must stay editable (Tech Lead decision;
  // mirrors the RPC's own `p_target_date is distinct from` guard).
  const dateChanged = targetDate !== initialTargetDate;
  const dateInBounds = !dateChanged || (targetDate.length > 0 && targetDate >= todayUtcIso() && targetDate <= maxTargetDateUtcIso());
  const isValid = normalizedName.length >= 1 && !nameTooLong && !descriptionTooLong && dateInBounds && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: normalizedName, target_date: targetDate, description }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success('Milestone updated');
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
      id="edit-form"
      onSubmit={(e) => { void onSubmit(e); }}
      data-testid="edit-milestone-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Edit milestone
        </div>
        <p className="m-0 text-xs text-fg-3">
          The target date may be moved forward or backward while the milestone is active.
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Milestone name
        </span>
        <Input
          autoFocus
          data-testid="edit-milestone-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          className="h-9 text-sm"
        />
        {nameTooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="edit-milestone-name-hint">
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
          data-testid="edit-milestone-target-date"
          value={targetDate}
          // The min/max advisory only constrains a NEW value — an unchanged
          // past date already sits below `min` and must remain selectable as
          // "no change", so the picker itself is left unconstrained; the
          // dateInBounds check above (not the input's native validation)
          // enforces the rule.
          onChange={(e) => {
            setTargetDate(e.target.value);
            if (error) { setError(null); }
          }}
          className="h-9 w-[160px] font-mono text-sm"
        />
        {dateChanged && !dateInBounds && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="edit-milestone-target-date-hint">
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
          <span className="font-mono text-2xs text-fg-3" data-testid="edit-milestone-description-counter">
            {description.length}
            /
            {MILESTONE_DESCRIPTION_MAX}
          </span>
        </span>
        <textarea
          data-testid="edit-milestone-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (error) { setError(null); }
          }}
          rows={3}
          className="w-full rounded-2 border border-stroke-2 bg-surface-1 px-3 py-2 text-sm text-fg-0 outline-none transition-colors duration-token ease-token placeholder:text-fg-4 focus-visible:border-accent"
        />
        {descriptionTooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid="edit-milestone-description-hint">
            Description must be
            {' '}
            {MILESTONE_DESCRIPTION_MAX}
            {' '}
            characters or fewer.
          </span>
        )}
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="edit-milestone-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="edit-milestone-submit"
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
            data-testid="edit-milestone-cancel"
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
