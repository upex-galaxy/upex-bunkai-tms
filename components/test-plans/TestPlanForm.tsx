'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import {
  normalizeTestPlanText,
  TEST_PLAN_DESCRIPTION_MAX,
  TEST_PLAN_GOAL_MAX,
  TEST_PLAN_NAME_MAX,
} from '@lib/test-plans/validation';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

// BK-202 — the create AND edit form for a Test Plan.
//
// The sibling Milestone entity ships two near-identical components
// (CreateMilestoneForm / EditMilestoneForm) because its two paths genuinely
// diverge: the target-date bounds fire on create but only conditionally on
// edit. Test Plans have no now()-relative field, so create and edit share one
// rulebook exactly — same three fields, same lengths, same normalization,
// same uniqueness rule (ratified T5). Two copies of that would be duplication
// with no behavioural difference to justify it, so this is one component with
// a `mode`.

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string }
  }
}

interface TestPlanFormProps {
  mode: 'create' | 'edit'
  // create: the project UUID, resolved server-side so the form never guesses
  // which project it operates in. edit: the plan UUID.
  targetId: string
  initialName?: string
  initialDescription?: string
  initialGoal?: string
  // Invoked after a successful write so the host can close the form.
  onSaved?: () => void
  // Invoked when the user dismisses the form.
  onCancel?: () => void
}

// Maps the backend's hybrid error model (house `code` + granular
// `details.reason`) to a single human-friendly message shown inline. Reason
// wins when present; otherwise we branch on the top-level code. Copy is the
// ratified wording (BK-202 Technical Question 1), which the API returns
// verbatim — this switch exists so a `reason` we know about renders the same
// string even if a future envelope trims the message.
function friendlyError(body: ApiErrorBody, mode: 'create' | 'edit'): string {
  switch (body.error?.details?.reason) {
    case 'test_plan_name_length':
      return `Name must be between 1 and ${TEST_PLAN_NAME_MAX} characters.`;
    case 'test_plan_description_length':
      return `Description must be ${TEST_PLAN_DESCRIPTION_MAX} characters or fewer.`;
    case 'test_plan_goal_length':
      return `Goal must be ${TEST_PLAN_GOAL_MAX} characters or fewer.`;
    case 'test_plan_name_taken':
      return 'A test plan with this name already exists.';
    case 'test_plan_not_open':
      return 'This test plan is closed and can no longer be edited.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'not_found':
      return mode === 'create' ? 'This project no longer exists.' : 'This test plan no longer exists.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return `Could not ${mode === 'create' ? 'create' : 'save'} the test plan — check your input.`;
    default:
      return body.error?.message ?? `Could not ${mode === 'create' ? 'create' : 'save'} the test plan.`;
  }
}

export function TestPlanForm({
  mode,
  targetId,
  initialName = '',
  initialDescription = '',
  initialGoal = '',
  onSaved,
  onCancel,
}: TestPlanFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [goal, setGoal] = useState(initialGoal);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the server rules so the button doesn't enable for input the API
  // will reject — avoids a submit-and-fail round-trip. Collapse-then-trim
  // mirrors the RPC's own normalization. Uniqueness is deliberately NOT
  // pre-checked here: the database index is the only correct arbiter, and a
  // client-side guess would be wrong the moment a second person is typing.
  const normalizedName = normalizeTestPlanText(name);
  const normalizedGoal = normalizeTestPlanText(goal);
  const nameTooLong = normalizedName.length > TEST_PLAN_NAME_MAX;
  const descriptionTooLong = description.length > TEST_PLAN_DESCRIPTION_MAX;
  const goalTooLong = normalizedGoal.length > TEST_PLAN_GOAL_MAX;
  const isValid = normalizedName.length >= 1 && !nameTooLong && !descriptionTooLong && !goalTooLong && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        mode === 'create' ? `/api/v1/projects/${targetId}/test-plans` : `/api/v1/test-plans/${targetId}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: normalizedName, description, goal: normalizedGoal }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body, mode));
        setSubmitting(false);
        return;
      }
      if (mode === 'create') {
        toast.success(`Created “${normalizedName}”`);
        setName('');
        setDescription('');
        setGoal('');
      }
      else {
        toast.success('Test plan details updated');
      }
      // Refresh the Server Component so the list / detail picks up the write.
      router.refresh();
      onSaved?.();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  const testIdPrefix = mode === 'create' ? 'create-test-plan' : 'edit-test-plan';

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      data-testid={`${testIdPrefix}-form`}
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          {mode === 'create' ? 'New test plan' : 'Edit plan details'}
        </div>
        <p className="m-0 text-xs text-fg-3">
          A named scope a testing cycle runs against, e.g. "Release 2.4 regression".
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Name
        </span>
        <Input
          autoFocus
          data-testid={`${testIdPrefix}-name`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="e.g. Release 2.4 regression"
          className="h-9 text-sm"
        />
        {nameTooLong
          ? (
              <span className="mt-1 block text-xs text-signal-fail" data-testid={`${testIdPrefix}-name-hint`}>
                Name must be
                {' '}
                {TEST_PLAN_NAME_MAX}
                {' '}
                characters or fewer.
              </span>
            )
          : (
              <span className="mt-1 block text-xs text-fg-3">
                Must be unique within this project (case-insensitive).
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
          <span className="font-mono text-2xs text-fg-3" data-testid={`${testIdPrefix}-description-counter`}>
            {description.length}
            /
            {TEST_PLAN_DESCRIPTION_MAX}
          </span>
        </span>
        <textarea
          data-testid={`${testIdPrefix}-description`}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="What this plan covers and when it should run"
          rows={3}
          className="w-full rounded-2 border border-stroke-2 bg-surface-1 px-3 py-2 text-sm text-fg-0 outline-none transition-colors duration-token ease-token placeholder:text-fg-4 focus-visible:border-accent"
        />
        {descriptionTooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid={`${testIdPrefix}-description-hint`}>
            Description must be
            {' '}
            {TEST_PLAN_DESCRIPTION_MAX}
            {' '}
            characters or fewer.
          </span>
        )}
      </label>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Goal / release label
          {' '}
          <span className="font-normal text-fg-3">(optional)</span>
        </span>
        <Input
          data-testid={`${testIdPrefix}-goal`}
          value={goal}
          onChange={(e) => {
            setGoal(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Release 2.4"
          className="h-9 w-[220px] font-mono text-sm"
        />
        {goalTooLong && (
          <span className="mt-1 block text-xs text-signal-fail" data-testid={`${testIdPrefix}-goal-hint`}>
            Goal must be
            {' '}
            {TEST_PLAN_GOAL_MAX}
            {' '}
            characters or fewer.
          </span>
        )}
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid={`${testIdPrefix}-error`} role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid={`${testIdPrefix}-submit`}
          variant="primary"
          size="sm"
          disabled={!isValid}
        >
          {submitting
            ? (mode === 'create' ? 'Creating…' : 'Saving…')
            : (mode === 'create' ? 'Create plan' : 'Save changes')}
          <ArrowRight size={13} />
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid={`${testIdPrefix}-cancel`}
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
