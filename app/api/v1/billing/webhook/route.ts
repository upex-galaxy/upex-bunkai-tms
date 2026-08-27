import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { getStripeClient, getStripeWebhookSecret } from '@lib/billing/stripe';
import { createAdminClient } from '@lib/supabase/admin';
import { applyBillingCheckoutWebhookEvent } from '@lib/supabase/rpc';

// POST /api/v1/billing/webhook — Stripe calls this directly (not a
// workspace-scoped route: Stripe has no notion of our workspace ids, and
// this request carries no Supabase session at all). `auth: 'public'` — the
// ONLY authentication here is the Stripe signature over the raw body, which
// is why this reads request.text() and never request.json() (JSON.parse
// re-serialization would not byte-match what Stripe signed).
//
// Handles checkout.session.completed (apply the plan upgrade) and
// checkout.session.expired (release the one-open-session lock); every other
// event type is acknowledged and ignored. Always answers 200 once the
// signature verifies — Stripe redelivers on anything else, and retrying a
// business-logic failure inside bunkai_apply_billing_checkout_webhook_event
// would not help (it is already idempotent and already logged its own
// no-op outcomes), so this route does not attempt to distinguish "handled"
// from "ignored" in its response status.

const HANDLED_EVENT_TYPES = new Set(['checkout.session.completed', 'checkout.session.expired']);

export const POST = withApiHandler(async (request: NextRequest) => {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    throw new ApiError('bad_request', 'Missing stripe-signature header.');
  }

  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed.';
    throw new ApiError('bad_request', `Webhook signature verification failed: ${message}`);
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return jsonResponse({ status: 'ignored', type: event.type }, { status: 200 });
  }

  const session = event.data.object as { id: string };

  const admin = createAdminClient();
  const { data, error } = await applyBillingCheckoutWebhookEvent(admin, {
    stripeEventId: event.id,
    stripeEventType: event.type,
    stripeCheckoutSessionId: session.id,
  });

  if (error) {
    console.error('bunkai_apply_billing_checkout_webhook_event failed', { eventId: event.id, type: event.type, error: error.message });
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ status: 'ok', result: data }, { status: 200 });
}, { auth: 'public' });
