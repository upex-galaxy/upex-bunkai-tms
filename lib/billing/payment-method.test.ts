import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { CUSTOMER_ID, fakeSupabase, ownerRpc, rejection, stateRow, USER_ID, WORKSPACE_ID } from './test-doubles';

// BK-231 — replacing the payment method through Stripe's hosted setup page
// (Scenarios 2.1-2.3). Stripe is a double: nothing here proves a real card flow,
// it proves what this app sends and records.

void mock.module('server-only', () => ({}));

const stripeModule = await import('@lib/billing/stripe');
const adminModule = await import('@lib/supabase/admin');
const { applySetupSessionCompleted, beginPaymentMethodUpdate, refreshPaymentMethodSummary, summarizeCard } = await import('./payment-method');

const CARD = { id: 'pm_new_8814', card: { brand: 'visa', last4: '8814', exp_month: 9, exp_year: 2029 } };

let sessionsCreate: Mock<(params: Record<string, unknown>, options: { idempotencyKey: string }) => Promise<unknown>>;
let setupIntentsRetrieve: Mock<(id: string, params: unknown) => Promise<unknown>>;
let customersUpdate: Mock<(id: string, params: Record<string, unknown>) => Promise<unknown>>;
let customersRetrieve: Mock<(id: string, params: unknown) => Promise<unknown>>;
let subscriptionsUpdate: Mock<(id: string, params: Record<string, unknown>) => Promise<unknown>>;
let subscriptionsRetrieve: Mock<(id: string, params: unknown) => Promise<unknown>>;
let spies: Array<{ mockRestore: () => void }>;

function setup(state: unknown = stateRow(), isOwner = true) {
  const admin = fakeSupabase(call => (call.table === 'workspace_billing_state' ? { data: state, error: null } : undefined));
  spies = [
    spyOn(adminModule, 'createAdminClient').mockReturnValue(admin.client as never),
    spyOn(stripeModule, 'getStripeClient').mockReturnValue({
      checkout: { sessions: { create: sessionsCreate } },
      setupIntents: { retrieve: setupIntentsRetrieve },
      customers: { update: customersUpdate, retrieve: customersRetrieve },
      subscriptions: { update: subscriptionsUpdate, retrieve: subscriptionsRetrieve },
    } as never),
  ];
  return { admin, caller: fakeSupabase(() => undefined, ownerRpc(isOwner)) };
}

beforeEach(() => {
  sessionsCreate = mock(async () => ({ id: 'cs_setup_1', url: 'https://checkout.stripe.com/c/pay/cs_setup_1' }));
  setupIntentsRetrieve = mock(async () => ({ id: 'seti_1', payment_method: CARD }));
  customersUpdate = mock(async () => ({}));
  customersRetrieve = mock(async () => ({ id: CUSTOMER_ID, invoice_settings: { default_payment_method: { id: 'pm_old', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028 } } } }));
  subscriptionsUpdate = mock(async () => ({}));
  subscriptionsRetrieve = mock(async () => ({ default_payment_method: null }));
  spies = [];
});
afterEach(() => { spies.forEach(spy => spy.mockRestore()); });

describe('summarizeCard', () => {
  test('keeps only brand, last four and expiry', () => {
    expect(summarizeCard(CARD as never)).toEqual({ brand: 'visa', last4: '8814', exp_month: 9, exp_year: 2029 });
  });

  test('returns null for a method with no card details', () => {
    expect(summarizeCard({ id: 'pm_x' } as never)).toBeNull();
    expect(summarizeCard(null)).toBeNull();
  });
});

