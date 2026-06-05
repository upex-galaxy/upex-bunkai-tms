'use client';

import { MarkdownEditor } from '@components/markdown/markdown-editor';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { byteLength } from '@lib/markdown/format';
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

interface StorySeed {
  id: string
  title: string
  description: string | null
  external_id: string | null
}

interface UserStoryFormProps {
  // create: anchor the new story to this module. edit: omit and pass `story`.
  moduleId?: string
  story?: StorySeed
  onSaved?: () => void
  onCancel?: () => void
}

const MAX_BYTES = 50 * 1024;

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'title_required':
      return 'Title is required.';
    case 'title_too_short':
      return 'Title must be at least 3 characters.';
    case 'title_too_long':
      return 'Title must be at most 200 characters.';
    case 'external_id_invalid':
      return 'The Jira key must read as LETTERS-NUMBER, e.g. BK-42.';
    case 'external_id_duplicate':
      return 'This Jira issue is already linked to a story in this project.';
    case 'external_id_immutable':
      return 'The Jira link cannot be changed once set.';
    case 'description_too_long':
      return 'Description must be at most 50 KB.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
  }
  switch (body.error?.code) {
    case 'not_found':
      return 'This story no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Could not save the story.';
  }
}

export function UserStoryForm({ moduleId, story, onSaved, onCancel }: UserStoryFormProps) {
  const router = useRouter();
  const isEdit = story !== undefined;
  const keyLocked = isEdit && (story?.external_id ?? null) !== null;

  const [title, setTitle] = useState(story?.title ?? '');
  const [description, setDescription] = useState(story?.description ?? '');
  const [externalId, setExternalId] = useState(story?.external_id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overCap = byteLength(description) > MAX_BYTES;
  const isValid = title.trim().length > 0 && !overCap && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const trimmedDescription = description.trim();
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      };
      // Only send the key when creating, or when editing a story that has none yet.
      if (!keyLocked) {
        body.external_id = externalId.trim().length > 0 ? externalId.trim() : null;
      }

      const url = isEdit ? `/api/v1/user-stories/${story?.id}` : `/api/v1/modules/${moduleId}/user-stories`;
      const response = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(errorBody));
        setSubmitting(false);
        return;
      }
      toast.success(isEdit ? 'Story updated' : 'Story created');
      router.refresh();
      onSaved?.();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      data-testid="user-story-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
        {isEdit ? 'Edit user story' : 'New user story'}
      </div>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">Title</span>
        <Input
          autoFocus
          data-testid="user-story-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Refund a paid order"
          className="h-9 text-sm"
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Description
          <span className="ml-2 font-normal text-fg-4">Markdown, optional</span>
        </span>
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          maxBytes={MAX_BYTES}
          placeholder="Describe the story in Markdown."
          rows={6}
          testId="user-story-description"
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Jira key
          <span className="ml-2 font-normal text-fg-4">optional, e.g. BK-42</span>
        </span>
        <Input
          data-testid="user-story-jira-key"
          value={externalId}
          disabled={keyLocked}
          onChange={(e) => {
            setExternalId(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="BK-42"
          className="h-9 font-mono text-sm"
        />
        {keyLocked && (
          <span className="mt-1 block text-xs text-fg-4">The Jira link is set and cannot be changed.</span>
        )}
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="user-story-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="user-story-submit"
          variant="primary"
          size="sm"
          disabled={!isValid}
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create story'}
          <ArrowRight size={13} />
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="user-story-cancel"
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
