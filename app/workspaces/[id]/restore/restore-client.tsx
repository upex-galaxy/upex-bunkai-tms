'use client';

import { Button } from '@components/ui/button';
import { createClient } from '@lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

type Phase = 'loading' | 'needs-auth' | 'ready' | 'restoring' | 'done' | 'error';

interface Props {
  workspaceId: string
}

// Client half of the restore link from the deletion-receipt email (BK-512).
// Mirrors `app/invites/accept/accept-client.tsx`'s phase machine and copy
// register — the closest live precedent for "a signed-out link lands here,
// resolve auth first, then confirm one action".
export function RestoreClient({ workspaceId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>('loading');
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setPhase(user ? 'ready' : 'needs-auth');
    });
  }, [supabase]);

  const restore = async () => {
    setPhase('restoring');
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/restore`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        setErrorMessage(body.error?.message ?? 'Could not restore the workspace.');
        setPhase('error');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { workspaceName?: string };
      setWorkspaceName(body.workspaceName ?? null);
      toast.success('Workspace restored.');
      setPhase('done');
      router.refresh();
    }
    catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error.');
      setPhase('error');
    }
  };

  const signIn = () => {
    const here = `/workspaces/${workspaceId}/restore`;
    router.push(`/login?next=${encodeURIComponent(here)}`);
  };

  return (
    <div className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-6">
      <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
        Restore workspace
      </div>
      <h1 className="m-0 text-2xl font-bold tracking-tight text-fg-0">
        Undo this deletion
      </h1>

      {phase === 'loading' && (
        <p className="mt-4 text-sm text-fg-3">Checking session…</p>
      )}

      {phase === 'needs-auth' && (
        <>
          <p className="mt-4 text-sm leading-relaxed text-fg-3">
            Sign in as the workspace Owner. We&apos;ll bring you back here automatically.
          </p>
          <Button type="button" variant="primary" size="lg" onClick={signIn} className="mt-4 w-full justify-center">
            Sign in
          </Button>
        </>
      )}

      {phase === 'ready' && (
        <>
          <p className="mt-4 text-sm leading-relaxed text-fg-3">
            You&apos;re signed in. Click below to restore the workspace with everything it held.
          </p>
          <Button type="button" variant="primary" size="lg" onClick={() => { void restore(); }} className="mt-4 w-full justify-center">
            Restore workspace
          </Button>
        </>
      )}

      {phase === 'restoring' && (
        <p className="mt-4 text-sm text-fg-3">Restoring…</p>
      )}

      {phase === 'done' && (
        <p className="mt-4 text-sm text-fg-3">
          {workspaceName ?? 'The workspace'}
          {' '}
          is back. You can find it in your Workspaces list.
        </p>
      )}

      {phase === 'error' && (
        <>
          <p className="mt-4 text-sm leading-relaxed text-accent">
            {errorMessage ?? 'The workspace could not be restored.'}
          </p>
          <Button type="button" variant="ghost" onClick={() => router.push('/login')} className="mt-4 w-full justify-center">
            Back to sign-in
          </Button>
        </>
      )}
    </div>
  );
}
