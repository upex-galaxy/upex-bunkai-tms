import { abortRun, finishRun } from '@lib/supabase/rpc';
import { describe, expect, it } from 'bun:test';

// BK-211/12198 — a narrow unit seam for the one thing genuinely new here:
// `finishRun`/`abortRun` must forward `via` as `p_via`, and must land on
// `null` (not `undefined`) when the caller omits it, so the RPC's own
// `p_via text default null` resolves it explicitly rather than depending on
// PostgREST's undefined-key handling. This is the exact wiring
// `app/api/v1/runs/[id]/finish/route.ts` / `.../abort/route.ts` rely on when
// they pass `principal.via` through — a DB-integration suite
// (`lib/notifications/run-event-trigger-isolation.test.ts`) proves the
// RPC/trigger side against a real database; this proves the TS call-shape
// seam without one.

interface Call { fn: string, args: Record<string, unknown> }

function fakeClient() {
  const calls: Call[] = [];
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

describe('finishRun', () => {
  it('forwards via as p_via when provided', async () => {
    const { client, calls } = fakeClient();
    await finishRun(client as never, { actorUserId: 'u1', runId: 'r1', verdict: 'passed', via: 'cookie' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: 'bunkai_finish_run',
      args: { p_actor_user_id: 'u1', p_run_id: 'r1', p_verdict: 'passed', p_via: 'cookie' },
    });
  });

  it('defaults p_via to null (not undefined) when via is omitted', async () => {
    const { client, calls } = fakeClient();
    await finishRun(client as never, { actorUserId: 'u1', runId: 'r1', verdict: 'failed' });
    expect(calls[0].args.p_via).toBeNull();
  });
});

describe('abortRun', () => {
  it('forwards via as p_via when provided', async () => {
    const { client, calls } = fakeClient();
    await abortRun(client as never, { actorUserId: 'u1', runId: 'r1', reason: 'Wrong build deployed', via: 'bearer' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: 'bunkai_abort_run',
      args: { p_actor_user_id: 'u1', p_run_id: 'r1', p_reason: 'Wrong build deployed', p_via: 'bearer' },
    });
  });

  it('defaults p_via to null (not undefined) when via is omitted', async () => {
    const { client, calls } = fakeClient();
    await abortRun(client as never, { actorUserId: 'u1', runId: 'r1', reason: 'Wrong build deployed' });
    expect(calls[0].args.p_via).toBeNull();
  });
});