describe('beginPaymentMethodUpdate', () => {
  test('opens a hosted setup session for the workspace customer and returns its URL', async () => {
    const { caller } = setup();
    const result = await beginPaymentMethodUpdate({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, idempotencyKey: 'key-0001-abcd' });

    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_setup_1' });
    const [params, options] = sessionsCreate.mock.calls[0];
    expect(params).toMatchObject({
      mode: 'setup',
      customer: CUSTOMER_ID,
      payment_method_types: ['card'],
      metadata: { workspace_id: WORKSPACE_ID, purpose: 'payment_method_update' },
    });
    expect(String(params.success_url)).toContain('/settings/billing?payment_method=updated');
    expect(String(params.cancel_url)).toContain('/settings/billing?payment_method=canceled');
    expect(options.idempotencyKey).toBe(`${WORKSPACE_ID}:payment-method:key-0001-abcd`);
  });

  test('never asks this app to collect card data: no card fields in the request', async () => {
    const { caller } = setup();
    await beginPaymentMethodUpdate({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, idempotencyKey: 'key-0001-abcd' });
    expect(JSON.stringify(sessionsCreate.mock.calls[0][0])).not.toMatch(/card\[|cvc|number/i);
  });

  test('only the owner may start it', async () => {
    const { caller } = setup(stateRow(), false);
    expect(await rejection(beginPaymentMethodUpdate({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, idempotencyKey: 'key-0001-abcd' }))).toMatchObject({ code: 'forbidden', status: 403 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  test('answers 409 for a workspace with no Stripe customer', async () => {
    const { caller } = setup(null);
    expect(await rejection(beginPaymentMethodUpdate({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, idempotencyKey: 'key-0001-abcd' }))).toMatchObject({ code: 'no_active_subscription', status: 409 });
  });

  test('maps a Stripe failure to a generic 502', async () => {
    sessionsCreate.mockRejectedValue(new Error('boom: acct_secret'));
    const { caller } = setup();
    const failure = await beginPaymentMethodUpdate({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, idempotencyKey: 'key-0001-abcd' }).catch(error => error);
    expect(failure).toMatchObject({ code: 'upstream_error', status: 502 });
    expect(failure.message).not.toContain('acct_secret');
  });
});

describe('applySetupSessionCompleted', () => {
  const event = { id: 'evt_setup_1', type: 'checkout.session.completed', created: 1_772_000_000 } as never;
  const session = { id: 'cs_setup_1', mode: 'setup', customer: CUSTOMER_ID, setup_intent: 'seti_1' } as never;

  test('makes the new method the default for the customer and the subscription, then records the summary (Scenario 2.2)', async () => {
    const { admin } = setup();
    const result = await applySetupSessionCompleted(event, session);

    expect(result.status).toBe('applied');
    expect(customersUpdate).toHaveBeenCalledWith(CUSTOMER_ID, { invoice_settings: { default_payment_method: 'pm_new_8814' } });
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_test_0001', { default_payment_method: 'pm_new_8814' });
    const rpc = admin.rpcCalls.find(call => call.fn === 'bunkai_apply_billing_payment_method')!;
    expect(rpc.args).toMatchObject({
      p_stripe_event_id: 'evt_setup_1',
      p_stripe_customer_id: CUSTOMER_ID,
      p_brand: 'visa',
      p_last4: '8814',
      p_exp_month: 9,
      p_exp_year: 2029,
      p_replaced: true,
    });
  });

  test('ignores a session without a customer or a card and changes nothing', async () => {
    const { admin } = setup();
    expect((await applySetupSessionCompleted(event, { id: 'cs', mode: 'setup', customer: null, setup_intent: 'seti_1' } as never)).status).toBe('ignored');
    setupIntentsRetrieve.mockResolvedValue({ id: 'seti_1', payment_method: { id: 'pm_x' } });
    expect((await applySetupSessionCompleted(event, session)).status).toBe('ignored');
    expect(customersUpdate).not.toHaveBeenCalled();
    expect(admin.rpcCalls).toHaveLength(0);
  });

  test('lets a Stripe failure propagate so the webhook answers 5xx and Stripe redelivers', async () => {
    customersUpdate.mockRejectedValue(new Error('rate limited'));
    const { admin } = setup();
    expect(await rejection(applySetupSessionCompleted(event, session))).toMatchObject({ message: 'rate limited' });
    expect(admin.rpcCalls).toHaveLength(0);
  });
});

describe('refreshPaymentMethodSummary', () => {
  test('records the customer\'s default method without stamping a replacement', async () => {
    const { admin } = setup();
    await refreshPaymentMethodSummary(CUSTOMER_ID, 'sub_test_0001');
    const rpc = admin.rpcCalls.find(call => call.fn === 'bunkai_apply_billing_payment_method')!;
    expect(rpc.args).toMatchObject({ p_last4: '4242', p_replaced: false, p_stripe_event_id: null });
  });

  test('swallows a Stripe outage: the Billing screen must never break because of it', async () => {
    customersRetrieve.mockRejectedValue(new Error('stripe down'));
    const { admin } = setup();
    expect(await refreshPaymentMethodSummary(CUSTOMER_ID, null)).toBeUndefined();
    expect(admin.rpcCalls).toHaveLength(0);
  });
});
