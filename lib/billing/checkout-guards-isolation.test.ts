import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-230 — DB-level integration guards for migration
// 0077_billing_upgrade_checkout.sql, mirroring
// lib/billing/billing-overview-isolation.test.ts's fixture shape
// (rpc-authorization.md §5: "a route test that mocks db.rpc proves
// nothing" — a mocked test cannot catch a trigger that never fires, an
// index that was never created, or a GRANT that was never revoked).
//
// Three independent guards, three independent test blocks:
//   1. bunkai_enforce_project_limit_trigger — the Free-plan project cap
//      (Q2, 2026-08-17 ratification). Exercised as a REAL authenticated
//      session (QA_E2E), never service_role — the trigger is
//      SECURITY INVOKER precisely so it rides the caller's own RLS, and a
//      service-role insert would bypass RLS entirely, proving nothing about
//      what a real member can and cannot do.
//   2. billing_checkout_sessions_one_open_per_workspace — the E1 double-tab
//      guard. A plain partial-unique-index race, no auth boundary to prove,
//      so this block uses service_role directly (matches the precedent
//      file's own admin-client-only checks for non-auth-boundary facts).
//   3. bunkai_apply_billing_checkout_webhook_event — GRANT-restricted to
//      service_role only (no caller-supplied actor parameter to spoof, so
//      the rpc-authorization.md actor-bind checklist does not apply here;
//      the risk shape is instead "can an ordinary signed-in user call this
//      at all", which this proves directly), plus idempotency-by-event-id.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const PREFIX = `bk230-checkout-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function qaSession() {
  if (!hasRealLoginEnv) { return null; }
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
  return error ? null : client;
}

