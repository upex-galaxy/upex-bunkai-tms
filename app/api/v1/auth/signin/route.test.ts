import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-1828 — brute-force throttle on password sign-in (AC8). The REAL route
// handler, limiter and error envelope run; the rate-limit store RPC and the
// Supabase sign-in call are in-memory fakes (the SQL is covered by
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
const signInCalls: string[] = [];

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
          signInWithPassword: async ({ email }: { email: string }) => {
            signInCalls.push(email);
            return { data: { user: null, session: null }, error: { status: 400, message: 'Invalid login credentials' } };
          },
        },
      }),
}));

const { POST } = await import('./route');

interface ErrorBody { error?: { code?: string, details?: { retry_after_seconds?: number } } }

function signinRequest(body: unknown, ip = '203.0.113.10'): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('BK-1828 — POST /api/v1/auth/signin brute-force throttle', () => {
  beforeEach(() => {
    hits.clear();
    storeDown = false;
    signInCalls.length = 0;
  });

  it('answers 401 for the first 10 wrong passwords from one source, then 429 with Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await POST(signinRequest({ email: `victim${i}@x.com`, password: 'wrong-password' }));
      expect(response.status).toBe(401);
    }
    const refused = await POST(signinRequest({ email: 'victim10@x.com', password: 'wrong-password' }));
    expect(refused.status).toBe(429);
    const retryAfter = Number(refused.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    const body = (await refused.json()) as ErrorBody;
    expect(body.error?.code).toBe('rate_limited');
    expect(body.error?.details?.retry_after_seconds).toBe(retryAfter);
    // The refused attempt never reached the password check.
    expect(signInCalls).toHaveLength(10);
  });

  it('throttles one account even when every attempt comes from a different source', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await POST(signinRequest({ email: 'Target@X.com', password: 'wrong-password' }, `198.51.100.${i}`));
      expect(response.status).toBe(401);
    }
    // Case and surrounding spaces do not open a fresh budget.
    const refused = await POST(signinRequest({ email: 'target@x.com', password: 'wrong-password' }, '198.51.100.99'));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).not.toBeNull();
    // Another account from another source is unaffected.
    const other = await POST(signinRequest({ email: 'other@x.com', password: 'wrong-password' }, '198.51.100.100'));
    expect(other.status).toBe(401);
  });

  it('spends the source budget on malformed bodies too', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await POST(signinRequest('{not json'));
      expect(response.status).toBe(400);
    }
    const refused = await POST(signinRequest({ email: 'a@x.com', password: 'wrong-password' }));
    expect(refused.status).toBe(429);
    expect(signInCalls).toHaveLength(0);
  });

  it('never stores the raw address or email in a rate-limit key', async () => {
    await POST(signinRequest({ email: 'secret.person@x.com', password: 'wrong-password' }));
    const keys = [...hits.keys()];
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).not.toContain('secret.person');
      expect(key).not.toContain('203.0.113.10');
    }
    expect(keys.some(k => k.startsWith('source:') && k.endsWith(':signin'))).toBe(true);
    expect(keys.some(k => k.startsWith('account:') && k.endsWith(':signin'))).toBe(true);
  });

  it('fails closed with 502 when the store is unreachable', async () => {
    storeDown = true;
    const response = await POST(signinRequest({ email: 'a@x.com', password: 'wrong-password' }));
    expect(response.status).toBe(502);
    expect(signInCalls).toHaveLength(0);
  });

  it('refuses workspace:admin with 403 BEFORE the password is checked, so no session is created (BK-1832)', async () => {
    const response = await POST(signinRequest({ email: 'a@x.com', password: 'whatever-password', pat_scopes: ['workspace:admin'] }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('forbidden');
    expect(signInCalls).toHaveLength(0);
  });
});
