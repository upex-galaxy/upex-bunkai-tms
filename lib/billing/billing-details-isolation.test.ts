import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-231 - DB-level integration guards for migration
// 0113_billing_details_invoices.sql, against the REAL database
// (rpc-authorization.md section 5: a route test that mocks db.rpc proves
// nothing about a function, a grant or a policy). Same fixture rules as
// checkout-guards-isolation.test.ts: every row carries PREFIX, `beforeAll`
// THROWS when a precondition is missing (no silent pass), and `afterAll` deletes
// everything and then asserts the count is zero.
//
// What it proves, in blocks:
//   1. bunkai_effective_plan - the grace boundary, exact to the instant.
//   2. RLS and privileges on the three new tables - the owner/admin read, the
//      member that reads nothing, and NO write for any signed-in role.
//   3. The webhook RPCs - not callable by a signed-in user, and the state
//      machine itself: grace opens once, the first failure governs, a retry
//      failure never extends it, recovery only from the paid event of the
//      failing invoice, duplicates and stale deliveries are no-ops.
//   4. The effective plan wired into the real consumers: the project-limit
//      trigger (a REAL member session) and the billing overview RPC.
//   5. The BK-230 checkout RPC now creates the billing state row.
// No Stripe account exists for this project: the RPCs receive the exact
// arguments the webhook route would pass, so this is a database proof, not a
// payment proof.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const PREFIX = `bk231-billing-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function qaSession() {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
  if (error) {
    throw new Error(`[billing-details-isolation] QA_E2E login failed: ${error.message}`);
  }
  return client;
}

interface Fixture {
  qaUserId: string
  ownerWs: string // the QA identity is the OWNER
  adminWs: string // the QA identity is an ADMIN
  memberWs: string // the QA identity is only a MEMBER
}

let fixture: Fixture;
let eventCounter = 0;
const eventId = (label: string) => `${PREFIX}-evt-${label}-${(eventCounter += 1)}`;
const CUSTOMER = `${PREFIX}-cus-1`;
const RENEWAL_T0 = '2026-10-01T12:00:00.000Z';

async function makeWorkspace(db: ReturnType<typeof service>, qaUserId: string, suffix: string, role: 'owner' | 'admin' | 'member', plan: string) {
  const { data, error } = await db
    .from('workspaces')
    .insert({ slug: `${PREFIX}-${suffix}`, name: `${PREFIX}-${suffix}`, owner_user_id: qaUserId, plan })
    .select('id')
    .single();
  if (error) { throw error; }
  const { error: memberError } = await db
    .from('workspace_members')
    .insert({ workspace_id: data.id, user_id: qaUserId, role, status: 'active' });
  if (memberError) { throw memberError; }
  return data.id as string;
}

