import { describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

// Conductor review (PR #208) item 6 — MAJOR: "the most security-critical
// line in the PR has zero tests... There is no test that a missing
// signature is rejected, that a forged one is rejected, or that the RAW body
// rather than re-serialized JSON is what gets verified."
//
// `getStripeClient()` / `getStripeWebhookSecret()` read `env.STRIPE_*`
// (lib/env.ts), which this repo's `.env` deliberately leaves blank (BK-230's
// own ADR-0014: real keys are a human's job, not this worker's) — and
// `lib/env.ts` is a module-level singleton other test files may have already
// imported by the time this file runs inside the SAME `bun test` process, so
// mutating `process.env` here would not reliably reach it. `mock.module` on
// `@lib/billing/stripe` sidesteps that entirely: it substitutes ONLY the
// credential-provider functions with a REAL `Stripe` client constructed from
// a fixed test-only key, so the route's actual logic — raw-body reading,
// header requirement, and `stripe.webhooks.constructEvent`'s REAL signature
// math — all run unmocked. Same shim convention as `lib/api/capability-
// enforcement.test.ts` (`mock.module('server-only', ...)`), and the same
// direct-`NextRequest`-construction style that file uses to drive a real
// exported route handler with no dedicated test harness.
const TEST_STRIPE_SECRET_KEY = 'sk_test_ci_only_not_a_real_key';
const TEST_WEBHOOK_SECRET = 'whsec_ci_only_not_a_real_secret';
const testStripeClient = new Stripe(TEST_STRIPE_SECRET_KEY);

void mock.module('server-only', () => ({}));
void mock.module('@lib/billing/stripe', () => ({
  getStripeClient: () => testStripeClient,
  getStripeWebhookSecret: () => TEST_WEBHOOK_SECRET,
  getStripeCloudPriceId: () => 'price_ci_only_not_real',
}));

const { POST } = await import('./route');

// BK-638 item 6 — the DB gate now covers only the cases that actually reach
// the database. Signature verification runs BEFORE `createAdminClient()` is
// ever called (route.ts: the `stripe-signature` check and
// `constructEventAsync` both answer 400 above that line), so those three
// never needed Supabase secrets.
//
// The ticket framed this as coverage that "silently vanishes" on a runner
// without those secrets. It does not, and the correction matters for anyone
// relying on this gate: `lib/env.ts` validates NEXT_PUBLIC_SUPABASE_URL
// (`.url()`) and SUPABASE_SERVICE_ROLE_KEY (`.min(1)`) at import, so a runner
// missing either one fails this whole FILE at load rather than skipping it.
// Reading the same two variables, `hasEnv` below could only ever be true
// wherever this file loads at all. The gate was dead, not fail-open — but it
// described a boundary that was not the real one, which is the part worth
// removing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

async function signedRequest(payload: string, secret: string, signatureHeader?: string): Promise<NextRequest> {
  // `generateTestHeaderStringAsync`, not the sync variant — Bun's runtime
  // resolves Stripe's Node crypto provider to `SubtleCryptoProvider`, whose
  // `computeHMACSignature` is async-only and throws
  // `CryptoProviderOnlySupportsAsyncError` if called synchronously.
  const header = signatureHeader ?? await testStripeClient.webhooks.generateTestHeaderStringAsync({ payload, secret });
  return new NextRequest('https://app.test/api/v1/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': header, 'content-type': 'application/json' },
    body: payload,
  });
}

function fakeCompletedSessionPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: `evt_test_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${Math.random().toString(36).slice(2)}`,
        object: 'checkout.session',
        client_reference_id: null,
        payment_status: 'paid',
        customer: null,
        subscription: null,
        ...overrides,
      },
    },
  });
}

