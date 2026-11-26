'use client';

import { READ_ONLY_PROJECT_NOTE } from '@components/billing/ReadOnlyProjectNotice';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { parseRepositoryUrl, REPOSITORY_HINT_MEMBER } from '@lib/runs/ci-link';
import { useState } from 'react';
import { toast } from 'sonner';

interface RepositorySettingsFormProps {
  projectId: string
  initialUrl: string | null
  canEdit: boolean
  readOnly?: boolean
}

interface SaveResponse {
  repository_settings?: { repository_url: string | null }
  error?: { message?: string }
}

export function RepositorySettingsForm({ projectId, initialUrl, canEdit: canEditRole, readOnly = false }: RepositorySettingsFormProps) {
  const canEdit = canEditRole && !readOnly;
  const [saved, setSaved] = useState(initialUrl ?? '');
  const [value, setValue] = useState(initialUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = value.trim() !== saved;

  const submit = async () => {
    const trimmed = value.trim();
    let next: string | null = null;
    if (trimmed !== '') {
      const parsed = parseRepositoryUrl(trimmed);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      next = parsed.value;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/repository-settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repository_url: next }),
      });
      const body = (await response.json().catch(() => ({}))) as SaveResponse;
      if (!response.ok) {
        setError(body.error?.message ?? 'The repository URL could not be saved.');
        return;
      }
      const stored = body.repository_settings?.repository_url ?? '';
      setSaved(stored);
      setValue(stored);
      toast.success(stored === '' ? 'Repository URL removed' : 'Repository URL saved');
    }
    catch {
      setError('The repository URL could not be saved.');
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="repository-settings-card">
      <CardHeader>
        <CardTitle>Repository</CardTitle>
        <CardDescription>
          Commits reported with a run link to this repository. GitHub and GitLab are supported.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canEdit && (
          <p data-testid="repository-settings-readonly-note" className="m-0 text-xs text-fg-3">
            {readOnly ? READ_ONLY_PROJECT_NOTE : REPOSITORY_HINT_MEMBER}
          </p>
        )}
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repository-url">Repository URL</Label>
            <Input
              id="repository-url"
              data-testid="repository-settings-url"
              type="text"
              inputMode="url"
              value={value}
              disabled={!canEdit || busy}
              placeholder="https://github.com/owner/repository"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'repository-url-error' : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
            {error && (
              <p id="repository-url-error" role="alert" data-testid="repository-settings-error" className="m-0 text-xs text-signal-fail">
                {error}
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" size="sm" data-testid="repository-settings-save" disabled={!dirty || busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
