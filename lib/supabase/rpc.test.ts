import { abortRun, commitRunStepAttachment, expirePendingRunStepAttachments, finishRun, initRunStepAttachment, removeRunStepAttachment } from '@lib/supabase/rpc';
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

// BK-593 - the attachment wrappers carry NO identity parameter (the actor is auth.uid() inside
// the SECURITY DEFINER function); this seam proves nothing identity-shaped is ever forwarded.
describe('run step attachment wrappers', () => {
  it('init forwards the five arguments and no actor', async () => {
    const { client, calls } = fakeClient();
    await initRunStepAttachment(client as never, { runId: 'r1', stepId: 's1', filename: 'a.png', contentType: 'image/png', byteSize: 10 });
    expect(calls[0]).toEqual({
      fn: 'bunkai_init_run_step_attachment',
      args: { p_run_id: 'r1', p_run_step_id: 's1', p_filename: 'a.png', p_content_type: 'image/png', p_byte_size: 10 },
    });
  });

  it('commit forwards the attachment id and the size read from Storage', async () => {
    const { client, calls } = fakeClient();
    await commitRunStepAttachment(client as never, { attachmentId: 'a1', byteSize: 4321 });
    expect(calls[0]).toEqual({ fn: 'bunkai_commit_run_step_attachment', args: { p_attachment_id: 'a1', p_byte_size: 4321 } });
  });

  it('remove forwards only the attachment id', async () => {
    const { client, calls } = fakeClient();
    await removeRunStepAttachment(client as never, { attachmentId: 'a1' });
    expect(calls[0]).toEqual({ fn: 'bunkai_remove_run_step_attachment', args: { p_attachment_id: 'a1' } });
  });

  it('expire defaults the batch size to 500', async () => {
    const { client, calls } = fakeClient();
    await expirePendingRunStepAttachments(client as never);
    await expirePendingRunStepAttachments(client as never, { limit: 5 });
    expect(calls.map(c => c.args.p_limit)).toEqual([500, 5]);
  });
});
