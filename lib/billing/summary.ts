import type { PublicBillingProfile } from '@lib/billing/billing-details';
import type { BillingStateBundle, PaymentState, SubscriptionState } from '@lib/billing/billing-state';
import type { PaymentMethodSummary } from '@lib/billing/payment-method';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBillingProfile } from '@lib/billing/billing-details';
import { deriveSubscriptionState, isRetryAvailable, loadBillingState } from '@lib/billing/billing-state';
import { internalDbError } from '@lib/billing/errors';
import { refreshPaymentMethodSummary } from '@lib/billing/payment-method';

type Client = SupabaseClient<Database>;

// The `billing` block of GET /billing (BK-231). Present only for a workspace
// that pays through Stripe; `null` for Community and Enterprise, where none of
// the maintenance surfaces exist.
export interface BillingBlock {
  can_edit: boolean
  profile: PublicBillingProfile | null
  payment_method: PaymentMethodSummary | null
  // When the owner last confirmed a replacement (ISO), so the screen can tell that
  // the webhook has landed after the return from the hosted page.
  payment_method_updated_at: string | null
  payment_state: PaymentState
  subscription_state: SubscriptionState
  grace: { started_at: string, ends_at: string } | null
  retry_available: boolean
}

function paymentMethodOf(bundle: BillingStateBundle): PaymentMethodSummary | null {
  const { state } = bundle;
  if (!state.payment_method_brand || !state.payment_method_last4 || !state.payment_method_exp_month || !state.payment_method_exp_year) {
    return null;
  }
  return {
    brand: state.payment_method_brand,
    last4: state.payment_method_last4,
    exp_month: state.payment_method_exp_month,
    exp_year: state.payment_method_exp_year,
  };
}

export async function loadBillingBlock(db: Client, workspaceId: string, now: Date = new Date()): Promise<BillingBlock | null> {
  let bundle = await loadBillingState(db, workspaceId);
  if (!bundle) {
    return null;
  }

  // A subscription created before the state table existed has no method summary
  // yet: fill it once from Stripe (best-effort, never fatal), then re-read.
  if (!paymentMethodOf(bundle)) {
    await refreshPaymentMethodSummary(bundle.state.stripe_customer_id, bundle.state.stripe_subscription_id);
    bundle = (await loadBillingState(db, workspaceId)) ?? bundle;
  }

  const ownerCheck = await db.rpc('bunkai_is_workspace_owner', { ws_id: workspaceId });
  if (ownerCheck.error) {
    throw internalDbError('bunkai_is_workspace_owner failed', ownerCheck.error);
  }

  return {
    can_edit: ownerCheck.data === true,
    profile: await loadBillingProfile(db, workspaceId),
    payment_method: paymentMethodOf(bundle),
    payment_method_updated_at: bundle.state.payment_method_updated_at,
    payment_state: bundle.state.payment_state as PaymentState,
    subscription_state: deriveSubscriptionState(bundle.grace, now),
    grace: bundle.grace,
    retry_available: isRetryAvailable(bundle.state, bundle.grace),
  };
}
