import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-1828 — brute-force throttle on the sign-up code check (AC8). The REAL
// route handler, limiter and error envelope run; the rate-limit store RPC and
// the Supabase `verifyOtp` call are in-memory fakes (the SQL is covered by
// `lib/auth/rate-limit.db.test.ts`).
void mock.module('server-only', () => ({}));
// `process.env` is shared by every file of a one-process `bun test` run, so the
// placeholders are restored in `afterAll`.
const FAKE_ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'] as const;
const envBefore = FAKE_ENV_KEYS.map(key => [key, process.env[key]] as const);
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-test-key';
process.env.CRON_SECRET ??= 'cron-secret-test';

const hits = new Map<string, number[]>();
let storeDown = false;
const verifyCalls: string[] = [];
let upstreamThrottled = false;

function consume(key: string, windows: Array<{ window_seconds: number, max: number }>) {
  const now = Date.now();
  const list = hits.get(key) ?? [];
  let retry = 0;
  for (const w of windows) {
    const inWin = list.filter(t => t > now - w.window_seconds * 1000);
    if (inWin.length >= w.max) {
      retry = Math.max(retry, Math.max(1, Math.ceil((Math.min(...inWin) + w.window_seconds * 1000 - now) / 1000)));
    }
  }
  if (retry > 0) {
    return { allowed: false, retry_after_seconds: retry };
  }
  hits.set(key, [...list, now]);
  return { allowed: true };
}

// `mock.module` is PROCESS-wide and never restored: the fakes answer only while
// THIS file's tests run, and fall through to real clients otherwise.
let fakesActive = false;
beforeAll(() => { fakesActive = true; });
afterAll(() => {
  fakesActive = false;
  for (const [key, value] of envBefore) {
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }
});

void mock.module('@lib/supabase/admin', () => ({
  createAdminClient: () => !fakesActive
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          if (fn === 'bunkai_rate_limit_consume') {
            if (storeDown) {
              return { data: null, error: { message: 'down' } };
            }
            return { data: consume(args.p_key as string, args.p_windows as never), error: null };
          }
          throw new Error(`unexpected rpc ${fn}`);
        },
      }),
}));

void mock.module('@lib/supabase/server', () => ({
  createClient: async () => !fakesActive
    ? createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => [], setAll: () => {} },
      })
    : ({
        auth: {
          verifyOtp: async ({ email }: { email: string }) => {
            verifyCalls.push(email);
            return upstreamThrottled
              ? { data: { user: null, session: null }, error: { status: 429, message: 'Request rate limit reached' } }
              : { data: { user: null, session: null }, error: { status: 403, message: 'Token has expired or is invalid' } };
          },
        },
      }),
}));

const { POST } = await import('./route');

interface ErrorBody { error?: { code?: string, message?: string, details?: { retry_after_seconds?: number } } }

function confirmRequest(body: unknown, ip = '203.0.113.20'): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('BK-1828 — POST /api/v1/auth/confirm brute-force throttle', () => {
  beforeEach(() => {
    hits.clear();
    storeDown = false;
    upstreamThrottled = false;
    verifyCalls.length = 0;
  });

  it('answers 401 for the first 10 wrong codes on one account, then 429 with Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await POST(confirmRequest({ email: 'pending@x.com', token: '123456' }, `198.51.100.${i}`));
      expect(response.status).toBe(401);
    }
    const refused = await POST(confirmRequest({ email: 'pending@x.com', token: '654321' }, '198.51.100.50'));
    expect(refused.status).toBe(429);
    const retryAfter = Number(refused.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    const body = (await refused.json()) as ErrorBody;
    expect(body.error?.code).toBe('rate_limited');
    expect(body.error?.details?.retry_after_seconds).toBe(retryAfter);
    expect(verifyCalls).toHaveLength(10);
  });

  it('throttles one source across many accounts', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await POST(confirmRequest({ email: `p${i}@x.com`, token: '123456' }));
      expect(response.status).toBe(401);
    }
    const refused = await POST(confirmRequest({ email: 'p10@x.com', token: '123456' }));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).not.toBeNull();
  });

  it('adds a Retry-After hint when the auth provider itself throttles the code check', async () => {
    upstreamThrottled = true;
    const response = await POST(confirmRequest({ email: 'pending@x.com', token: '123456' }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('rate_limited');
    expect(body.error?.details?.retry_after_seconds).toBe(60);
    // The raw provider message is not forwarded.
    expect(body.error?.message).not.toContain('Request rate limit reached');
  });

  it('fails closed with 502 when the store is unreachable', async () => {
    storeDown = true;
    const response = await POST(confirmRequest({ email: 'pending@x.com', token: '123456' }));
    expect(response.status).toBe(502);
    expect(verifyCalls).toHaveLength(0);
  });
});
