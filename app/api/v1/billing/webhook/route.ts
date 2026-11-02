import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { applySetupSessionCompleted } from '@lib/billing/payment-method';
import { getStripeClient, getStripeWebhookSecret } from '@lib/billing/stripe';
import { applyInvoiceEvent, INVOICE_EVENT_TYPES } from '@lib/billing/webhook-events';
import { createAdminClient } from '@lib/supabase/admin';
import { applyBillingCheckoutWebhookEvent } from '@lib/supabase/rpc';

// POST /api/v1/billing/webhook — Stripe calls this directly (not a
// workspace-scoped route: Stripe has no notion of our workspace ids, and
// this request carries no Supabase session at all). `auth: 'public'` — the
// ONLY authentication here is the Stripe signature over the raw body, which
// is why this reads request.text() and never request.json() (JSON.parse
// re-serialization would not byte-match what Stripe signed).
//
// Handles checkout.session.completed / .async_payment_succeeded (apply the
// plan upgrade, but ONLY when Stripe's own payment_status is 'paid' — see
// lib/billing/checkout.ts's module header and migration 0077's RPC comment
// for why: a delayed-notification payment method fires `.completed`
// immediately with payment_status 'unpaid'), .async_payment_failed and
// .expired (both release the one-open-session lock). Every other event type
// is acknowledged and ignored with 200.
//
// `unknown_session` is the one outcome that answers a 5xx instead of 200
// (review item 2): it means the RPC could not find a matching
// billing_checkout_sessions row FOR THIS EVENT, and answering 200 would tell
// Stripe to stop retrying — but the row may simply not have committed yet
// (an extremely narrow window now that lib/billing/checkout.ts inserts the
// row before ever calling Stripe, but not a zero one). A 5xx makes Stripe
// redeliver the SAME event id, and the RPC's dedupe write is deliberately
// gated behind a successful row lookup, so that redelivery gets a REAL
// second attempt rather than being swallowed as `duplicate`.

// BK-231 — two more event families, dispatched BEFORE the checkout RPC above:
//   * `invoice.payment_failed` / `invoice.paid` drive the failed-renewal grace
//     window and the recovery (lib/billing/webhook-events.ts, migration 0113).
//     An invoice for a customer we do not know yet answers 5xx only while the
//     event is recent (the checkout row may not have committed), then 200.
//   * a Checkout Session with `mode: 'setup'` is a payment-method replacement,
//     NOT a purchase. It must never reach the BK-230 RPC: that RPC would answer
//     `unknown_session`, the route would answer 5xx, and Stripe would redeliver
//     the same event for days.

const HANDLED_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);

export const POST = withApiHandler(async (request: NextRequest) => {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    throw new ApiError('bad_request', 'Missing stripe-signature header.');
  }

  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  let event: Stripe.Event;
  try {
    // `constructEventAsync`, not the sync `constructEvent` — this app runs
    // under Bun (locally and via `bun run dev`), whose Stripe SDK crypto
    // provider resolves to `SubtleCryptoProvider`; its HMAC computation is
    // async-only and THROWS if called synchronously (caught by this PR's own
    // webhook route test, app/api/v1/billing/webhook/route.test.ts). The
    // async variant is Stripe's own documented recommendation for any
    // non-Node runtime (Bun, Deno, Cloudflare Workers, edge) and works
    // identically on Node.js.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed.';
    throw new ApiError('bad_request', `Webhook signature verification failed: ${message}`);
  }

  if (INVOICE_EVENT_TYPES.has(event.type)) {
    const outcome = await applyInvoiceEvent(event);
    if (outcome.retryable) {
      console.error('stripe invoice event for a customer not known yet', { eventId: event.id, type: event.type });
      throw new ApiError('upstream_error', 'No matching billing customer found yet — retry.');
    }
    return jsonResponse({ status: 'ok', result: { status: outcome.status } }, { status: 200 });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return jsonResponse({ status: 'ignored', type: event.type }, { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode === 'setup') {
    if (event.type !== 'checkout.session.completed') {
      return jsonResponse({ status: 'ignored', type: event.type }, { status: 200 });
    }
    const outcome = await applySetupSessionCompleted(event, session);
    return jsonResponse({ status: 'ok', result: outcome }, { status: 200 });
  }

  const customerId = typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null);

  const admin = createAdminClient();
  const { data, error } = await applyBillingCheckoutWebhookEvent(admin, {
    stripeEventId: event.id,
    stripeEventType: event.type,
    stripeCheckoutSessionId: session.id,
    clientReferenceId: session.client_reference_id,
    paymentStatus: session.payment_status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });

  if (error) {
    console.error('bunkai_apply_billing_checkout_webhook_event failed', { eventId: event.id, type: event.type, error: error.message });
    throw new ApiError('internal_error', error.message);
  }

  const status = (data as { status?: string } | null)?.status;
  if (status === 'unknown_session') {
    console.error('bunkai_apply_billing_checkout_webhook_event: unknown_session', { eventId: event.id, type: event.type, stripeCheckoutSessionId: session.id, clientReferenceId: session.client_reference_id });
    throw new ApiError('upstream_error', 'No matching checkout session row found yet — retry.');
  }

  return jsonResponse({ status: 'ok', result: data }, { status: 200 });
}, { auth: 'public' });
