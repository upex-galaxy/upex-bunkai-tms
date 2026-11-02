import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { assertBillingOwner, noActiveSubscription } from '@lib/billing/billing-state';
import { internalDbError, toProcessorError } from '@lib/billing/errors';
import { getStripeClient } from '@lib/billing/stripe';
import { env } from '@lib/env';
import { createAdminClient } from '@lib/supabase/admin';

type Client = SupabaseClient<Database>;

export interface PaymentMethodSummary {
  brand: string
  last4: string
  exp_month: number
  exp_year: number
}

export interface BeginPaymentMethodUpdateArgs {
  db: Client
  workspaceId: string
  userId: string
  idempotencyKey: string
}

// POST /billing/payment-method. The replacement happens entirely on Stripe's
// hosted page (Checkout `mode: 'setup'`): the card number, expiry and CVC never
// touch this app. The webhook records the outcome. Cancelling or a decline on
// the hosted page changes nothing here, so the active method stays active
// (AC2.3). Card only, the same pin BK-230 applies to checkout.
export async function beginPaymentMethodUpdate(args: BeginPaymentMethodUpdateArgs): Promise<{ url: string }> {
  const { db, workspaceId, userId, idempotencyKey } = args;

  await assertBillingOwner(db, workspaceId, 'replace the payment method');

  const admin = createAdminClient();
  const { data: state, error } = await admin
    .from('workspace_billing_state')
    .select('stripe_customer_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) {
    throw internalDbError('workspace_billing_state lookup failed', error);
  }
  if (!state) {
    throw noActiveSubscription();
  }

  const stripe = getStripeClient();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'setup',
        customer: state.stripe_customer_id,
        payment_method_types: ['card'],
        metadata: {
          workspace_id: workspaceId,
          purpose: 'payment_method_update',
          initiated_by_user_id: userId,
        },
        success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?payment_method=updated`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?payment_method=canceled`,
      },
      // Stripe's idempotency key space is account-global: namespace by workspace.
      { idempotencyKey: `${workspaceId}:payment-method:${idempotencyKey}` },
    );
  }
  catch (raw) {
    throw toProcessorError(raw, 'stripe setup session create failed', { workspaceId });
  }
  if (!session.url) {
    throw toProcessorError(new Error('Stripe returned no setup URL'), 'stripe setup session without url', { workspaceId });
  }
  return { url: session.url };
}

export function summarizeCard(method: Stripe.PaymentMethod | null | undefined): PaymentMethodSummary | null {
  const card = method?.card;
  if (!card) {
    return null;
  }
  return { brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year };
}

// Webhook side of the replacement: the hosted setup session finished. Makes the
// new method the default for the customer and the subscription (so the next
// renewal and a retry use it), then records the summary and stamps the
// replacement time. Every step is idempotent, so a redelivery after a partial
// failure converges.
export async function applySetupSessionCompleted(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<{ status: string }> {
  const stripe = getStripeClient();
  const admin = createAdminClient();

  const customerId = typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
  const setupIntentId = typeof session.setup_intent === 'string' ? session.setup_intent : (session.setup_intent?.id ?? null);
  if (!customerId || !setupIntentId) {
    return { status: 'ignored' };
  }

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });
  const method = typeof setupIntent.payment_method === 'object' ? setupIntent.payment_method : null;
  const summary = summarizeCard(method);
  if (!method || !summary) {
    return { status: 'ignored' };
  }

  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: method.id } });

  const { data: state, error } = await admin
    .from('workspace_billing_state')
    .select('stripe_subscription_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) {
    throw internalDbError('workspace_billing_state lookup failed', error);
  }
  if (state?.stripe_subscription_id) {
    await stripe.subscriptions.update(state.stripe_subscription_id, { default_payment_method: method.id });
  }

  const { data, error: rpcError } = await admin.rpc('bunkai_apply_billing_payment_method', {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_event_created: new Date(event.created * 1000).toISOString(),
    p_stripe_customer_id: customerId,
    p_brand: summary.brand,
    p_last4: summary.last4,
    p_exp_month: summary.exp_month,
    p_exp_year: summary.exp_year,
    p_replaced: true,
  });
  if (rpcError) {
    throw internalDbError('bunkai_apply_billing_payment_method failed', rpcError);
  }
  return { status: (data as { status?: string } | null)?.status ?? 'applied' };
}

// Fills brand / last four for a subscription that was created before the state
// table existed. Best-effort and silent: the Billing screen simply shows "not
// available" until it succeeds, and a Stripe outage must never break the page.
export async function refreshPaymentMethodSummary(customerId: string, subscriptionId: string | null): Promise<void> {
  try {
    const stripe = getStripeClient();
    const customer = await stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] });
    let method: Stripe.PaymentMethod | null = null;
    if (!customer.deleted) {
      const candidate = customer.invoice_settings?.default_payment_method;
      method = candidate && typeof candidate === 'object' ? candidate : null;
    }
    if (!method && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['default_payment_method'] });
      const candidate = subscription.default_payment_method;
      method = candidate && typeof candidate === 'object' ? candidate : null;
    }
    const summary = summarizeCard(method);
    if (!summary) {
      return;
    }
    await createAdminClient().rpc('bunkai_apply_billing_payment_method', {
      p_stripe_event_id: null as unknown as string,
      p_event_type: 'payment_method.refresh',
      p_event_created: new Date().toISOString(),
      p_stripe_customer_id: customerId,
      p_brand: summary.brand,
      p_last4: summary.last4,
      p_exp_month: summary.exp_month,
      p_exp_year: summary.exp_year,
      p_replaced: false,
    });
  }
  catch (raw) {
    console.error('payment method summary refresh failed', { error: raw instanceof Error ? raw.message : String(raw) });
  }
}
