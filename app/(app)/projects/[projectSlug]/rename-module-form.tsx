'use client';

import { MarkdownEditor } from '@components/markdown/markdown-editor';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { slugify } from '@lib/utils/slug';
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

interface RenameModuleFormProps {
  // The module UUID being edited.
  moduleId: string
  // Current name + description, used to prefill the form.
  initialName: string
  initialDescription: string | null
  // Invoked after a successful update so the host can close the form.
  onUpdated?: () => void
  // Invoked when the user dismisses the form.
  onCancel?: () => void
}

const MAX_DESCRIPTION_LENGTH = 500;

// Maps the backend's hybrid error model (house `code` + granular
// `details.reason`) to a single human-friendly message shown inline.
function friendlyError(body: ApiErrorBody): string {
  const reason = body.error?.details?.reason;
  switch (reason) {
    case 'name_required':
      return 'Name is required.';
    case 'name_too_short':
      return 'Name must be at least 2 characters.';
    case 'name_too_long':
      return 'Name must be at most 80 characters.';
    case 'name_no_alphanumeric':
      return 'Name must contain at least one letter or digit.';
    case 'description_too_long':
      return 'Description must be at most 500 characters.';
    case 'module_slug_duplicate':
      return 'A module with this name already exists under the same parent.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
  }
  switch (body.error?.code) {
    case 'not_found':
      return 'This module no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return 'Could not save the module — check your input.';
    default:
      return body.error?.message ?? 'Could not save the module.';
  }
}

export function RenameModuleForm({
  moduleId,
  initialName,
  initialDescription,
  onUpdated,
  onCancel,
}: RenameModuleFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live slug preview uses the SAME helper the server rebuilds the path with, so
  // the user sees how renaming will reshape the stored path segment.
  const slugPreview = slugify(name);
  const isValid = name.trim().length > 0 && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const trimmedDescription = description.trim();
      const response = await fetch(`/api/v1/modules/${moduleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: trimmedDescription.length > 0 ? trimmedDescription : null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success('Module updated');
      // Refresh the Server Component so the tree + breadcrumbs pick up the change.
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
      data-testid="rename-module-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Rename module
        </div>
        <p className="m-0 text-xs text-fg-3">
          Renaming updates the tree label, breadcrumbs, and stored path.
        </p>
      </div>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Module name
        </span>
        <Input
          autoFocus
          data-testid="rename-module-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Payments & Billing"
          className="h-9 text-sm"
        />
        <span className="mt-1 block text-xs text-fg-4">
          Slug:
          {' '}
          <span className="font-mono text-fg-3" data-testid="rename-module-slug-preview">
            {slugPreview || '—'}
          </span>
        </span>
      </label>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Description
          <span className="ml-2 font-normal text-fg-4">optional</span>
        </span>
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="What this module covers."
          rows={3}
          testId="rename-module-description"
        />
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="rename-module-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="rename-module-submit"
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
            data-testid="rename-module-cancel"
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