describeOrSkip('BK-231 - billing details, state and grace isolation (migration 0113)', () => {
  beforeAll(async () => {
    if (!hasRealLoginEnv) {
      throw new Error('[billing-details-isolation] precondition not met - need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD for the real-session assertions. Seed the environment to cover this path.');
    }
    const session = await qaSession();
    const { data: qaUser } = await session.auth.getUser();
    const qaUserId = qaUser.user?.id;
    if (!qaUserId) {
      throw new Error('[billing-details-isolation] precondition not met - QA_E2E login returned no user id.');
    }

    const db = service();
    const ownerWs = await makeWorkspace(db, qaUserId, 'owner', 'owner', 'cloud');
    const adminWs = await makeWorkspace(db, qaUserId, 'admin', 'admin', 'cloud');
    const memberWs = await makeWorkspace(db, qaUserId, 'member', 'member', 'cloud');
    fixture = { qaUserId, ownerWs, adminWs, memberWs };

    // The billing state of each fixture workspace, written the way the webhook would.
    for (const [workspaceId, customer] of [[ownerWs, CUSTOMER], [adminWs, `${PREFIX}-cus-2`], [memberWs, `${PREFIX}-cus-3`]] as const) {
      const { error } = await db.from('workspace_billing_state').insert({ workspace_id: workspaceId, stripe_customer_id: customer, stripe_subscription_id: `${PREFIX}-sub` });
      if (error) { throw error; }
      const { error: profileError } = await db.from('workspace_billing_profiles').insert({
        workspace_id: workspaceId,
        company_name: PREFIX,
        billing_email: 'billing@example.test',
        address_line1: 'Calle 1',
        city: 'Madrid',
        postal_code: '28001',
        country: 'ES',
      });
      if (profileError) { throw profileError; }
    }
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    const workspaceIds = [fixture.ownerWs, fixture.adminWs, fixture.memberWs];
    const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ['stripe_webhook_events', () => db.from('stripe_webhook_events').delete().like('id', `${PREFIX}%`)],
      ['billing_checkout_sessions', () => db.from('billing_checkout_sessions').delete().in('workspace_id', workspaceIds)],
      ['activity_log', () => db.from('activity_log').delete().in('workspace_id', workspaceIds)],
      ['projects', () => db.from('projects').delete().in('workspace_id', workspaceIds)],
      ['workspace_members', () => db.from('workspace_members').delete().in('workspace_id', workspaceIds)],
      // workspace_billing_profiles / _state / workspace_grace_periods go with the workspace (ON DELETE CASCADE).
      ['workspaces', () => db.from('workspaces').delete().in('id', workspaceIds)],
    ];
    for (const [table, run] of steps) {
      const { error } = await run();
      if (error) {
        console.error(`[billing-details-isolation] cleanup of "${table}" failed: ${error.message}`);
      }
    }

    // Count zero at the end: nothing this file created may survive.
    const leftovers = await Promise.all([
      db.from('workspaces').select('id', { count: 'exact', head: true }).in('id', workspaceIds),
      db.from('workspace_billing_state').select('workspace_id', { count: 'exact', head: true }).in('workspace_id', workspaceIds),
      db.from('workspace_billing_profiles').select('workspace_id', { count: 'exact', head: true }).in('workspace_id', workspaceIds),
      db.from('workspace_grace_periods').select('workspace_id', { count: 'exact', head: true }).in('workspace_id', workspaceIds),
      db.from('stripe_webhook_events').select('id', { count: 'exact', head: true }).like('id', `${PREFIX}%`),
    ]);
    const counts = leftovers.map(result => result.count);
    if (counts.some(count => count !== 0)) {
      throw new Error(`[billing-details-isolation] fixtures left behind (workspaces, state, profiles, grace, webhook events): ${counts.join(', ')}`);
    }
  });

  describe('1. bunkai_effective_plan', () => {
    const ENDS = '2026-10-15T12:00:00+00:00';
    const call = async (plan: string, ends: string | null, now: string) => {
      const { data, error } = await service().rpc('bunkai_effective_plan', { p_plan: plan, p_grace_ends_at: ends as unknown as string, p_now: now });
      expect(error).toBeNull();
      return data;
    };

    it('keeps the paid plan one second before the grace end', async () => {
      expect(await call('cloud', ENDS, '2026-10-15T11:59:59+00:00')).toBe('cloud');
    });

    it('is Community at the exact grace end instant (2026-11-01 ruling)', async () => {
      expect(await call('cloud', ENDS, ENDS)).toBe('community');
    });

    it('stays Community after the grace end', async () => {
      expect(await call('cloud', ENDS, '2026-10-15T12:00:01+00:00')).toBe('community');
    });

    it('never changes a plan with no grace window, or a plan that is not cloud', async () => {
      expect(await call('cloud', null, '2030-01-01T00:00:00+00:00')).toBe('cloud');
      expect(await call('community', ENDS, '2030-01-01T00:00:00+00:00')).toBe('community');
      expect(await call('enterprise', ENDS, '2030-01-01T00:00:00+00:00')).toBe('enterprise');
    });
  });

  describe('2. RLS and privileges', () => {
    it('lets the OWNER and an ADMIN read the billing profile and state of their workspace', async () => {
      const session = await qaSession();
      for (const workspaceId of [fixture.ownerWs, fixture.adminWs]) {
        const state = await session.from('workspace_billing_state').select('workspace_id').eq('workspace_id', workspaceId);
        const profile = await session.from('workspace_billing_profiles').select('workspace_id').eq('workspace_id', workspaceId);
        expect(state.error).toBeNull();
        expect(state.data).toHaveLength(1);
        expect(profile.error).toBeNull();
        expect(profile.data).toHaveLength(1);
      }
    });

    it('shows a plain MEMBER nothing: no state row, no profile row, no Stripe customer id', async () => {
      const session = await qaSession();
      const state = await session.from('workspace_billing_state').select('*').eq('workspace_id', fixture.memberWs);
      const profile = await session.from('workspace_billing_profiles').select('*').eq('workspace_id', fixture.memberWs);
      expect(state.error).toBeNull();
      expect(state.data).toEqual([]);
      expect(profile.error).toBeNull();
      expect(profile.data).toEqual([]);
    });

    it('lets any active member read the grace window of their workspace (the INVOKER trigger needs it)', async () => {
      const db = service();
      const { error: insertError } = await db.from('workspace_grace_periods').insert({
        workspace_id: fixture.memberWs,
        started_at: '2026-10-01T00:00:00+00:00',
        ends_at: '2026-10-15T00:00:00+00:00',
      });
      expect(insertError).toBeNull();
      const session = await qaSession();
      const { data, error } = await session.from('workspace_grace_periods').select('ends_at').eq('workspace_id', fixture.memberWs);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      await db.from('workspace_grace_periods').delete().eq('workspace_id', fixture.memberWs);
    });

    it('refuses every write to the three tables to a signed-in OWNER (writes are admin-client only)', async () => {
      const session = await qaSession();
      const attempts = [
        session.from('workspace_billing_profiles').update({ company_name: 'tampered' }).eq('workspace_id', fixture.ownerWs).select('workspace_id'),
        session.from('workspace_billing_profiles').delete().eq('workspace_id', fixture.ownerWs).select('workspace_id'),
        session.from('workspace_billing_state').update({ payment_state: 'paid', failed_invoice_id: null }).eq('workspace_id', fixture.ownerWs).select('workspace_id'),
        session.from('workspace_billing_state').insert({ workspace_id: fixture.ownerWs, stripe_customer_id: `${PREFIX}-forged` }),
        session.from('workspace_grace_periods').insert({ workspace_id: fixture.ownerWs, started_at: '2026-10-01T00:00:00+00:00', ends_at: '2026-10-02T00:00:00+00:00' }),
        session.from('workspace_grace_periods').delete().eq('workspace_id', fixture.ownerWs).select('workspace_id'),
      ];
      for (const attempt of await Promise.all(attempts)) {
        expect(attempt.error).not.toBeNull();
        expect(attempt.error!.code).toBe('42501');
      }
      const profile = await service().from('workspace_billing_profiles').select('company_name').eq('workspace_id', fixture.ownerWs).single();
      expect(profile.data?.company_name).toBe(PREFIX);
    });

    it('enforces the table CHECK constraints: malformed email, over-limit company, bad country', async () => {
      const db = service();
      const base = { company_name: 'x', billing_email: 'a@b.co', address_line1: 'l', city: 'c', postal_code: '1', country: 'ES' };
      const cases: Array<Record<string, unknown>> = [
        { ...base, billing_email: 'not-an-email' },
        { ...base, company_name: 'x'.repeat(121) },
        { ...base, country: 'ESP' },
        { ...base, postal_code: 'x'.repeat(21) },
      ];
      for (const patch of cases) {
        const { error } = await db.from('workspace_billing_profiles').update(patch).eq('workspace_id', fixture.ownerWs);
        expect(error).not.toBeNull();
        expect(error!.code).toBe('23514');
      }
      const { error } = await db.from('workspace_billing_profiles').update({ company_name: 'x'.repeat(120) }).eq('workspace_id', fixture.ownerWs);
      expect(error).toBeNull();
      await db.from('workspace_billing_profiles').update({ company_name: PREFIX }).eq('workspace_id', fixture.ownerWs);
    });
  });

  describe('3. webhook RPCs', () => {
    it('are not callable by a signed-in user (42501), the owner included', async () => {
      const session = await qaSession();
      const invoice = await session.rpc('bunkai_apply_billing_invoice_event', {
        p_stripe_event_id: eventId('denied'),
        p_event_type: 'invoice.payment_failed',
        p_event_created: RENEWAL_T0,
        p_stripe_customer_id: CUSTOMER,
        p_stripe_invoice_id: `${PREFIX}-in-denied`,
        p_billing_reason: 'subscription_cycle',
      });
      const method = await session.rpc('bunkai_apply_billing_payment_method', {
        p_stripe_event_id: eventId('denied'),
        p_event_type: 'checkout.session.completed',
        p_event_created: RENEWAL_T0,
        p_stripe_customer_id: CUSTOMER,
        p_brand: 'visa',
        p_last4: '4242',
        p_exp_month: 4,
        p_exp_year: 2030,
        p_replaced: true,
      });
      expect(invoice.error?.code).toBe('42501');
      expect(method.error?.code).toBe('42501');
    });

    const invoiceEvent = (type: string, invoiceId: string, createdAt: string, reason: string, label: string, eventIdOverride?: string, customer: string = CUSTOMER) =>
      service().rpc('bunkai_apply_billing_invoice_event', {
        p_stripe_event_id: eventIdOverride ?? eventId(label),
        p_event_type: type,
        p_event_created: createdAt,
        p_stripe_customer_id: customer,
        p_stripe_invoice_id: invoiceId,
        p_billing_reason: reason,
      });
    const graceOf = (workspaceId: string) => service().from('workspace_grace_periods').select('started_at, ends_at').eq('workspace_id', workspaceId).maybeSingle();
    const stateOf = (workspaceId: string) => service().from('workspace_billing_state').select('*').eq('workspace_id', workspaceId).single();
    const INVOICE = `${PREFIX}-in-renewal`;
    const FIRST_FAILURE_EVENT = eventId('fail-1');

    it('answers unknown_customer for a customer no workspace owns, and records nothing', async () => {
      const id = eventId('unknown');
      const { data, error } = await service().rpc('bunkai_apply_billing_invoice_event', {
        p_stripe_event_id: id,
        p_event_type: 'invoice.paid',
        p_event_created: RENEWAL_T0,
        p_stripe_customer_id: `${PREFIX}-cus-nobody`,
        p_stripe_invoice_id: INVOICE,
        p_billing_reason: 'subscription_cycle',
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: 'unknown_customer' });
      const seen = await service().from('stripe_webhook_events').select('id').eq('id', id);
      expect(seen.data).toEqual([]);
    });

    it('ignores a failed payment that is not a renewal (the first checkout payment)', async () => {
      const { data } = await invoiceEvent('invoice.payment_failed', `${PREFIX}-in-first`, RENEWAL_T0, 'subscription_create', 'first');
      expect(data).toMatchObject({ status: 'ignored' });
      expect((await graceOf(fixture.ownerWs)).data).toBeNull();
    });

    it('opens the 14-day grace window on the first failed renewal (Scenario 4.1)', async () => {
      const { data, error } = await invoiceEvent('invoice.payment_failed', INVOICE, RENEWAL_T0, 'subscription_cycle', 'fail-1', FIRST_FAILURE_EVENT);
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: 'grace_started' });

      const grace = (await graceOf(fixture.ownerWs)).data!;
      expect(new Date(grace.started_at).toISOString()).toBe(RENEWAL_T0);
      // 14 x 24 hours from the first failure, to the millisecond (UTC).
      expect(new Date(grace.ends_at).getTime() - new Date(grace.started_at).getTime()).toBe(14 * 24 * 60 * 60 * 1000);

      const state = (await stateOf(fixture.ownerWs)).data!;
      expect(state.payment_state).toBe('payment_failed');
      expect(state.failed_invoice_id).toBe(INVOICE);

      const log = await service().from('activity_log').select('action').eq('workspace_id', fixture.ownerWs).eq('action', 'workspace.payment_failed');
      expect(log.data).toHaveLength(1);
    });

    it('treats a redelivered event as a duplicate and a later failure as a continuation that never extends the window (Scenario 4.5)', async () => {
      const before = (await graceOf(fixture.ownerWs)).data!;

      const duplicate = await invoiceEvent('invoice.payment_failed', INVOICE, RENEWAL_T0, 'subscription_cycle', 'fail-1', FIRST_FAILURE_EVENT);
      expect(duplicate.data).toMatchObject({ status: 'duplicate' });

      const later = await invoiceEvent('invoice.payment_failed', INVOICE, '2026-10-05T12:00:00.000Z', 'subscription_cycle', 'fail-2');
      expect(later.data).toMatchObject({ status: 'grace_continued' });
      const after = (await graceOf(fixture.ownerWs)).data!;
      expect(after).toEqual(before);
      expect((await stateOf(fixture.ownerWs)).data!.payment_state).toBe('payment_failed');
    });

    it('records the replaced payment method and stamps the replacement time (Scenario 2.2)', async () => {
      const { data, error } = await service().rpc('bunkai_apply_billing_payment_method', {
        p_stripe_event_id: eventId('pm'),
        p_event_type: 'checkout.session.completed',
        p_event_created: '2026-10-03T09:00:00.000Z',
        p_stripe_customer_id: CUSTOMER,
        p_brand: 'visa',
        p_last4: '8814',
        p_exp_month: 9,
        p_exp_year: 2030,
        p_replaced: true,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: 'applied' });
      const state = (await stateOf(fixture.ownerWs)).data!;
      expect(state).toMatchObject({ payment_method_brand: 'visa', payment_method_last4: '8814', payment_method_exp_month: 9 });
      expect(new Date(state.payment_method_updated_at).toISOString()).toBe('2026-10-03T09:00:00.000Z');
    });

    it('rejects a payment-method summary that is not four digits (never a full card number)', async () => {
      const { error } = await service().rpc('bunkai_apply_billing_payment_method', {
        p_stripe_event_id: eventId('pm-bad'),
        p_event_type: 'checkout.session.completed',
        p_event_created: '2026-10-03T10:00:00.000Z',
        p_stripe_customer_id: CUSTOMER,
        p_brand: 'visa',
        p_last4: '4242424242424242',
        p_exp_month: 9,
        p_exp_year: 2030,
        p_replaced: true,
      });
      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });

    it('does not recover on the paid event of a DIFFERENT invoice', async () => {
      const { data } = await invoiceEvent('invoice.paid', `${PREFIX}-in-other`, '2026-10-04T00:00:00.000Z', 'subscription_cycle', 'paid-other');
      expect(data).toMatchObject({ status: 'ignored' });
      expect((await stateOf(fixture.ownerWs)).data!.payment_state).toBe('payment_failed');
      expect((await graceOf(fixture.ownerWs)).data).not.toBeNull();
    });

    it('recovers only from the paid event of the failing invoice and clears the grace window (Scenario 4.4)', async () => {
      const { data } = await invoiceEvent('invoice.paid', INVOICE, '2026-10-06T00:00:00.000Z', 'subscription_cycle', 'paid');
      expect(data).toMatchObject({ status: 'recovered' });
      const state = (await stateOf(fixture.ownerWs)).data!;
      expect(state.payment_state).toBe('recovered');
      expect(state.failed_invoice_id).toBeNull();
      expect((await graceOf(fixture.ownerWs)).data).toBeNull();
    });

    it('ignores a failure delivered late, created before the recovery already recorded (out of order)', async () => {
      const { data } = await invoiceEvent('invoice.payment_failed', INVOICE, '2026-10-05T18:00:00.000Z', 'subscription_cycle', 'fail-late');
      expect(data).toMatchObject({ status: 'stale' });
      expect((await stateOf(fixture.ownerWs)).data!.payment_state).toBe('recovered');
      expect((await graceOf(fixture.ownerWs)).data).toBeNull();
    });

    it('opens a NEW window when a later renewal fails after the recovery', async () => {
      const { data } = await invoiceEvent('invoice.payment_failed', `${PREFIX}-in-next`, '2026-11-01T12:00:00.000Z', 'subscription_cycle', 'fail-next');
      expect(data).toMatchObject({ status: 'grace_started' });
      expect(new Date((await graceOf(fixture.ownerWs)).data!.started_at).toISOString()).toBe('2026-11-01T12:00:00.000Z');
    });
    it('ignores a payment method replacement older than the one recorded, and a summary refresh never overwrites it (out of order)', async () => {
      const db = service();
      const older = await db.rpc('bunkai_apply_billing_payment_method', {
        p_stripe_event_id: eventId('pm-older'),
        p_event_type: 'checkout.session.completed',
        p_event_created: '2026-10-02T09:00:00.000Z',
        p_stripe_customer_id: CUSTOMER,
        p_brand: 'amex',
        p_last4: '0005',
        p_exp_month: 1,
        p_exp_year: 2031,
        p_replaced: true,
      });
      expect(older.data).toMatchObject({ status: 'stale' });

      const refresh = await db.rpc('bunkai_apply_billing_payment_method', {
        p_stripe_event_id: null as unknown as string,
        p_event_type: 'payment_method.refresh',
        p_event_created: new Date().toISOString(),
        p_stripe_customer_id: CUSTOMER,
        p_brand: 'mastercard',
        p_last4: '9999',
        p_exp_month: 2,
        p_exp_year: 2032,
        p_replaced: false,
      });
      expect(refresh.error).toBeNull();
      const state = (await stateOf(fixture.ownerWs)).data!;
      expect(state).toMatchObject({ payment_method_brand: 'visa', payment_method_last4: '8814' });
    });

    it('never opens a grace window for an invoice whose paid event was already seen (failure delivered after the payment)', async () => {
      const other = `${PREFIX}-cus-2`;
      const invoiceId = `${PREFIX}-in-ooo`;
      const paid = await invoiceEvent('invoice.paid', invoiceId, '2026-10-10T10:00:00.000Z', 'subscription_cycle', 'ooo-paid', undefined, other);
      expect(paid.data).toMatchObject({ status: 'ignored' });

      const failedLate = await invoiceEvent('invoice.payment_failed', invoiceId, '2026-10-10T09:00:00.000Z', 'subscription_cycle', 'ooo-fail', undefined, other);
      expect(failedLate.data).toMatchObject({ status: 'stale' });
      expect((await stateOf(fixture.adminWs)).data!.payment_state).toBe('paid');
      expect((await graceOf(fixture.adminWs)).data).toBeNull();
    });

    it('writes nothing about cards or invoices into the activity log, which every member can read', async () => {
      const rows = await service().from('activity_log').select('action, payload').eq('workspace_id', fixture.ownerWs).like('action', 'workspace.payment%');
      expect(rows.data!.length).toBeGreaterThan(0);
      for (const row of rows.data!) {
        const text = JSON.stringify(row.payload);
        expect(text).not.toContain('last4');
        expect(text).not.toContain('brand');
        expect(text).not.toContain(PREFIX);
      }
    });
  });

  describe('4. the effective plan in the real consumers', () => {
    async function setGrace(workspaceId: string, endsInMs: number | null) {
      const db = service();
      await db.from('workspace_grace_periods').delete().eq('workspace_id', workspaceId);
      if (endsInMs !== null) {
        const now = Date.now();
        const { error } = await db.from('workspace_grace_periods').insert({
          workspace_id: workspaceId,
          started_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
          ends_at: new Date(now + endsInMs).toISOString(),
        });
        expect(error).toBeNull();
      }
    }

    it('a Cloud workspace inside its grace window keeps the 50-project cap, as a REAL member session (Scenario 4.2)', async () => {
      await setGrace(fixture.adminWs, 60 * 60 * 1000);
      const session = await qaSession();
      for (const suffix of ['a', 'b', 'c', 'd']) {
        const { error } = await session.from('projects').insert({ workspace_id: fixture.adminWs, slug: `${PREFIX}-p-${suffix}`, name: `${PREFIX} ${suffix}` });
        expect(error).toBeNull();
      }
    });

    it('the same workspace is held to the Community cap of 3 once the grace window ended (Scenario 4.3)', async () => {
      await setGrace(fixture.adminWs, -1000);
      const session = await qaSession();
      const { error } = await session.from('projects').insert({ workspace_id: fixture.adminWs, slug: `${PREFIX}-p-e`, name: `${PREFIX} e` });
      expect(error).not.toBeNull();
      expect(error!.code).toBe('45700');
      // Nothing was deleted: the four earlier projects are still there and readable.
      const { data } = await session.from('projects').select('id').eq('workspace_id', fixture.adminWs);
      expect(data).toHaveLength(4);
    });

    it('the overview RPC reports the effective plan, the stored plan, the grace end and the unpaid renewal', async () => {
      await setGrace(fixture.ownerWs, -1000);
      const session = await qaSession();
      const { data, error } = await session.rpc('bunkai_workspace_billing_overview', { p_workspace_id: fixture.ownerWs });
      expect(error).toBeNull();
      const overview = data as Record<string, unknown>;
      expect(overview).toMatchObject({ plan: 'community', stored_plan: 'cloud', payment_overdue: true });
      expect(typeof overview.grace_ends_at).toBe('string');
    });

    it('the overview RPC reads Cloud again once the grace window is cleared (recovery)', async () => {
      await setGrace(fixture.ownerWs, null);
      const session = await qaSession();
      const { data } = await session.rpc('bunkai_workspace_billing_overview', { p_workspace_id: fixture.ownerWs });
      expect(data).toMatchObject({ plan: 'cloud', stored_plan: 'cloud', grace_ends_at: null });
    });

    it('still answers null (the route\'s uniform 404) to a plain member', async () => {
      const session = await qaSession();
      const { data, error } = await session.rpc('bunkai_workspace_billing_overview', { p_workspace_id: fixture.memberWs });
      expect(error).toBeNull();
      expect(data).toBeNull();
    });
  });

  describe('5. the BK-230 checkout RPC creates the billing state row', () => {
    it('upserts the Stripe customer and subscription in the same transaction as the plan change', async () => {
      const db = service();
      const { data: workspace, error: workspaceError } = await db.from('workspaces').insert({ slug: `${PREFIX}-ck`, name: `${PREFIX}-ck`, owner_user_id: fixture.qaUserId, plan: 'community' }).select('id').single();
      expect(workspaceError).toBeNull();
      const workspaceId = workspace!.id as string;
      try {
        await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: fixture.qaUserId, role: 'owner', status: 'active' });
        const { data: row, error: rowError } = await db.from('billing_checkout_sessions').insert({
          workspace_id: workspaceId,
          created_by_user_id: fixture.qaUserId,
          target_plan: 'cloud',
          seat_quantity: 3,
          status: 'open',
          idempotency_key: `${PREFIX}-ck-key`,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }).select('id').single();
        expect(rowError).toBeNull();

        const { data, error } = await db.rpc('bunkai_apply_billing_checkout_webhook_event', {
          p_stripe_event_id: eventId('ck'),
          p_stripe_event_type: 'checkout.session.completed',
          p_stripe_checkout_session_id: `${PREFIX}-cs`,
          p_client_reference_id: row!.id,
          p_payment_status: 'paid',
          p_stripe_customer_id: `${PREFIX}-cus-ck`,
          p_stripe_subscription_id: `${PREFIX}-sub-ck`,
        });
        expect(error).toBeNull();
        expect(data).toMatchObject({ status: 'applied', plan: 'cloud' });

        const state = await db.from('workspace_billing_state').select('stripe_customer_id, stripe_subscription_id, payment_state').eq('workspace_id', workspaceId).single();
        expect(state.data).toEqual({ stripe_customer_id: `${PREFIX}-cus-ck`, stripe_subscription_id: `${PREFIX}-sub-ck`, payment_state: 'paid' });
      }
      finally {
        // This extra workspace is not in the shared fixture, so it cleans itself.
        await db.from('billing_checkout_sessions').delete().eq('workspace_id', workspaceId);
        await db.from('activity_log').delete().eq('workspace_id', workspaceId);
        await db.from('workspace_members').delete().eq('workspace_id', workspaceId);
        await db.from('workspaces').delete().eq('id', workspaceId);
      }
    });
  });
});
