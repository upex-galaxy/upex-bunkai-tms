import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-230 — DB-level integration guards for migration
// 0077_billing_upgrade_checkout.sql, mirroring
// lib/billing/billing-overview-isolation.test.ts's fixture shape
// (rpc-authorization.md §5: "a route test that mocks db.rpc proves
// nothing" — a mocked test cannot catch a trigger that never fires, an
// index that was never created, or a GRANT that was never revoked).
//
// Conductor review (PR #208) item 7 — MAJOR: the original version of this
// file guarded every assertion behind `if (!fixture) { return warn(); }`,
// which only console.warns on a missing QA_E2E fixture — so a CI runner
// lacking `QA_E2E_USER_EMAIL`/`QA_E2E_USER_PASSWORD` (but WITH
// `SUPABASE_SERVICE_ROLE_KEY`, which is what gates `describeOrSkip` below)
// reported every one of these guard tests as a PASS while asserting
// NOTHING. Fixed per the repo's own documented convention
// (`lib/atcs/search-isolation.test.ts`'s `requirePrecondition`): `beforeAll`
// now THROWS when the fixture cannot be built, which fails every test in
// this file loudly instead of passing them silently. A TOTAL absence of DB
// env (no `SUPABASE_SERVICE_ROLE_KEY` at all) is still a legitimate
// `describe.skip` — there is no database to test against, full stop.
//
// Four independent guards, four independent test blocks:
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
//      at all", which this proves directly, asserting the SPECIFIC 42501
//      permission-denied code per review item 7 — not just "some error"),
//      idempotency-by-event-id, and — review item 1, the BLOCKER — that a
//      `checkout.session.completed` event carrying `payment_status:
//      'unpaid'` (the delayed-notification-payment-method shape) does NOT
//      flip the plan.

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
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
  if (error) {
    throw new Error(`[checkout-guards-isolation] QA_E2E login failed: ${error.message}`);
  }
  return client;
}

interface Fixture {
  workspaceId: string
  qaUserId: string
}

let fixture: Fixture;

