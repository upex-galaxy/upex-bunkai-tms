'use client';

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

interface CreateProjectFormProps {
  // The active workspace UUID, resolved server-side and passed down so the
  // form never has to guess which workspace it is operating in.
  workspaceId: string
}

// Maps the backend's hybrid error model (house `code` + granular
// `details.reason`) to a single human-friendly message shown inline. Reason
// wins when present; otherwise we branch on the top-level code.
function friendlyError(body: ApiErrorBody): string {
  const reason = body.error?.details?.reason;
  switch (reason) {
    case 'name_too_short':
      return 'Name must be at least 3 characters.';
    case 'name_too_long':
      return 'Name must be at most 80 characters.';
    case 'name_no_alphanumeric':
      return 'Name must contain at least one letter or digit.';
    case 'description_too_large':
      return 'Description is too large (max 5KB).';
    case 'slug_duplicate_in_workspace':
      return 'A project with this name already exists here.';
    case 'not_a_member':
      return 'You do not have permission in this workspace.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'bad_request':
      return 'Could not create the project — check your input.';
    default:
      return body.error?.message ?? 'Could not create project.';
  }
}

export function CreateProjectForm({ workspaceId }: CreateProjectFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live slug preview uses the SAME helper the server derives the slug with,
  // so what the user sees is what gets stored.
  const slugPreview = slugify(name);
  const isValid = name.trim().length > 0 && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      // 201 — the new project now exists. Refresh the Server Component so the
      // list below picks it up. No project-detail navigation here: the index
      // route already redirects to the first project on the next render.
      setName('');
      setDescription('');
      toast.success('Project created');
      router.refresh();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      data-testid="create-project-form"
      className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-6"
    >
      <div className="mb-5">
        <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Create project
        </div>
        <h1 className="m-0 text-xl font-bold tracking-tight text-fg-0">
          Your workspace is ready
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-3">
          A project groups the modules, user stories, and ATCs you author.
          Name it — the URL slug is derived automatically.
        </p>
      </div>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Project name
        </span>
        <Input
          autoFocus
          data-testid="create-project-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) { setError(null); }
          }}
          placeholder="Checkout flow"
          className="h-10 text-md"
        />
        <span className="mt-1 block text-xs text-fg-4">
          Slug:
          {' '}
          <span className="font-mono text-fg-3" data-testid="create-project-slug-preview">
            {slugPreview || '—'}
          </span>
        </span>
      </label>

      <label className="mb-5 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Description
          <span className="ml-2 font-normal text-fg-4">optional</span>
        </span>
        <textarea
          data-testid="create-project-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this project covers."
          rows={3}
          className="flex w-full resize-y rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-sm text-fg-1 transition-colors duration-token ease-token placeholder:text-fg-4 hover:border-stroke-3 focus-visible:border-accent focus-visible:bg-surface-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>

      {error && (
        <p className="mb-4 text-xs text-signal-fail" data-testid="create-project-error">
          {error}
        </p>
      )}

      <Button
        type="submit"
        data-testid="create-project-submit"
        variant="primary"
        size="lg"
        disabled={!isValid}
        className="w-full justify-center"
      >
        {submitting ? 'Creating…' : 'Create project'}
        <ArrowRight size={14} />
      </Button>
    </form>
  );
}
