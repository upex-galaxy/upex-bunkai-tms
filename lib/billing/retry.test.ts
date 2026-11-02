import type { Mock } from 'bun:test';
import type { QueryCall } from './test-doubles';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { CUSTOMER_ID, fakeSupabase, ownerRpc, rejection, stateRow, WORKSPACE_ID } from './test-doubles';

// BK-231 — retrying a failed renewal (Scenarios 4.4, 4.5). Stripe and the
// database are doubles; the state machine in SQL is covered by
// billing-details-isolation.test.ts.

void mock.module('server-only', () => ({}));

const stripeModule = await import('@lib/billing/stripe');
const adminModule = await import('@lib/supabase/admin');
const { retryFailedRenewal } = await import('./retry');

const GRACE = { started_at: '2026-10-01T12:00:00.000Z', ends_at: '2026-10-15T12:00:00.000Z' };
const RETRYABLE = {
  payment_state: 'payment_failed',
  failed_invoice_id: 'in_failed0001',
  payment_method_updated_at: '2026-10-02T09:00:00.000Z',
  retry_attempts: 0,
};

let invoicesPay: Mock<(id: string, params: unknown, options: { idempotencyKey: string }) => Promise<unknown>>;
let invoicesRetrieve: Mock<(id: string) => Promise<unknown>>;
let spies: Array<{ mockRestore: () => void }>;

function setup(opts: { isOwner?: boolean, state?: Record<string, unknown> | null, grace?: unknown, claimWon?: boolean } = {}) {
  const admin = fakeSupabase((call: QueryCall) => {
    if (call.table === 'workspace_billing_state' && call.op === 'select') {
      return { data: opts.state === null ? null : stateRow({ ...RETRYABLE, ...opts.state }), error: null };
    }
    if (call.table === 'workspace_grace_periods') {
      return { data: 'grace' in opts ? opts.grace : GRACE, error: null };
    }
    if (call.table === 'workspace_billing_state' && call.op === 'update' && (call.payload as { payment_state?: string }).payment_state === 'retry_pending') {
      return { data: opts.claimWon === false ? null : { workspace_id: WORKSPACE_ID }, error: null };
    }
    return undefined;
  });
  spies = [
    spyOn(adminModule, 'createAdminClient').mockReturnValue(admin.client as never),
    spyOn(stripeModule, 'getStripeClient').mockReturnValue({ invoices: { pay: invoicesPay, retrieve: invoicesRetrieve } } as never),
  ];
  const caller = fakeSupabase(() => undefined, ownerRpc(opts.isOwner ?? true));
  return { admin, caller };
}

const released = (admin: ReturnType<typeof fakeSupabase>) => admin.calls.some(call => call.op === 'update'
  && (call.payload as { payment_state?: string }).payment_state === 'payment_failed'
  && call.filters.some(([column, , value]) => column === 'payment_state' && value === 'retry_pending'));

beforeEach(() => {
  invoicesPay = mock(async () => ({ id: 'in_failed0001', status: 'paid' }));
  invoicesRetrieve = mock(async () => ({ id: 'in_failed0001', status: 'open' }));
  spies = [];
});
afterEach(() => { spies.forEach(spy => spy.mockRestore()); });