interface Fixture {
  workspaceId: string
  qaUserId: string
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-230 — billing checkout guards isolation (rpc-authorization.md §5)', () => {
  beforeAll(async () => {
    if (!hasRealLoginEnv) {
      skipReason = 'need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD for the real-session assertions.';
      return;
    }
    const session = await qaSession();
    if (!session) {
      skipReason = 'QA_E2E login failed.';
      return;
    }
    const { data: qaUser } = await session.auth.getUser();
    const qaUserId = qaUser.user?.id;
    if (!qaUserId) {
      skipReason = 'QA_E2E login returned no user id.';
      return;
    }

    const db = service();
    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: qaUserId, plan: 'community' })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    const { error: memberError } = await db
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'owner', status: 'active' });
    if (memberError) { throw memberError; }

    fixture = { workspaceId, qaUserId };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    const cleanups = [
      () => db.from('billing_checkout_sessions').delete().eq('workspace_id', fixture!.workspaceId),
      () => db.from('projects').delete().eq('workspace_id', fixture!.workspaceId),
      () => db.from('workspace_members').delete().eq('workspace_id', fixture!.workspaceId),
      () => db.from('workspaces').delete().eq('id', fixture!.workspaceId),
    ];
    const tables = ['billing_checkout_sessions', 'projects', 'workspace_members', 'workspaces'];
    for (const [i, cleanup] of cleanups.entries()) {
      const { error } = await cleanup();
      if (error) {
        console.error(`[checkout-guards-isolation] cleanup of "${tables[i]}" failed for workspace ${fixture.workspaceId}: ${error.message}`);
      }
    }
  });

  describe('1. bunkai_enforce_project_limit_trigger', () => {
    it('blocks the 4th project on a Community-plan (3-project cap) workspace, as a REAL member session', async () => {
      if (!fixture) { return warn(); }
      const session = await qaSession();
      if (!session) { return warn(); }

      for (const suffix of ['a', 'b', 'c']) {
        const { error } = await session
          .from('projects')
          .insert({ workspace_id: fixture.workspaceId, slug: `${PREFIX}-${suffix}`, name: `${PREFIX} ${suffix}` });
        expect(error).toBeNull();
      }

      const { error: fourthError } = await session
        .from('projects')
        .insert({ workspace_id: fixture.workspaceId, slug: `${PREFIX}-d`, name: `${PREFIX} d` });
      expect(fourthError).not.toBeNull();
      expect(fourthError!.code).toBe('45700');
    });

    it('lifts the cap once the workspace is on Cloud (50-project limit)', async () => {
      if (!fixture) { return warn(); }
      const db = service();
      const { error: upgradeError } = await db
        .from('workspaces')
        .update({ plan: 'cloud' })
        .eq('id', fixture.workspaceId);
      expect(upgradeError).toBeNull();

      const session = await qaSession();
      if (!session) { return warn(); }
      const { error } = await session
        .from('projects')
        .insert({ workspace_id: fixture.workspaceId, slug: `${PREFIX}-e`, name: `${PREFIX} e` });
      expect(error).toBeNull();

      // Restore 'community' so any later ordering/reruns start from the same
      // documented premise as the first test in this block.
      await db.from('workspaces').update({ plan: 'community' }).eq('id', fixture.workspaceId);
    });
  });

  describe('2. billing_checkout_sessions_one_open_per_workspace', () => {
    it('a second OPEN row for the same workspace loses the unique-index race (23505)', async () => {
      if (!fixture) { return warn(); }
      const db = service();
      const base = {
        workspace_id: fixture.workspaceId,
        created_by_user_id: fixture.qaUserId,
        target_plan: 'cloud',
        seat_quantity: 1,
        status: 'open',
        idempotency_key: `${PREFIX}-key`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };

      const { error: firstError } = await db
        .from('billing_checkout_sessions')
        .insert({ ...base, stripe_checkout_session_id: `${PREFIX}-cs-1` });
      expect(firstError).toBeNull();

      const { error: secondError } = await db
        .from('billing_checkout_sessions')
        .insert({ ...base, stripe_checkout_session_id: `${PREFIX}-cs-2` });
      expect(secondError).not.toBeNull();
      expect(secondError!.code).toBe('23505');

      // Release the lock so block 3's fixtures do not collide with it.
      await db.from('billing_checkout_sessions').update({ status: 'expired' }).eq('workspace_id', fixture.workspaceId).eq('status', 'open');
    });
  });

  describe('3. bunkai_apply_billing_checkout_webhook_event', () => {
    it('an ordinary signed-in session cannot call it at all (GRANT restricted to service_role)', async () => {
      if (!fixture) { return warn(); }
      const session = await qaSession();
      if (!session) { return warn(); }

      const { error } = await session.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: `${PREFIX}-evt-unauthorized`,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: `${PREFIX}-cs-unauthorized`,
      });
      expect(error).not.toBeNull();
    });

    it('applies checkout.session.completed exactly once, idempotent on a redelivered event id', async () => {
      if (!fixture) { return warn(); }
      const db = service();
      const sessionId = `${PREFIX}-cs-webhook`;
      const eventId = `${PREFIX}-evt-completed`;

      const { error: insertError } = await db.from('billing_checkout_sessions').insert({
        workspace_id: fixture.workspaceId,
        created_by_user_id: fixture.qaUserId,
        target_plan: 'cloud',
        seat_quantity: 3,
        stripe_checkout_session_id: sessionId,
        status: 'open',
        idempotency_key: `${PREFIX}-webhook-key`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      expect(insertError).toBeNull();

      const first = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: eventId,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: sessionId,
      });
      expect(first.error).toBeNull();
      expect((first.data as { status: string }).status).toBe('applied');

      const { data: workspaceAfter } = await db.from('workspaces').select('plan').eq('id', fixture.workspaceId).single();
      expect(workspaceAfter?.plan).toBe('cloud');

      const { data: rowAfter } = await db.from('billing_checkout_sessions').select('status').eq('stripe_checkout_session_id', sessionId).single();
      expect(rowAfter?.status).toBe('completed');

      // Stripe redelivers the SAME event id until it sees 2xx — a second
      // delivery must be a pure no-op, never a second plan write.
      const second = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: eventId,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: sessionId,
      });
      expect(second.error).toBeNull();
      expect((second.data as { status: string }).status).toBe('duplicate');

      // Restore 'community' for isolation from any other block/rerun.
      await db.from('workspaces').update({ plan: 'community' }).eq('id', fixture.workspaceId);
    });
  });
});

function warn() {
  console.warn(`[checkout-guards-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