// No database, no Supabase secrets: every case here is rejected by
// `stripe.webhooks.constructEventAsync` (real signature math, real raw body)
// before the route builds an admin client. Plain `describe` — these run
// everywhere.
describe('POST /api/v1/billing/webhook — signature verification (PR #208 item 6)', () => {
  test('missing stripe-signature header -> 400', async () => {
    const request = new NextRequest('https://app.test/api/v1/billing/webhook', {
      method: 'POST',
      body: fakeCompletedSessionPayload(),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });

  test('forged signature (wrong secret) -> 400', async () => {
    const payload = fakeCompletedSessionPayload();
    const request = await signedRequest(payload, 'whsec_a_completely_different_secret');

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });

  test('tampered body (signed for one payload, a different body is sent) -> 400', async () => {
    const signedPayload = fakeCompletedSessionPayload();
    const header = await testStripeClient.webhooks.generateTestHeaderStringAsync({ payload: signedPayload, secret: TEST_WEBHOOK_SECRET });
    const tamperedPayload = fakeCompletedSessionPayload(); // a DIFFERENT random id than what was signed

    const request = await signedRequest(tamperedPayload, TEST_WEBHOOK_SECRET, header);

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

// Past signature verification the route dispatches to
// `bunkai_apply_billing_checkout_webhook_event` against the real database, so
// this block keeps the Supabase gate.
describeOrSkip('POST /api/v1/billing/webhook — post-verification dispatch (needs Supabase)', () => {
  test('valid signature over the RAW body reaches RPC dispatch (proves raw-body, not re-serialized JSON, is what is verified)', async () => {
    // No fixture row exists for this fabricated session id, so the RPC
    // legitimately answers `unknown_session` and the route maps that to a
    // 5xx (review item 2) — NOT a 400. Getting past signature verification
    // at all is the point: if the route re-serialized the parsed body
    // (`JSON.stringify(JSON.parse(raw))`) instead of using the raw text,
    // Stripe's signature check would fail on ordinary JSON round-trip drift
    // and EVERY case in this file — including this one — would 400 instead.
    const payload = fakeCompletedSessionPayload();
    const request = await signedRequest(payload, TEST_WEBHOOK_SECRET);

    const response = await POST(request);
    expect(response.status).not.toBe(400);
    expect(response.status).toBe(502);
  });

  test('an unhandled event type is acknowledged and ignored with 200', async () => {
    const payload = JSON.stringify({
      id: `evt_test_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type: 'customer.created',
      data: { object: { id: 'cus_test_irrelevant' } },
    });
    const request = await signedRequest(payload, TEST_WEBHOOK_SECRET);

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string, type: string };
    expect(body.status).toBe('ignored');
    expect(body.type).toBe('customer.created');
  });
});

// ---------------------------------------------------------------------------
// BK-231 — dispatch of the two new event families. No database and no Stripe
// account: the handlers are spies on their module namespace (restored after
// every test), so what is proven here is ROUTING only. The handlers themselves
// are covered by lib/billing/webhook-events.test.ts and payment-method.test.ts,
// and the SQL by lib/billing/billing-details-isolation.test.ts.
// ---------------------------------------------------------------------------

const webhookEvents = await import('@lib/billing/webhook-events');
const paymentMethod = await import('@lib/billing/payment-method');
const adminModule = await import('@lib/supabase/admin');
const { spyOn } = await import('bun:test');

function eventPayload(type: string, object: Record<string, unknown>): string {
  return JSON.stringify({ id: `evt_test_${Math.random().toString(36).slice(2)}`, object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } });
}

describe('POST /api/v1/billing/webhook — invoice and setup-session dispatch (BK-231)', () => {
  test('invoice.payment_failed goes to the invoice handler and answers 200 (Scenario 4.1)', async () => {
    const handler = spyOn(webhookEvents, 'applyInvoiceEvent').mockResolvedValue({ status: 'grace_started', retryable: false });
    try {
      const response = await POST(await signedRequest(eventPayload('invoice.payment_failed', { id: 'in_1', customer: 'cus_1', billing_reason: 'subscription_cycle' }), TEST_WEBHOOK_SECRET));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', result: { status: 'grace_started' } });
      expect(handler).toHaveBeenCalledTimes(1);
    }
    finally {
      handler.mockRestore();
    }
  });

  test('an invoice for a customer not known yet answers 502 so Stripe redelivers', async () => {
    const handler = spyOn(webhookEvents, 'applyInvoiceEvent').mockResolvedValue({ status: 'unknown_customer', retryable: true });
    try {
      const response = await POST(await signedRequest(eventPayload('invoice.paid', { id: 'in_1', customer: 'cus_1' }), TEST_WEBHOOK_SECRET));
      expect(response.status).toBe(502);
    }
    finally {
      handler.mockRestore();
    }
  });

  test('a stale unknown customer is acknowledged with 200 and no further retries', async () => {
    const handler = spyOn(webhookEvents, 'applyInvoiceEvent').mockResolvedValue({ status: 'unknown_customer', retryable: false });
    try {
      const response = await POST(await signedRequest(eventPayload('invoice.paid', { id: 'in_1', customer: 'cus_1' }), TEST_WEBHOOK_SECRET));
      expect(response.status).toBe(200);
    }
    finally {
      handler.mockRestore();
    }
  });

  test('an invoice event the story does not use stays ignored', async () => {
    const handler = spyOn(webhookEvents, 'applyInvoiceEvent');
    try {
      const response = await POST(await signedRequest(eventPayload('invoice.created', { id: 'in_1', customer: 'cus_1' }), TEST_WEBHOOK_SECRET));
      expect(response.status).toBe(200);
      expect((await response.json() as { status: string }).status).toBe('ignored');
      expect(handler).not.toHaveBeenCalled();
    }
    finally {
      handler.mockRestore();
    }
  });

  test('a completed SETUP session is a payment-method replacement: it never reaches the checkout RPC', async () => {
    const setup = spyOn(paymentMethod, 'applySetupSessionCompleted').mockResolvedValue({ status: 'applied' });
    // The checkout path builds an admin client first; the setup path must not.
    const admin = spyOn(adminModule, 'createAdminClient').mockImplementation(() => {
      throw new Error('the setup path must not touch the checkout RPC');
    });
    try {
      const response = await POST(await signedRequest(eventPayload('checkout.session.completed', { id: 'cs_setup_1', mode: 'setup', customer: 'cus_1', setup_intent: 'seti_1' }), TEST_WEBHOOK_SECRET));
      expect(response.status).toBe(200);
      expect(setup).toHaveBeenCalledTimes(1);
      expect(admin).not.toHaveBeenCalled();
    }
    finally {
      setup.mockRestore();
      admin.mockRestore();
    }
  });

  test('a SETUP session that expired is acknowledged and ignored, not retried', async () => {
    const setup = spyOn(paymentMethod, 'applySetupSessionCompleted');
    const admin = spyOn(adminModule, 'createAdminClient').mockImplementation(() => {
      throw new Error('must not be reached');
    });
    try {
      const response = await POST(await signedRequest(eventPayload('checkout.session.expired', { id: 'cs_setup_1', mode: 'setup', customer: 'cus_1' }), TEST_WEBHOOK_SECRET));
      expect(response.status).toBe(200);
      expect(setup).not.toHaveBeenCalled();
    }
    finally {
      setup.mockRestore();
      admin.mockRestore();
    }
  });
});
