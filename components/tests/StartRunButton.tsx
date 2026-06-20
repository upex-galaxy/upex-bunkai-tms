'use client';

import { Button } from '@components/ui/button';
import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

// BK-34 — inline "Start run" affordance for the Test detail header. Picks an
// environment, POSTs a manual Run, and routes into the runner. Member+ only
// (the parent gates on `canReorder`); viewers never see it.

interface StartRunButtonProps {
  testId: string
  projectSlug: string
  environments: { id: string, name: string }[]
}

interface RunCreatedBody {
  run?: { id: string }
}

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export function StartRunButton({ testId, projectSlug, environments }: StartRunButtonProps) {
  const router = useRouter();
  const [envId, setEnvId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // One idempotency key per attempt (lazy initializer → generated ONCE). A
  // double-submit re-sends the same key, so the server's replay path returns the
  // already-created Run instead of a second one. The key rotates ONLY after a
  // non-ok response (the server hash-checks key reuse BEFORE status).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // No environments configured — shouldn't happen (the seed gives every project
  // Staging + Production), but guard so the header never renders a dead control.
  if (environments.length === 0) {
    return (
      <span data-testid="start-run-empty" className="text-2xs italic text-fg-4">
        No environments configured
      </span>
    );
  }

  const canSubmit = envId !== '' && !submitting;

  const handleStart = async () => {
    if (!canSubmit) { return; }
    setSubmitting(true);

    try {
      const response = await fetch('/api/v1/runs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // 8-128 chars [\w-]; crypto.randomUUID() satisfies the contract.
          'Idempotency-Key': idempotencyKey,
        },
        // executor_mode is omitted on purpose — a cookie session derives the
        // human executor server-side (PO-pending §4). start_token is omitted so
        // the server mints a fresh one; per PO-pending §4 Q1, reusing a token
        // after 24h starts a NEW run, so a fresh token = a fresh run.
        body: JSON.stringify({
          test_id: testId,
          environment_id: envId,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        // Server copy is rendered VERBATIM — e.g. the 422 no_executable_steps
        // message ("Add at least one ATC step to this Test before starting a
        // run.") is frozen API copy and must never be rephrased client-side.
        toast.error(body.error?.message ?? 'Could not start the run.');
        // Rotate the key so a retry starts a fresh idempotency row — the failed
        // row keeps the OLD payload hash and a changed payload under the same
        // key is a hard conflict server-side.
        setIdempotencyKey(crypto.randomUUID());
        setSubmitting(false);
        return;
      }

      // 201 → created, 200 → replay; both return { run }.
      const body = (await response.json().catch(() => ({}))) as RunCreatedBody;
      const runId = body.run?.id;
      if (!runId) {
        toast.error('Could not start the run.');
        setIdempotencyKey(crypto.randomUUID());
        setSubmitting(false);
        return;
      }

      toast.success('Run started');
      router.push(`/projects/${projectSlug}/runs/${runId}`);
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
      setIdempotencyKey(crypto.randomUUID());
      setSubmitting(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        data-testid="start-run-env"
        value={envId}
        onChange={e => setEnvId(e.target.value)}
        disabled={submitting}
        className="h-8 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-sm text-fg-1 hover:border-stroke-3 focus:border-accent focus:outline-none"
      >
        <option value="">Environment…</option>
        {environments.map(env => (
          <option key={env.id} value={env.id}>
            {env.name}
          </option>
        ))}
      </select>
      <Button
        variant="primary"
        size="sm"
        data-testid="start-run-button"
        onClick={() => { void handleStart(); }}
        disabled={!canSubmit}
      >
        <Play size={11} />
        {submitting ? 'Starting…' : 'Start run'}
      </Button>
    </div>
  );
}
