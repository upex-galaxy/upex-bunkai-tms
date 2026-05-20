'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { ArrowRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

interface MagicLinkApiError { error?: { message?: string } }

// Lives in its own file so the parent page can wrap it in `<Suspense>` —
// `useSearchParams()` triggers a static-render bailout otherwise, and Next 15
// fails the production build with a "should be wrapped in a suspense
// boundary" error.
export function MagicLinkForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/projects';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isValid = EMAIL_REGEX.test(email);

  const sendMagicLink = async () => {
    if (!isValid || submitting) { return; }
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as MagicLinkApiError | null;
        toast.error(body?.error?.message ?? `Magic-link request failed (${response.status})`);
        return;
      }
      setSent(true);
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error sending magic link';
      toast.error(message);
    }
    finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-3 border border-signal-pass/30 bg-signal-pass-bg p-3 text-sm text-fg-1">
        <div className="font-semibold text-signal-pass">Check your inbox</div>
        <div className="mt-1 text-fg-2">
          A sign-in link was sent to
          {' '}
          <span className="font-mono text-fg-0">{email}</span>
          .
        </div>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-3 text-xs text-fg-3 underline-offset-2 hover:text-fg-1 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void sendMagicLink();
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Email
        </span>
        <Input
          type="email"
          autoComplete="email"
          placeholder="qa@your-org.dev"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="h-10 text-md"
        />
      </label>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={!isValid || submitting}
        className="w-full justify-center"
      >
        {submitting ? 'Sending…' : 'Send magic link'}
        <ArrowRight size={14} />
      </Button>
    </form>
  );
}
