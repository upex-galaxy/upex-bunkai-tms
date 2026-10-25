import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'bun:test';

// BK-743 — DB-integration test of `bunkai_rate_limit_consume` (service role
// only; no session or identity involved). Proves the SQL contract the route
// relies on: window boundary, retry hint, rolling semantics, and atomicity
// under a concurrent race. Skips loudly when env is absent.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeOrSkip = url && serviceKey ? describe : describe.skip;

const KEY = `source:bk743-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}:check-email`;
const WINDOWS = [{ window_seconds: 60, max: 10 }, { window_seconds: 3600, max: 60 }];

function db() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
async function consume(key: string, windows = WINDOWS) {
  const { data, error } = await db().rpc('bunkai_rate_limit_consume' as never, { p_key: key, p_windows: windows } as never);
  if (error) {
    throw new Error(error.message);
  }
  return data as unknown as { allowed: boolean, retry_after_seconds?: number };
}

describeOrSkip('BK-743 — bunkai_rate_limit_consume', () => {
  afterAll(async () => {
    await db().from('rate_limit_hits' as never).delete().like('key', 'source:bk743-test-%');
  });

  it('allows 10, refuses the 11th with a wait hint <= 60s', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await consume(KEY)).allowed).toBe(true);
    }
    const r = await consume(KEY);
    expect(r.allowed).toBe(false);
    expect(r.retry_after_seconds).toBeGreaterThan(0);
    expect(r.retry_after_seconds).toBeLessThanOrEqual(60);
  });

  it('keeps keys independent', async () => {
    expect((await consume(`${KEY}-other`)).allowed).toBe(true);
  });

  it('never exceeds the budget under a concurrent race', async () => {
    const key = `${KEY}-race`;
    const results = await Promise.all(Array.from({ length: 15 }, async () => consume(key)));
    expect(results.filter(r => r.allowed).length).toBe(10);
  });

  it('refuses the 61st in the hour window when the minute window is clear', async () => {
    const key = `${KEY}-hour`;
    const old = Array.from({ length: 60 }, (_, i) => ({
      key,
      hit_at: new Date(Date.now() - 120_000 - i * 50_000).toISOString(),
    }));
    const { error } = await db().from('rate_limit_hits' as never).insert(old as never);
    expect(error).toBeNull();
    const r = await consume(key);
    expect(r.allowed).toBe(false);
    expect(r.retry_after_seconds).toBeGreaterThan(60);
  });

  it('rejects a malformed window list', async () => {
    let failed = false;
    try {
      await consume(KEY, []);
    }
    catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
