import { ApiError } from '@lib/api/error-envelope';
import { env } from '@lib/env';
import Stripe from 'stripe';
import 'server-only';

// BK-230 — lazy Stripe client. `STRIPE_SECRET_KEY` is optional in
// `lib/env.ts` (same posture as the Atlassian vars): a workspace can never
// reach Stripe without it configured, but its absence must not crash app
// boot for every route that happens to import something from `lib/billing`.
// Callers get a clear `payment_processor_unavailable` (503) at the moment
// they actually need Stripe, not an opaque throw at import time.
//
// BK-827: the client-facing message is deliberately GENERIC. Which variable
// is missing (and the fact that this is a configuration gap at all) is
// internal detail an operator needs and a caller does not — it goes to the
// server log only. Every caller (checkout, cancel, webhook) shares this one
// message, so the same root condition reads identically on every route.
const UNAVAILABLE_MESSAGE = 'Payments are temporarily unavailable. Please try again later.';

function processorUnavailable(missingVariable: string): ApiError {
  console.error('payment processor not configured', { missingVariable });
  return new ApiError('payment_processor_unavailable', UNAVAILABLE_MESSAGE);
}

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (client) {
    return client;
  }
  if (!env.STRIPE_SECRET_KEY) {
    throw processorUnavailable('STRIPE_SECRET_KEY');
  }
  client = new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export function getStripeWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw processorUnavailable('STRIPE_WEBHOOK_SECRET');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

export function getStripeCloudPriceId(): string {
  if (!env.STRIPE_CLOUD_PRICE_ID) {
    throw processorUnavailable('STRIPE_CLOUD_PRICE_ID');
  }
  return env.STRIPE_CLOUD_PRICE_ID;
}
