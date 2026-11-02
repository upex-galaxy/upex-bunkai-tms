import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { CUSTOMER_ID, fakeSupabase, ownerRpc, rejection, stateRow, USER_ID, WORKSPACE_ID } from './test-doubles';

// BK-231 — billing details: the form contract (Scenarios 1.1, 1.2) and the save
// path. Stripe and the database are doubles here; the real-database behaviour
// (CHECK constraints, RLS) is in billing-details-isolation.test.ts. Spies on the
// module namespace, never mock.module: a spy is restored after every test.

void mock.module('server-only', () => ({}));

const stripeModule = await import('@lib/billing/stripe');
const adminModule = await import('@lib/supabase/admin');
const { ApiError } = await import('@lib/api/error-envelope');
const { BillingDetailsSchema, BILLING_DETAIL_LIMITS, saveBillingDetails } = await import('./billing-details');

const VALID = {
  company_name: 'Upex Systems S.L.',
  billing_email: 'billing@upex.dev',
  address_line1: 'Calle de Serrano 41',
  address_line2: '3a planta',
  city: 'Madrid',
  region: 'Madrid',
  postal_code: '28001',
  country: 'ES',
};

describe('BillingDetailsSchema', () => {
  test('accepts a complete valid profile and normalises the country code', () => {
    const parsed = BillingDetailsSchema.parse({ ...VALID, country: 'es' });
    expect(parsed.country).toBe('ES');
    expect(parsed.company_name).toBe('Upex Systems S.L.');
  });

  test('turns blank optional fields into null', () => {
    const parsed = BillingDetailsSchema.parse({ ...VALID, address_line2: '  ', region: '' });
    expect(parsed.address_line2).toBeNull();
    expect(parsed.region).toBeNull();
  });

  test.each(['company_name', 'billing_email', 'address_line1', 'city', 'postal_code', 'country'])(
    'rejects a missing required field: %s',
    (field) => {
      const body: Record<string, unknown> = { ...VALID };
      delete body[field];
      expect(BillingDetailsSchema.safeParse(body).success).toBe(false);
    },
  );

  test.each(['not-an-email', 'a@b', 'two words@x.io', '@x.io'])('rejects a malformed billing email: %s', (email) => {
    expect(BillingDetailsSchema.safeParse({ ...VALID, billing_email: email }).success).toBe(false);
  });

  test.each(Object.entries(BILLING_DETAIL_LIMITS).filter(([field]) => field !== 'billing_email'))(
    'accepts %s at its limit and rejects one character beyond it',
    (field, limit) => {
      expect(BillingDetailsSchema.safeParse({ ...VALID, [field]: 'x'.repeat(limit) }).success).toBe(true);
      expect(BillingDetailsSchema.safeParse({ ...VALID, [field]: 'x'.repeat(limit + 1) }).success).toBe(false);
    },
  );

  test('rejects an email longer than 254 characters', () => {
    const local = 'a'.repeat(250);
    expect(BillingDetailsSchema.safeParse({ ...VALID, billing_email: `${local}@x.io` }).success).toBe(false);
  });

  test('rejects a country that is not an ISO alpha-2 code', () => {
    expect(BillingDetailsSchema.safeParse({ ...VALID, country: 'ESP' }).success).toBe(false);
    expect(BillingDetailsSchema.safeParse({ ...VALID, country: 'E1' }).success).toBe(false);
  });

  test('rejects an unknown field (no tax id, no stray keys)', () => {
    expect(BillingDetailsSchema.safeParse({ ...VALID, tax_id: 'ES B-84920156' }).success).toBe(false);
  });
});

