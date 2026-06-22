'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { safeInternalPath } from '@lib/urls';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
const OTP_REGEX = /^\d{6,8}$/;
const MIN_PASSWORD_LENGTH = 8;

type Step = 'email' | 'password' | 'create' | 'verify';

interface AuthApiError { error?: { message?: string } }

// Lives in its own file so the parent page can wrap it in `<Suspense>` —
// `useSearchParams()` triggers a static-render bailout otherwise, and Next 15
// fails the production build with a "should be wrapped in a suspense
// boundary" error.
export function EmailFirstForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeInternalPath(searchParams.get('next'));

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `confirmed` from check-email; lets us interpret a signin 401 (unconfirmed
  // account → route to the verify step, not "wrong password"). Decision #1.
  const [accountConfirmed, setAccountConfirmed] = useState(true);

  const isEmailValid = EMAIL_REGEX.test(email);
  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;
  const isCodeValid = OTP_REGEX.test(code);

  // GoTrue stores/authenticates emails case-insensitively. Normalise once here
  // so every rail (check-email, signin, signup, confirm) sends the identical
  // value and routes the same user consistently. The raw `email` state is still
  // used for display (e.g. the verify step echo).
  const normalizedEmail = email.trim().toLowerCase();

  const resetTo = (target: Step) => {
    setError(null);
    setStep(target);
  };

  // After a fetch-based signin/confirm the route handler has set the session
  // cookies on its response. `router.refresh()` makes the server components
  // (and the AuthProvider's next getSession) observe the new cookie, then we
  // navigate into the app.
  const completeSignIn = () => {
    router.refresh();
    router.push(next);
  };

  const continueFromEmail = async () => {
    if (!isEmailValid || submitting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/check-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (response.status === 429) {
        setError('Too many attempts. Please wait a moment and retry.');
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as AuthApiError | null;
        setError(body?.error?.message ?? `Could not check this email (${response.status}).`);
        return;
      }
      const body = (await response.json()) as { exists: boolean, confirmed: boolean };
      if (body.exists) {
        setAccountConfirmed(body.confirmed);
        resetTo('password');
      }
      else {
        resetTo('create');
      }
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error checking email.');
    }
    finally {
      setSubmitting(false);
    }
  };

  const signIn = async () => {
    if (!password || submitting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (response.ok) {
        completeSignIn();
        return;
      }
      if (response.status === 429) {
        setError('Too many attempts. Please wait a moment and retry.');
        return;
      }
      if (response.status === 401) {
        if (!accountConfirmed) {
          setCode('');
          setError('Verify your email with the code we sent before signing in.');
          setStep('verify');
          return;
        }
        setError('That email or password is incorrect.');
        return;
      }
      const body = (await response.json().catch(() => null)) as AuthApiError | null;
      setError(body?.error?.message ?? `Sign-in failed (${response.status}).`);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error signing in.');
    }
    finally {
      setSubmitting(false);
    }
  };

  const createAccount = async () => {
    if (!isPasswordValid || submitting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (response.status === 202) {
        setCode('');
        setError(null);
        setAccountConfirmed(false);
        setStep('verify');
        return;
      }
      if (response.status === 429) {
        setError('Too many attempts. Please wait a moment and retry.');
        return;
      }
      if (response.status === 409) {
        setError('An account already exists for this email. Try signing in instead.');
        return;
      }
      const body = (await response.json().catch(() => null)) as AuthApiError | null;
      setError(body?.error?.message ?? `Sign-up failed (${response.status}).`);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error creating account.');
    }
    finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    if (!isCodeValid || submitting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, token: code }),
      });
      if (response.ok) {
        completeSignIn();
        return;
      }
      if (response.status === 429) {
        setError('Too many attempts. Please wait a moment and retry.');
        return;
      }
      if (response.status === 401) {
        setError('That code is invalid or expired.');
        return;
      }
      const body = (await response.json().catch(() => null)) as AuthApiError | null;
      setError(body?.error?.message ?? `Verification failed (${response.status}).`);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error verifying code.');
    }
    finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (submitting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (response.status === 202 || response.status === 409) {
        toast.success('A new code is on its way to your inbox.');
        return;
      }
      if (response.status === 429) {
        setError('Too many attempts. Please wait a moment and retry.');
        return;
      }
      const body = (await response.json().catch(() => null)) as AuthApiError | null;
      setError(body?.error?.message ?? `Could not request a new code (${response.status}).`);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error requesting a new code.');
    }
    finally {
      setSubmitting(false);
    }
  };

  const errorBanner = error
    ? (
        <p data-testid="login-error" role="alert" className="text-xs leading-relaxed text-signal-fail">
          {error}
        </p>
      )
    : null;

  const emailField = (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-fg-2">
        Email
      </span>
      <Input
        type="email"
        data-testid="login-email"
        autoComplete="email"
        placeholder="qa@your-org.dev"
        value={email}
        onChange={e => setEmail(e.target.value)}
        disabled={step !== 'email'}
        className="h-10 text-md"
      />
    </label>
  );

  if (step === 'email') {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void continueFromEmail();
        }}
      >
        {emailField}
        {errorBanner}
        <Button
          type="submit"
          data-testid="login-continue"
          variant="primary"
          size="lg"
          disabled={!isEmailValid || submitting}
          className="w-full justify-center"
        >
          {submitting ? 'Checking…' : 'Continue'}
          <ArrowRight size={14} />
        </Button>
      </form>
    );
  }

  if (step === 'password') {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
      >
        {emailField}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-fg-2">
            Password
          </span>
          <Input
            type="password"
            data-testid="login-password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="h-10 text-md"
            autoFocus
          />
        </label>
        {errorBanner}
        <Button
          type="submit"
          data-testid="login-signin"
          variant="primary"
          size="lg"
          disabled={!password || submitting}
          className="w-full justify-center"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
          <ArrowRight size={14} />
        </Button>
        <button
          type="button"
          onClick={() => { setPassword(''); resetTo('email'); }}
          className="mt-1 inline-flex items-center gap-1 self-start text-xs text-fg-3 underline-offset-2 hover:text-fg-1 hover:underline"
        >
          <ArrowLeft size={12} />
          Use a different email
        </button>
      </form>
    );
  }

  if (step === 'create') {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void createAccount();
        }}
      >
        {emailField}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-fg-2">
            Create a password
          </span>
          <Input
            type="password"
            data-testid="login-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="h-10 text-md"
            autoFocus
          />
          <span className="mt-1.5 block text-2xs text-fg-4">
            Use at least 8 characters.
          </span>
        </label>
        {errorBanner}
        <Button
          type="submit"
          data-testid="login-create"
          variant="primary"
          size="lg"
          disabled={!isPasswordValid || submitting}
          className="w-full justify-center"
        >
          {submitting ? 'Creating…' : 'Create account'}
          <ArrowRight size={14} />
        </Button>
        <button
          type="button"
          onClick={() => { setPassword(''); resetTo('email'); }}
          className="mt-1 inline-flex items-center gap-1 self-start text-xs text-fg-3 underline-offset-2 hover:text-fg-1 hover:underline"
        >
          <ArrowLeft size={12} />
          Use a different email
        </button>
      </form>
    );
  }

  // step === 'verify'
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void verifyCode();
      }}
    >
      <div className="mb-1 text-sm leading-relaxed text-fg-2">
        Check your email for a verification code and enter it below to confirm
        {' '}
        <span className="font-mono text-fg-0">{email}</span>
        .
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Verification code
        </span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          data-testid="login-otp"
          autoComplete="one-time-code"
          placeholder="Verification code"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          className="h-10 text-md tracking-[0.4em]"
          autoFocus
        />
      </label>
      {errorBanner}
      <Button
        type="submit"
        data-testid="login-verify"
        variant="primary"
        size="lg"
        disabled={!isCodeValid || submitting}
        className="w-full justify-center"
      >
        {submitting ? 'Verifying…' : 'Verify and continue'}
        <ArrowRight size={14} />
      </Button>
      <button
        type="button"
        data-testid="login-resend"
        onClick={() => void resendCode()}
        disabled={submitting}
        className="mt-1 self-start text-xs text-fg-3 underline-offset-2 hover:text-fg-1 hover:underline disabled:opacity-50"
      >
        Request a new code
      </button>
    </form>
  );
}
