'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { slugify } from '@lib/utils/slug';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface ApiSuccessBody {
  warning?: string
}

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string }
  }
}

interface CreateModuleFormProps {
  // The project UUID, resolved server-side and passed down so the form never
  // has to guess which project it is operating in.
  projectId: string
  // The parent module UUID when adding a sub-module; null/undefined for a
  // root-level module.
  parentModuleId?: string | null
  // Human-readable parent label shown in the form header (e.g. "Payment").
  parentLabel?: string
  // Invoked after a successful create so the host can close the form.
  onCreated?: () => void
  // Invoked when the user dismisses the form.
  onCancel?: () => void
}

const MAX_DESCRIPTION_LENGTH = 500;

// Maps the backend's hybrid error model (house `code` + granular
// `details.reason`) to a single human-friendly message shown inline. Reason
// wins when present; otherwise we branch on the top-level code.
function friendlyError(body: ApiErrorBody): string {
  const reason = body.error?.details?.reason;
  switch (reason) {
    case 'name_too_short':
      return 'Name must be at least 2 characters.';
    case 'name_too_long':
      return 'Name must be at most 80 characters.';
    case 'name_no_alphanumeric':
      return 'Name must contain at least one letter or digit.';
    case 'description_too_long':
      return 'Description must be at most 500 characters.';
    case 'depth_exceeded':
      return 'Maximum nesting depth is 6 levels.';
    case 'parent_invalid':
      return 'The parent module is no longer valid.';
    case 'module_slug_duplicate':
      return 'A module with this name already exists under the same parent.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return 'Could not create the module — check your input.';
    default:
      return body.error?.message ?? 'Could not create module.';
  }
}

export function CreateModuleForm({
  projectId,
  parentModuleId,
  parentLabel,
  onCreated,
  onCancel,
}: CreateModuleFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live slug preview uses the SAME helper the server derives the path segment
  // with, so what the user sees is what gets stored.
  const slugPreview = slugify(name);
  const isValid = name.trim().length > 0 && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/modules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          ...(parentModuleId ? { parent_module_id: parentModuleId } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      // 201 — the module now exists. A `warning` string is present only when
      // the resulting depth is >= 5; surface it as a non-blocking notice.
      const body = (await response.json().catch(() => ({}))) as ApiSuccessBody;
      if (body.warning) {
        toast.warning(body.warning);
      }
      else {
        toast.success('Module created');
      }
      setName('');
      setDescription('');
      // Refresh the Server Component so the tree picks up the new module.
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
      data-testid="create-module-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          {parentModuleId ? 'Add sub-module' : 'New module'}
        </div>
        {parentLabel && (
          <p className="m-0 text-xs text-fg-3">
            Under
            {' '}
            <span className="font-medium text-fg-1">{parentLabel}</span>
          </p>
        )}
      </div>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Module name
        </span>
        <Input
          autoFocus
          data-testid="create-module-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Payment"
          className="h-9 text-sm"
        />
        <span className="mt-1 block text-xs text-fg-4">
          Slug:
          {' '}
          <span className="font-mono text-fg-3" data-testid="create-module-slug-preview">
            {slugPreview || '—'}
          </span>
        </span>
      </label>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Description
          <span className="ml-2 font-normal text-fg-4">optional</span>
        </span>
        <textarea
          data-testid="create-module-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="What this module covers."
          rows={3}
          className="flex w-full resize-y rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-sm text-fg-1 transition-colors duration-token ease-token placeholder:text-fg-4 hover:border-stroke-3 focus-visible:border-accent focus-visible:bg-surface-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="create-module-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="create-module-submit"
          variant="primary"
          size="sm"
          disabled={!isValid}
        >
          {submitting ? 'Creating…' : 'Create module'}
          <ArrowRight size={13} />
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="create-module-cancel"
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
