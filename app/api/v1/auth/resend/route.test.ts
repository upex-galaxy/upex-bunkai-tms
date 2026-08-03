import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// This route's handler goes through `@lib/supabase/server`'s SSR client,
// which reads `next/headers`'s `cookies()` — a Next.js request-scoped
// primitive that has no meaning inside a bare `bun:test` process. Mirrors the
// `server-only` shim `lib/api/auth-coexistence.test.ts` already uses for the
// same class of problem: only Next's request-scoping is faked here — never
// the auth/business logic under test. Every assertion below exercises the
// REAL exported `POST` handler, the REAL Zod schema, and a REAL call to
// Supabase Auth (no `supabase.auth.resend` mock, no fixture standing in for
// the bug).
void mock.module('server-only', () => ({}));
void mock.module('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { POST } = await import('./route');

// BK-181 — the email-verification screen's "Request a new code" control
// called POST /api/v1/auth/signup again instead of a dedicated resend rail.
// That route's Zod schema requires `password` (min 8); when the caller's
// `password` React state was empty or stale at the verify step, the request
// failed Zod validation before ever reaching Supabase, and `withApiHandler`'s
// generic ZodError mapping surfaced the raw envelope
// `{"error":{"code":"validation_failed","message":"Request body failed
// validation.","details":[{"path":["password"],...}]}}` — rendered verbatim
// in the UI alert instead of a friendly resend confirmation.
//
// `POST /api/v1/auth/resend` structurally removes the failure mode: its
// request schema has no `password` field at all, so the exact request shape
// the frontend's `resendCode()` now sends (email only) can never trip a
// password-strength validator.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function resendRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/resend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface ResendSuccessBody { status?: string, email?: string }
interface ErrorBody { error?: { code?: string, message?: string, details?: unknown } }

describeOrSkip('BK-181 — POST /api/v1/auth/resend', () => {
  const TEST_EMAIL = `bk181-resend-${Date.now()}@example.test`;
  const TEST_PASSWORD = 'resend-pw-8chars';
  let userId: string | undefined;

  afterAll(async () => {
    if (!hasEnv || !userId) { return; }
    await service().auth.admin.deleteUser(userId);
  });

  it('resends a pending signup OTP for an email-only body — the exact shape resendCode() sends, and the exact case that used to 422 on the reused /signup schema', async () => {
    // Seed a real pending (unconfirmed) account via the admin API — the same
    // "created but not yet verified" state a user is in at the verify step.
    // Uses `email_confirm: false` (no `createUser({ email_confirm: true })`
    // auto-confirm backdoor — that path was removed by ADR-0007/BK-166).
    const admin = service();
    const { data, error: createError } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: false,
    });
    expect(createError).toBeNull();
    userId = data.user?.id;

    // The exact request shape BK-181's fixed `resendCode()` sends: email
    // only, no password field anywhere in the body.
    const response = await POST(resendRequest({ email: TEST_EMAIL }));
    const body = await response.json() as ResendSuccessBody & ErrorBody;

    expect(response.status).toBe(202);
    expect(body.status).toBe('sent');
    // Never the raw validation envelope BK-181 reported leaking into the UI.
    expect(body.error).toBeUndefined();
  });

  it('never re-triggers signup password validation: an email with no pending signup still gets a clean response, never "Request body failed validation."', async () => {
    const response = await POST(resendRequest({ email: `bk181-unseeded-${Date.now()}@example.test` }));
    const body = await response.json() as ErrorBody;

    // Anti-enumeration, mirroring signup/check-email: the route never 422s
    // on password strength — because it never asks for a password.
    expect(response.status).not.toBe(422);
    expect(body.error?.code).not.toBe('validation_failed');
  });
});
