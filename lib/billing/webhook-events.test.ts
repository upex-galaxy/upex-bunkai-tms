import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { CUSTOMER_ID, fakeSupabase } from './test-doubles';

// BK-231 — mapping Stripe invoice events onto the RPC, and the unknown-customer
// retry window.

void mock.module('server-only', () => ({}));

const adminModule = await import('@lib/supabase/admin');
const { applyInvoiceEvent, UNKNOWN_CUSTOMER_RETRY_WINDOW_MS } = await import('./webhook-events');

const NOW = new Date('2026-11-02T12:00:00.000Z');
const created = (offsetMs: number) => Math.floor((NOW.getTime() - offsetMs) / 1000);

function event(type: string, invoice: Record<string, unknown>, ageMs = 1000) {
  return { id: 'evt_1', type, created: created(ageMs), data: { object: invoice } } as never;
}

let spies: Array<{ mockRestore: () => void }>;
function setup(rpcResult: { data: unknown, error: { message: string } | null }) {
  const admin = fakeSupabase(() => undefined, { bunkai_apply_billing_invoice_event: () => rpcResult });
  spies = [spyOn(adminModule, 'createAdminClient').mockReturnValue(admin.client as never)];
  return admin;
}
beforeEach(() => { spies = []; });
afterEach(() => { spies.forEach(spy => spy.mockRestore()); });

describe('applyInvoiceEvent', () => {
  test('passes the failed renewal to the RPC with the event time and billing reason (Scenario 4.1)', async () => {
    const admin = setup({ data: { status: 'grace_started' }, error: null });
    const outcome = await applyInvoiceEvent(
      event('invoice.payment_failed', { id: 'in_1', customer: CUSTOMER_ID, billing_reason: 'subscription_cycle' }),
      NOW,
    );

    expect(outcome).toEqual({ status: 'grace_started', retryable: false });
    expect(admin.rpcCalls[0].args).toEqual({
      p_stripe_event_id: 'evt_1',
      p_event_type: 'invoice.payment_failed',
      p_event_created: new Date(created(1000) * 1000).toISOString(),
      p_stripe_customer_id: CUSTOMER_ID,
      p_stripe_invoice_id: 'in_1',
      p_billing_reason: 'subscription_cycle',
    });
  });

  test('accepts an expanded customer object', async () => {
    const admin = setup({ data: { status: 'recovered' }, error: null });
    await applyInvoiceEvent(event('invoice.paid', { id: 'in_1', customer: { id: CUSTOMER_ID }, billing_reason: 'subscription_cycle' }), NOW);
    expect(admin.rpcCalls[0].args.p_stripe_customer_id).toBe(CUSTOMER_ID);
  });

  test('ignores an invoice with no customer without calling the database', async () => {
    const admin = setup({ data: null, error: null });
    expect(await applyInvoiceEvent(event('invoice.paid', { id: 'in_1', customer: null }), NOW)).toEqual({ status: 'ignored', retryable: false });
    expect(admin.rpcCalls).toHaveLength(0);
  });

  test('asks Stripe to redeliver an unknown customer while the event is recent', async () => {
    setup({ data: { status: 'unknown_customer' }, error: null });
    const outcome = await applyInvoiceEvent(event('invoice.paid', { id: 'in_1', customer: CUSTOMER_ID }, 5 * 60 * 1000), NOW);
    expect(outcome).toEqual({ status: 'unknown_customer', retryable: true });
  });

  test('stops asking once the event is older than the window: the customer belongs to no workspace', async () => {
    setup({ data: { status: 'unknown_customer' }, error: null });
    const outcome = await applyInvoiceEvent(event('invoice.paid', { id: 'in_1', customer: CUSTOMER_ID }, UNKNOWN_CUSTOMER_RETRY_WINDOW_MS + 1000), NOW);
    expect(outcome).toEqual({ status: 'unknown_customer', retryable: false });
  });

  test('a duplicate delivery is acknowledged, not retried', async () => {
    setup({ data: { status: 'duplicate' }, error: null });
    expect(await applyInvoiceEvent(event('invoice.paid', { id: 'in_1', customer: CUSTOMER_ID }), NOW)).toEqual({ status: 'duplicate', retryable: false });
  });

  test('a database error becomes a generic internal_error so Stripe retries', async () => {
    setup({ data: null, error: { message: 'relation x does not exist' } });
    const failure = await applyInvoiceEvent(event('invoice.paid', { id: 'in_1', customer: CUSTOMER_ID }), NOW).catch(error => error);
    expect(failure).toMatchObject({ code: 'internal_error', status: 500 });
    expect(failure.message).not.toContain('relation');
  });
});
