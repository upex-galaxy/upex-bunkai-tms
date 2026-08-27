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

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (client) {
    return client;
  }
  if (!env.STRIPE_SECRET_KEY) {
    throw new ApiError('payment_processor_unavailable', 'The payment processor is not configured for this environment.');
  }
  client = new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export function getStripeWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new ApiError('payment_processor_unavailable', 'The payment processor is not configured for this environment.');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

export function getStripeCloudPriceId(): string {
  if (!env.STRIPE_CLOUD_PRICE_ID) {
    throw new ApiError('payment_processor_unavailable', 'The payment processor is not configured for this environment.');
  }
  return env.STRIPE_CLOUD_PRICE_ID;
}
