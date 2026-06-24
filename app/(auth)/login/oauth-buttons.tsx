'use client';

import type { OAuthProvider } from '@lib/auth/oauth';
import { Button } from '@components/ui/button';
import { safeInternalPath } from '@lib/urls';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

// Lives in its own client file so the parent (a Server Component) can keep
// rendering statically; like the email form it reads `useSearchParams()` so the
// page wraps it in <Suspense>.
//
// The flow STARTS server-side: navigating to /auth/oauth/{provider} lets the
// server mint the CSRF state cookie before redirecting to the provider (BK-3,
// ADR-0008). So onClick is a full navigation, not a client SDK call.
export function OAuthButtons() {
  const searchParams = useSearchParams();
  const next = safeInternalPath(searchParams.get('next'));
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const start = (provider: OAuthProvider) => {
    if (pending) { return; }
    setPending(provider);
    window.location.assign(`/auth/oauth/${provider}?next=${encodeURIComponent(next)}`);
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        data-testid="oauth-github"
        onClick={() => start('github')}
        disabled={pending !== null}
        className="w-full justify-center border-stroke-3 text-white hover:opacity-90"
        style={{ background: '#0d1117' }}
      >
        <GithubMark />
        {pending === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
      </Button>
      <Button
        type="button"
        size="lg"
        data-testid="oauth-google"
        onClick={() => start('google')}
        disabled={pending !== null}
        className="w-full justify-center"
      >
        <GoogleMark />
        {pending === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </Button>
    </div>
  );
}

function GithubMark() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39 41.4 44 36 44 24c0-1.2-.1-2.4-.4-3.5Z" />
    </svg>
  );
}