describeOrSkip('BK-230 — billing checkout guards isolation (rpc-authorization.md §5)', () => {
  beforeAll(async () => {
    // Review item 7: a hard throw here fails every `it()` below loudly —
    // no silent pass on a missing precondition. `describeOrSkip` above
    // already handles the ONE legitimate skip case (no DB env at all).
    if (!hasRealLoginEnv) {
      throw new Error('[checkout-guards-isolation] precondition not met — need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD for the real-session assertions. Seed the environment to cover this path.');
    }
    const session = await qaSession();
    const { data: qaUser } = await session.auth.getUser();
    const qaUserId = qaUser.user?.id;
    if (!qaUserId) {
      throw new Error('[checkout-guards-isolation] precondition not met — QA_E2E login returned no user id.');
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
      () => db.from('billing_checkout_sessions').delete().eq('workspace_id', fixture.workspaceId),
      () => db.from('projects').delete().eq('workspace_id', fixture.workspaceId),
      () => db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId),
      () => db.from('workspaces').delete().eq('id', fixture.workspaceId),
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
      const session = await qaSession();

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
      const db = service();
      const { error: upgradeError } = await db
        .from('workspaces')
        .update({ plan: 'cloud' })
        .eq('id', fixture.workspaceId);
      expect(upgradeError).toBeNull();

      const session = await qaSession();
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

    it('a row inserted with NO stripe_checkout_session_id yet (review item 2 — inserted before the Stripe call) is still a valid OPEN row', async () => {
      const db = service();
      const { data, error } = await db
        .from('billing_checkout_sessions')
        .insert({
          workspace_id: fixture.workspaceId,
          created_by_user_id: fixture.qaUserId,
          target_plan: 'cloud',
          seat_quantity: 2,
          stripe_checkout_session_id: null,
          status: 'open',
          idempotency_key: `${PREFIX}-preinsert-key`,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        })
        .select('id, stripe_checkout_session_id')
        .single();
      expect(error).toBeNull();
      expect(data?.stripe_checkout_session_id).toBeNull();

      await db.from('billing_checkout_sessions').update({ status: 'expired' }).eq('workspace_id', fixture.workspaceId).eq('status', 'open');
    });
  });

  describe('3. bunkai_apply_billing_checkout_webhook_event', () => {
    it('an ordinary signed-in session cannot call it at all — asserts the SPECIFIC 42501 permission-denied code (GRANT restricted to service_role)', async () => {
      const session = await qaSession();

      const { error } = await session.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: `${PREFIX}-evt-unauthorized`,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: `${PREFIX}-cs-unauthorized`,
        p_client_reference_id: null,
        p_payment_status: 'paid',
        p_stripe_customer_id: null,
        p_stripe_subscription_id: null,
      });
      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
    });

    it('review item 1 (BLOCKER) — checkout.session.completed with payment_status "unpaid" does NOT flip the plan', async () => {
      const db = service();
      const sessionId = `${PREFIX}-cs-unpaid`;
      const eventId = `${PREFIX}-evt-unpaid`;

      const { error: insertError } = await db.from('billing_checkout_sessions').insert({
        workspace_id: fixture.workspaceId,
        created_by_user_id: fixture.qaUserId,
        target_plan: 'cloud',
        seat_quantity: 4,
        stripe_checkout_session_id: sessionId,
        status: 'open',
        idempotency_key: `${PREFIX}-unpaid-key`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      expect(insertError).toBeNull();

      const result = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: eventId,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: sessionId,
        p_client_reference_id: null,
        p_payment_status: 'unpaid', // the delayed-notification-payment-method shape
        p_stripe_customer_id: null,
        p_stripe_subscription_id: null,
      });
      expect(result.error).toBeNull();
      expect((result.data as { status: string }).status).toBe('awaiting_payment');

      const { data: workspaceAfter } = await db.from('workspaces').select('plan').eq('id', fixture.workspaceId).single();
      expect(workspaceAfter?.plan).toBe('community'); // NOT flipped to cloud

      const { data: rowAfter } = await db.from('billing_checkout_sessions').select('status').eq('stripe_checkout_session_id', sessionId).single();
      expect(rowAfter?.status).toBe('open'); // still open, not completed

      await db.from('billing_checkout_sessions').update({ status: 'expired' }).eq('stripe_checkout_session_id', sessionId);
    });

    it('applies checkout.session.completed exactly once when payment_status is "paid", idempotent on a redelivered event id, and populates purchased_seats + Stripe identifiers', async () => {
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
        p_client_reference_id: null,
        p_payment_status: 'paid',
        p_stripe_customer_id: `${PREFIX}-cus`,
        p_stripe_subscription_id: `${PREFIX}-sub`,
      });
      expect(first.error).toBeNull();
      expect((first.data as { status: string }).status).toBe('applied');

      const { data: workspaceAfter } = await db.from('workspaces').select('plan, purchased_seats').eq('id', fixture.workspaceId).single();
      expect(workspaceAfter?.plan).toBe('cloud');
      expect(workspaceAfter?.purchased_seats).toBe(3);

      const { data: rowAfter } = await db.from('billing_checkout_sessions').select('status, stripe_customer_id, stripe_subscription_id').eq('stripe_checkout_session_id', sessionId).single();
      expect(rowAfter?.status).toBe('completed');
      expect(rowAfter?.stripe_customer_id).toBe(`${PREFIX}-cus`);
      expect(rowAfter?.stripe_subscription_id).toBe(`${PREFIX}-sub`);

      // Stripe redelivers the SAME event id until it sees 2xx — a second
      // delivery must be a pure no-op, never a second plan write. The RPC's
      // terminal-status short-circuit fires FIRST (the row is already
      // 'completed' by now), so the outcome is `already_processed`, not
      // `duplicate` — `duplicate` is reserved for a DIFFERENT event id
      // racing against the SAME still-open row (see the next `it` below).
      // Both outcomes are equally a safe no-op; this assertion is about
      // WHICH branch actually fires, not just "some idempotent result".
      const second = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: eventId,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: sessionId,
        p_client_reference_id: null,
        p_payment_status: 'paid',
        p_stripe_customer_id: `${PREFIX}-cus`,
        p_stripe_subscription_id: `${PREFIX}-sub`,
      });
      expect(second.error).toBeNull();
      expect((second.data as { status: string }).status).toBe('already_processed');

      // Restore 'community' for isolation from any other block/rerun.
      await db.from('workspaces').update({ plan: 'community', purchased_seats: null }).eq('id', fixture.workspaceId);
    });

    it('review item 2 — an event with NO matching row (unknown_session) is NOT recorded as seen: a redelivery still finds a row created afterward', async () => {
      const db = service();
      const sessionId = `${PREFIX}-cs-late`;
      const eventId = `${PREFIX}-evt-late`;

      const first = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: eventId,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: sessionId,
        p_client_reference_id: null,
        p_payment_status: 'paid',
        p_stripe_customer_id: null,
        p_stripe_subscription_id: null,
      });
      expect(first.error).toBeNull();
      expect((first.data as { status: string }).status).toBe('unknown_session');

      // The row now shows up "late" — simulating the narrow window between
      // Stripe's webhook arriving and this app's own row insert committing.
      const { error: insertError } = await db.from('billing_checkout_sessions').insert({
        workspace_id: fixture.workspaceId,
        created_by_user_id: fixture.qaUserId,
        target_plan: 'cloud',
        seat_quantity: 1,
        stripe_checkout_session_id: sessionId,
        status: 'open',
        idempotency_key: `${PREFIX}-late-key`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      expect(insertError).toBeNull();

      // Stripe redelivers the SAME event id (it never got a 2xx the first
      // time) — this MUST be a real second attempt, not `duplicate`.
      const redelivery = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: eventId,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: sessionId,
        p_client_reference_id: null,
        p_payment_status: 'paid',
        p_stripe_customer_id: null,
        p_stripe_subscription_id: null,
      });
      expect(redelivery.error).toBeNull();
      expect((redelivery.data as { status: string }).status).toBe('applied');

      await db.from('workspaces').update({ plan: 'community', purchased_seats: null }).eq('id', fixture.workspaceId);
      await db.from('billing_checkout_sessions').update({ status: 'expired' }).eq('stripe_checkout_session_id', sessionId);
    });

    it('re-review item 1 (NEW MAJOR) — a PAID completed event still applies against a row this app already marked "expired" locally', async () => {
      const db = service();
      const sessionId = `${PREFIX}-cs-locally-expired`;
      const eventId = `${PREFIX}-evt-locally-expired`;

      const { data: insertedRow, error: insertError } = await db.from('billing_checkout_sessions').insert({
        workspace_id: fixture.workspaceId,
        created_by_user_id: fixture.qaUserId,
        target_plan: 'cloud',
        seat_quantity: 7,
        stripe_checkout_session_id: sessionId,
        status: 'open',
        idempotency_key: `${PREFIX}-locally-expired-key`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }).select('id').single();
      expect(insertError).toBeNull();

      // Simulate checkout.ts's reuseOpenCheckoutSession flipping this row to
      // 'expired' WITHOUT ever consulting Stripe (the exact path the review
      // describes: it happens purely from local row age/state).
      const { error: localExpireError } = await db
        .from('billing_checkout_sessions')
        .update({ status: 'expired' })
        .eq('id', insertedRow!.id as string);
      expect(localExpireError).toBeNull();

      // The customer still holds the live Stripe URL from before the local
      // flip and pays. The webhook's paid completed event MUST still apply
      // the upgrade — a silent `already_processed` here is the charged-and-
      // never-upgraded bug this test guards against.
      const result = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
        p_stripe_event_id: eventId,
        p_stripe_event_type: 'checkout.session.completed',
        p_stripe_checkout_session_id: sessionId,
        p_client_reference_id: insertedRow!.id as string,
        p_payment_status: 'paid',
        p_stripe_customer_id: `${PREFIX}-cus-locally-expired`,
        p_stripe_subscription_id: `${PREFIX}-sub-locally-expired`,
      });
      expect(result.error).toBeNull();
      expect((result.data as { status: string }).status).toBe('applied');

      const { data: workspaceAfter } = await db.from('workspaces').select('plan, purchased_seats').eq('id', fixture.workspaceId).single();
      expect(workspaceAfter?.plan).toBe('cloud');
      expect(workspaceAfter?.purchased_seats).toBe(7);

      const { data: rowAfter } = await db.from('billing_checkout_sessions').select('status').eq('id', insertedRow!.id as string).single();
      expect(rowAfter?.status).toBe('completed'); // NOT stuck at 'expired'

      await db.from('workspaces').update({ plan: 'community', purchased_seats: null }).eq('id', fixture.workspaceId);
    });
  });
});