describe('saveBillingDetails', () => {
  let customersUpdate: Mock<(id: string, params: Record<string, unknown>) => Promise<unknown>>;
  let spies: Array<{ mockRestore: () => void }>;

  function setup(opts: { isOwner?: boolean, state?: unknown, stripeThrows?: unknown, unavailable?: boolean, upsertError?: boolean } = {}) {
    const events: string[] = [];
    customersUpdate = mock(async () => {
      events.push('stripe');
      if (opts.stripeThrows) {
        throw opts.stripeThrows;
      }
      return {};
    });
    const admin = fakeSupabase((call) => {
      if (call.table === 'workspace_billing_state') {
        return { data: 'state' in opts ? opts.state : stateRow(), error: null };
      }
      if (call.table === 'workspace_billing_profiles' && call.op === 'upsert') {
        events.push('db');
        if (opts.upsertError) {
          return { data: null, error: { message: 'boom', code: 'XX000' } };
        }
        return { data: { ...(call.payload as object), updated_at: '2026-11-02T10:00:00.000Z' }, error: null };
      }
      return undefined;
    });
    spies = [
      spyOn(adminModule, 'createAdminClient').mockReturnValue(admin.client as never),
      spyOn(stripeModule, 'getStripeClient').mockImplementation(() => {
        if (opts.unavailable) {
          throw new ApiError('payment_processor_unavailable', 'Payments are temporarily unavailable. Please try again later.');
        }
        return { customers: { update: customersUpdate } } as never;
      }),
    ];
    const caller = fakeSupabase(() => undefined, ownerRpc(opts.isOwner ?? true));
    return { admin, caller, events };
  }

  beforeEach(() => { spies = []; });
  afterEach(() => { spies.forEach(spy => spy.mockRestore()); });

  const input = () => BillingDetailsSchema.parse(VALID);

  test('pushes the details to the Stripe customer first, then stores them (Scenario 1.1)', async () => {
    const { caller, admin, events } = setup();
    const saved = await saveBillingDetails({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, input: input() });

    expect(events).toEqual(['stripe', 'db']);
    expect(customersUpdate).toHaveBeenCalledTimes(1);
    expect(customersUpdate.mock.calls[0][0]).toBe(CUSTOMER_ID);
    expect(customersUpdate.mock.calls[0][1]).toMatchObject({
      name: 'Upex Systems S.L.',
      email: 'billing@upex.dev',
      address: { line1: 'Calle de Serrano 41', line2: '3a planta', city: 'Madrid', state: 'Madrid', postal_code: '28001', country: 'ES' },
    });
    const upsert = admin.calls.find(call => call.op === 'upsert')!;
    expect(upsert.payload).toMatchObject({ workspace_id: WORKSPACE_ID, updated_by_user_id: USER_ID, company_name: 'Upex Systems S.L.' });
    expect(upsert.options).toEqual({ onConflict: 'workspace_id' });
    expect(saved.company_name).toBe('Upex Systems S.L.');
    expect(saved).not.toHaveProperty('workspace_id');
  });

  test('clears an optional field on Stripe with an empty string', async () => {
    const { caller } = setup();
    await saveBillingDetails({
      db: caller.client,
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      input: BillingDetailsSchema.parse({ ...VALID, address_line2: '', region: null }),
    });
    expect(customersUpdate.mock.calls[0][1]).toMatchObject({ address: { line2: '', state: '' } });
  });

  test('refuses a caller who is not the owner before any Stripe or database access', async () => {
    const { caller, admin } = setup({ isOwner: false });
    expect(await rejection(saveBillingDetails({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, input: input() }))).toMatchObject({ code: 'forbidden', status: 403, details: { reason: 'not_workspace_owner' } });
    expect(customersUpdate).not.toHaveBeenCalled();
    expect(admin.calls).toHaveLength(0);
  });

  test('answers 409 no_active_subscription for a workspace with no Stripe customer', async () => {
    const { caller } = setup({ state: null });
    expect(await rejection(saveBillingDetails({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, input: input() }))).toMatchObject({ code: 'no_active_subscription', status: 409 });
    expect(customersUpdate).not.toHaveBeenCalled();
  });

  test('leaves the stored profile untouched when Stripe rejects the update, without echoing Stripe text', async () => {
    const { caller, admin } = setup({ stripeThrows: new Error('No such customer: cus_secret_internal') });
    const failure = await saveBillingDetails({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, input: input() }).catch(error => error);
    expect(failure).toMatchObject({ code: 'upstream_error', status: 502 });
    expect(failure.message).not.toContain('cus_secret_internal');
    expect(admin.calls.some(call => call.op === 'upsert')).toBe(false);
  });

  test('answers 503 payment_processor_unavailable when Stripe is not configured and writes nothing', async () => {
    const { caller, admin } = setup({ unavailable: true });
    expect(await rejection(saveBillingDetails({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, input: input() }))).toMatchObject({ code: 'payment_processor_unavailable', status: 503 });
    expect(admin.calls.some(call => call.op === 'upsert')).toBe(false);
  });

  test('hides database error text behind a generic internal_error', async () => {
    const { caller } = setup({ upsertError: true });
    const failure = await saveBillingDetails({ db: caller.client, workspaceId: WORKSPACE_ID, userId: USER_ID, input: input() }).catch(error => error);
    expect(failure).toMatchObject({ code: 'internal_error', status: 500 });
    expect(failure.message).not.toContain('boom');
  });
});
