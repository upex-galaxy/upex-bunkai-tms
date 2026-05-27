'use client';

import { Button } from '@components/ui/button';
import { createClient } from '@lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

type Phase = 'loading' | 'needs-auth' | 'ready' | 'accepting' | 'done' | 'error';

interface Props {
  token: string
  nextPath: string
}

export function AcceptClient({ token, nextPath }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPhase('error');
      setErrorMessage('Missing invite token.');
      return;
    }
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setPhase(user ? 'ready' : 'needs-auth');
    });
  }, [supabase, token]);

  const accept = async () => {
    setPhase('accepting');
    try {
      const res = await fetch('/api/v1/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        setErrorMessage(body.error?.message ?? 'Could not accept invite.');
        setPhase('error');
        return;
      }
      toast.success('Welcome — you have joined the workspace.');
      setPhase('done');
      router.replace(nextPath);
      router.refresh();
    }
    catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error.');
      setPhase('error');
    }
  };

  const signIn = () => {
    const here = `/invites/accept?token=${encodeURIComponent(token)}`;
    router.push(`/login?next=${encodeURIComponent(here)}`);
  };

  return (
    <div className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-6">
      <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
        Accept invite
      </div>
      <h1 className="m-0 text-2xl font-bold tracking-tight text-fg-0">
        Join the workspace
      </h1>

      {phase === 'loading' && (
        <p className="mt-4 text-sm text-fg-3">Checking session…</p>
      )}

      {phase === 'needs-auth' && (
        <>
          <p className="mt-4 text-sm leading-relaxed text-fg-3">
            Sign in with the email this invite was sent to. We'll bring you back here automatically.
          </p>
          <Button type="button" variant="primary" size="lg" onClick={signIn} className="mt-4 w-full justify-center">
            Sign in
          </Button>
        </>
      )}

      {phase === 'ready' && (
        <>
          <p className="mt-4 text-sm leading-relaxed text-fg-3">
            You're signed in. Click below to accept the invite and join the workspace.
          </p>
          <Button type="button" variant="primary" size="lg" onClick={() => { void accept(); }} className="mt-4 w-full justify-center">
            Accept invite
          </Button>
        </>
      )}

      {phase === 'accepting' && (
        <p className="mt-4 text-sm text-fg-3">Joining workspace…</p>
      )}

      {phase === 'done' && (
        <p className="mt-4 text-sm text-fg-3">Done. Redirecting…</p>
      )}

      {phase === 'error' && (
        <>
          <p className="mt-4 text-sm leading-relaxed text-accent">
            {errorMessage ?? 'Invite could not be accepted.'}
          </p>
          <Button type="button" variant="ghost" onClick={() => router.push('/login')} className="mt-4 w-full justify-center">
            Back to sign-in
          </Button>
        </>
      )}
    </div>
  );
}
