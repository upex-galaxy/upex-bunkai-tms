import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import { createRun, markRunStep } from './rpc';

// BK-223 — the two RPC wrappers forward the new channel / provenance arguments.
// A fake client records the call; nothing here touches a database.
function fakeClient() {
  const calls: { fn: string, args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('markRunStep', () => {
  it('forwards the session kind as p_via so a bearer re-report gets the conflict rule', async () => {
    const { client, calls } = fakeClient();
    await markRunStep(client as never, { actorUserId: 'u', runId: 'r', stepId: 's', status: 'failed', via: 'bearer' });
    expect(calls[0].fn).toBe('bunkai_mark_run_step');
    expect(calls[0].args.p_via).toBe('bearer');
  });

  it('omits p_via when no session kind is given (last-write-wins stays)', async () => {
    const { client, calls } = fakeClient();
    await markRunStep(client as never, { actorUserId: 'u', runId: 'r', stepId: 's', status: 'passed' });
    expect(calls[0].args.p_via).toBeUndefined();
  });
});

describe('createRun', () => {
  const base = { actorUserId: 'u', testId: 't', environmentId: 'e', executorMode: 'agent' as const, startToken: 'tok' };

  it('forwards the access token id so the run snapshots the token name', async () => {
    const { client, calls } = fakeClient();
    await createRun(client as never, { ...base, tokenId: 'token-1' });
    expect(calls[0].fn).toBe('bunkai_create_run');
    expect(calls[0].args.p_token_id).toBe('token-1');
  });

  it('omits p_token_id for a cookie session', async () => {
    const { client, calls } = fakeClient();
    await createRun(client as never, { ...base, tokenId: null });
    expect(calls[0].args.p_token_id).toBeUndefined();
  });
});
