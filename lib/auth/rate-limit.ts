import { createHmac } from 'node:crypto';
import { ApiError } from '@lib/api/error-envelope';
import { env } from '@lib/env';
import { createAdminClient } from '@lib/supabase/admin';
import 'server-only';

// BK-743 — app-level rate limiter (ADR-0007 point 5 follow-up).
//
// Two seams, deliberately separable (BR-10):
//   * WHAT is counted — `rateLimitKey({ scope, identifier, step })`. Today the
//     identifier is a salted digest of the originating network source; a later
//     per-PAT budget swaps the identifier without redesign.
//   * WHERE the count lives — `RateLimitStore`. Today Postgres
//     (`bunkai_rate_limit_consume`, atomic under a per-key advisory lock).

export interface RateLimitWindow {
  windowSeconds: number
  max: number
}

export type RateLimitDecision
  = | { allowed: true }
    | { allowed: false, retryAfterSeconds: number };

export interface RateLimitStore {
  consume: (key: string, windows: RateLimitWindow[]) => Promise<RateLimitDecision>
}

// BR-3: 10 / 60s absorbs human retrying; 60 / 60min caps a patient sweep.
export const CHECK_EMAIL_WINDOWS: RateLimitWindow[] = [
  { windowSeconds: 60, max: 10 },
  { windowSeconds: 3600, max: 60 },
];

// BK-1828: the credential endpoints (password sign-in, sign-up code confirm).
// Per network source: same shape as check-email. Per account: caps guessing on
// one address even when the attempts come from many sources.
export const CREDENTIAL_SOURCE_WINDOWS: RateLimitWindow[] = [
  { windowSeconds: 60, max: 10 },
  { windowSeconds: 3600, max: 60 },
];
export const CREDENTIAL_ACCOUNT_WINDOWS: RateLimitWindow[] = [
  { windowSeconds: 900, max: 10 },
];

export function rateLimitKey(parts: { scope: string, identifier: string, step: string }): string {
  return `${parts.scope}:${parts.identifier}:${parts.step}`;
}

// BR-2: only headers the hosting platform (Vercel) itself asserts. Vercel
// overwrites `x-vercel-forwarded-for` / `x-real-ip` with the connecting client
// address and strips caller-supplied values; a plain `x-forwarded-for` is NOT
// trusted here. With no platform header every request shares one `unknown`
// bucket — fail-conservative, never caller-controlled.
export function sourceFromHeaders(headers: Headers): string {
  const raw = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip');
  const first = raw?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'unknown';
}

// BR-11: the store never sees the raw address. Keyed digest (HMAC) with a salt
// derived from a server-only secret.
export function digestSource(source: string, secret: string = env.SUPABASE_SERVICE_ROLE_KEY): string {
  return createHmac('sha256', secret).update(`rate-limit-source:${source}`).digest('hex');
}

// BK-1828: same rule for an account identifier. The email is normalised the way
// GoTrue stores it, so `User@X.com` and `user@x.com` share one budget.
export function digestAccount(email: string, secret: string = env.SUPABASE_SERVICE_ROLE_KEY): string {
  return createHmac('sha256', secret).update(`rate-limit-account:${email.trim().toLowerCase()}`).digest('hex');
}

interface ConsumeRow { allowed: boolean, retry_after_seconds?: number }

export const postgresRateLimitStore: RateLimitStore = {
  async consume(key, windows) {
    const admin = createAdminClient() as unknown as {
      rpc: (
        fn: 'bunkai_rate_limit_consume',
        args: { p_key: string, p_windows: Array<{ window_seconds: number, max: number }> },
      ) => Promise<{ data: ConsumeRow | null, error: { message: string } | null }>
    };
    const { data, error } = await admin.rpc('bunkai_rate_limit_consume', {
      p_key: key,
      p_windows: windows.map(w => ({ window_seconds: w.windowSeconds, max: w.max })),
    });
    // BR-9: fail closed — never skip the budget so the request can proceed.
    if (error || !data) {
      throw new ApiError('upstream_error', 'This service is temporarily unavailable. Please try again.', { status: 502 });
    }
    return data.allowed
      ? { allowed: true }
      : { allowed: false, retryAfterSeconds: Math.max(1, data.retry_after_seconds ?? 1) };
  },
};

// Throws the published `rate_limited` outcome with a wait hint (BR-6, BR-7).
// The message is static: identical for every caller (BR-4).
export async function enforceRateLimit(args: {
  key: string
  windows: RateLimitWindow[]
  store?: RateLimitStore
}): Promise<void> {
  const decision = await (args.store ?? postgresRateLimitStore).consume(args.key, args.windows);
  if (!decision.allowed) {
    throw new ApiError('rate_limited', 'Too many attempts. Please wait and try again.', {
      details: { retry_after_seconds: decision.retryAfterSeconds },
      headers: { 'Retry-After': String(decision.retryAfterSeconds) },
    });
  }
}

// BK-1828: the two credential budgets. The source budget runs before the body is
// parsed (malformed submissions spend it too); the account budget runs once the
// email is known, before Supabase is called.
export async function enforceSourceRateLimit(headers: Headers, step: string, store?: RateLimitStore): Promise<void> {
  await enforceRateLimit({
    key: rateLimitKey({ scope: 'source', identifier: digestSource(sourceFromHeaders(headers)), step }),
    windows: CREDENTIAL_SOURCE_WINDOWS,
    store,
  });
}

export async function enforceAccountRateLimit(email: string, step: string, store?: RateLimitStore): Promise<void> {
  await enforceRateLimit({
    key: rateLimitKey({ scope: 'account', identifier: digestAccount(email), step }),
    windows: CREDENTIAL_ACCOUNT_WINDOWS,
    store,
  });
}