describe('retryFailedRenewal', () => {
  test('pays the failed invoice and records the recovery only from the provider\'s paid answer (Scenario 4.4)', async () => {
    const { admin, caller } = setup();
    const result = await retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID });

    expect(result).toEqual({ status: 'recovered' });
    expect(invoicesPay).toHaveBeenCalledTimes(1);
    expect(invoicesPay.mock.calls[0][0]).toBe('in_failed0001');
    expect(invoicesPay.mock.calls[0][2].idempotencyKey).toBe(`${WORKSPACE_ID}:retry:in_failed0001:1`);
    const rpc = admin.rpcCalls.find(call => call.fn === 'bunkai_apply_billing_invoice_event')!;
    expect(rpc.args).toMatchObject({
      p_event_type: 'invoice.paid',
      p_stripe_customer_id: CUSTOMER_ID,
      p_stripe_invoice_id: 'in_failed0001',
      p_stripe_event_id: 'retry:in_failed0001:1',
    });
    expect(released(admin)).toBe(false);
  });

  test('a second deliberate attempt is a new Stripe request (the attempt number is in the key)', async () => {
    const { caller } = setup({ state: { retry_attempts: 1 } });
    await retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID });
    expect(invoicesPay.mock.calls[0][2].idempotencyKey).toBe(`${WORKSPACE_ID}:retry:in_failed0001:2`);
  });

  test('a decline keeps the failed state and the retry path, and never marks the workspace paid (Scenario 4.5)', async () => {
    invoicesPay.mockRejectedValue(Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError' }));
    const { admin, caller } = setup();

    const failure = await retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID }).catch(error => error);

    expect(failure).toMatchObject({ code: 'payment_declined', status: 402, details: { reason: 'card_declined' } });
    expect(released(admin)).toBe(true);
    expect(admin.rpcCalls.some(call => call.fn === 'bunkai_apply_billing_invoice_event')).toBe(false);
  });

  test('a timeout keeps the failed state, answers 502 and leaves reconciliation to the webhook', async () => {
    invoicesPay.mockRejectedValue(Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' }));
    const { admin, caller } = setup();

    const failure = await retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID }).catch(error => error);

    expect(failure).toMatchObject({ code: 'upstream_error', status: 502 });
    expect(failure.message).not.toContain('socket hang up');
    expect(released(admin)).toBe(true);
    expect(admin.rpcCalls).toHaveLength(0);
  });

  test('an invoice Stripe leaves open (card issuer needs an action) is not recorded as paid', async () => {
    invoicesPay.mockResolvedValue({ id: 'in_failed0001', status: 'open' });
    const { admin, caller } = setup();

    expect(await rejection(retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID }))).toMatchObject({ code: 'payment_declined', details: { reason: 'requires_action' } });
    expect(released(admin)).toBe(true);
    expect(admin.rpcCalls).toHaveLength(0);
  });

  test('only the owner may retry, and a refusal touches neither the database nor Stripe', async () => {
    const { admin, caller } = setup({ isOwner: false });
    expect(await rejection(retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID }))).toMatchObject({ code: 'forbidden', status: 403, details: { reason: 'not_workspace_owner' } });
    expect(admin.calls).toHaveLength(0);
    expect(invoicesPay).not.toHaveBeenCalled();
  });

  test.each([
    ['a workspace with no subscription', { state: null }, 'no_active_subscription', undefined],
    ['a renewal that is not failed', { state: { payment_state: 'paid', failed_invoice_id: null } }, 'retry_not_available', 'no_failed_renewal'],
    ['a payment method that was not replaced', { state: { payment_method_updated_at: null } }, 'retry_not_available', 'payment_method_not_replaced'],
    ['a retry already running', { state: { payment_state: 'retry_pending', retry_started_at: new Date().toISOString() } }, 'retry_not_available', 'retry_in_progress'],
    ['a lost claim race', { claimWon: false }, 'retry_not_available', 'retry_in_progress'],
  ] as const)('refuses %s with 409 and never calls Stripe', async (_label, opts, code, reason) => {
    const { caller } = setup(opts as never);
    const failure = await retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID }).catch(error => error);
    expect(failure).toMatchObject({ code, status: 409 });
    if (reason) {
      expect(failure.details).toEqual({ reason });
    }
    expect(invoicesPay).not.toHaveBeenCalled();
  });

  test('an invoice Stripe already shows as paid is recorded as the recovery without charging again', async () => {
    invoicesRetrieve.mockResolvedValue({ id: 'in_failed0001', status: 'paid' });
    const { admin, caller } = setup();

    expect(await retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID })).toEqual({ status: 'recovered' });
    expect(invoicesPay).not.toHaveBeenCalled();
    expect(admin.rpcCalls.find(call => call.fn === 'bunkai_apply_billing_invoice_event')?.args).toMatchObject({ p_event_type: 'invoice.paid', p_stripe_invoice_id: 'in_failed0001' });
  });

  test.each(['void', 'uncollectible'])('a %s invoice cannot be collected: refused, released and never charged', async (status) => {
    invoicesRetrieve.mockResolvedValue({ id: 'in_failed0001', status });
    const { admin, caller } = setup();

    const failure = await rejection(retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID }));

    expect(failure).toMatchObject({ code: 'retry_not_available', status: 409, details: { reason: 'invoice_not_payable' } });
    expect(invoicesPay).not.toHaveBeenCalled();
    expect(released(admin)).toBe(true);
  });

  test('an unconfigured processor releases the claim too', async () => {
    const { ApiError } = await import('@lib/api/error-envelope');
    const { admin, caller } = setup();
    // Installed after setup() so it replaces the working Stripe double.
    spies.push(spyOn(stripeModule, 'getStripeClient').mockImplementation(() => { throw new ApiError('payment_processor_unavailable', 'x'); }));
    expect(await rejection(retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID }))).toMatchObject({ code: 'payment_processor_unavailable' });
    expect(released(admin)).toBe(true);
  });

  test('reclaims a retry claim that went stale', async () => {
    const stale = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { caller } = setup({ state: { payment_state: 'retry_pending', retry_started_at: stale, retry_attempts: 1 } });
    expect(await retryFailedRenewal({ db: caller.client, workspaceId: WORKSPACE_ID })).toEqual({ status: 'recovered' });
    expect(invoicesPay.mock.calls[0][2].idempotencyKey).toBe(`${WORKSPACE_ID}:retry:in_failed0001:2`);
  });
});
