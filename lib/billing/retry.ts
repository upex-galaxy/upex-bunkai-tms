import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { assertBillingOwner, isRetryAvailable, loadBillingState, noActiveSubscription, RETRY_CLAIM_STALE_MS } from '@lib/billing/billing-state';
import { internalDbError, isStripeCardError, toProcessorError } from '@lib/billing/errors';
import { getStripeClient } from '@lib/billing/stripe';
import { createAdminClient } from '@lib/supabase/admin';

type Client = SupabaseClient<Database>;

export interface RetryFailedRenewalArgs {
  db: Client
  workspaceId: string
}

export interface RetryFailedRenewalResult {
  status: 'recovered'
}

function retryNotAvailable(reason: string, message: string): ApiError {
  return new ApiError('retry_not_available', message, { details: { reason } });
}

// POST /billing/retry. Pays the invoice that opened the grace window with the
// customer's default method. Three guards protect against a duplicate attempt:
// the route's Idempotency-Key (a client replay), the atomic claim below (two
// tabs, two keys), and Stripe's own idempotency key, which carries the attempt
// number so a deliberate second try is a genuinely new attempt.
//
// "Retry success clears the warning only after provider confirmation": the
// state flips to recovered only when Stripe itself answers `paid`. A decline, a
// required action or a timeout releases the claim and leaves the failed state,
// the grace end date and the retry path exactly as they were. If a timed-out
// charge actually went through, Stripe's invoice.paid webhook reconciles it.
export async function retryFailedRenewal(args: RetryFailedRenewalArgs): Promise<RetryFailedRenewalResult> {
  const { db, workspaceId } = args;

  await assertBillingOwner(db, workspaceId, 'retry a failed renewal');

  const admin = createAdminClient();
  const bundle = await loadBillingState(admin, workspaceId);
  if (!bundle) {
    throw noActiveSubscription();
  }
  const { state, grace } = bundle;

  if (!state.failed_invoice_id || (state.payment_state !== 'payment_failed' && state.payment_state !== 'retry_pending')) {
    throw retryNotAvailable('no_failed_renewal', 'There is no failed renewal to retry.');
  }
  if (!isRetryAvailable(state, grace)) {
    throw retryNotAvailable('payment_method_not_replaced', 'Replace the payment method before retrying the charge.');
  }
  if (state.payment_state === 'retry_pending' && state.retry_started_at
    && Date.now() - new Date(state.retry_started_at).getTime() < RETRY_CLAIM_STALE_MS) {
    throw retryNotAvailable('retry_in_progress', 'A retry is already in progress for this workspace.');
  }

  const invoiceId = state.failed_invoice_id;
  const attempt = state.retry_attempts + 1;

  // Optimistic claim: only the request that still sees the attempt counter it
  // read wins. A concurrent request updates 0 rows and is refused.
  const { data: claimed, error: claimError } = await admin
    .from('workspace_billing_state')
    .update({ payment_state: 'retry_pending', retry_attempts: attempt, retry_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('retry_attempts', state.retry_attempts)
    .in('payment_state', ['payment_failed', 'retry_pending'])
    .select('workspace_id')
    .maybeSingle();
  if (claimError) {
    throw internalDbError('workspace_billing_state retry claim failed', claimError);
  }
  if (!claimed) {
    throw retryNotAvailable('retry_in_progress', 'A retry is already in progress for this workspace.');
  }

  const release = async () => {
    // Conditional on retry_pending: if the webhook already recorded the recovery
    // in the meantime, this must not drag the workspace back to failed.
    const { error } = await admin
      .from('workspace_billing_state')
      .update({ payment_state: 'payment_failed', retry_started_at: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('payment_state', 'retry_pending');
    if (error) {
      console.error('workspace_billing_state retry release failed', { workspaceId, error: error.message });
    }
  };

  let paid: boolean;
  try {
    // Look at the invoice before charging it. One already paid (a late or missed
    // webhook, or a payment made outside this screen) is recorded as the recovery
    // it is, and one that can no longer be collected is refused: charging it again
    // would only fail and leave the owner stuck behind a warning that cannot clear.
    const current = await getStripeClient().invoices.retrieve(invoiceId);
    if (current.status === 'void' || current.status === 'uncollectible') {
      throw retryNotAvailable('invoice_not_payable', 'The failed invoice can no longer be collected. Contact support to restore the plan.');
    }
    if (current.status === 'paid') {
      paid = true;
    }
    else {
      const invoice = await getStripeClient().invoices.pay(
        invoiceId,
        {},
        { idempotencyKey: `${workspaceId}:retry:${invoiceId}:${attempt}` },
      );
      paid = invoice.status === 'paid';
    }
  }
  catch (raw) {
    await release();
    if (raw instanceof ApiError) {
      throw raw;
    }
    if (isStripeCardError(raw)) {
      throw new ApiError('payment_declined', 'The payment was declined. Check the payment method and try again.', {
        details: { reason: 'card_declined' },
      });
    }
    throw toProcessorError(
      raw,
      'stripe invoice pay failed',
      { workspaceId, invoiceId },
      'We could not confirm the payment. If it went through, the warning clears on its own; otherwise try again in a moment.',
    );
  }

  if (!paid) {
    await release();
    throw new ApiError('payment_declined', 'The payment needs further action from the card issuer and was not completed. Try again or use another payment method.', {
      details: { reason: 'requires_action' },
    });
  }

  const { error: rpcError } = await admin.rpc('bunkai_apply_billing_invoice_event', {
    p_stripe_event_id: `retry:${invoiceId}:${attempt}`,
    p_event_type: 'invoice.paid',
    p_event_created: new Date().toISOString(),
    p_stripe_customer_id: state.stripe_customer_id,
    p_stripe_invoice_id: invoiceId,
    p_billing_reason: 'subscription_cycle',
  });
  if (rpcError) {
    // Stripe confirmed the payment; the invoice.paid webhook will record it.
    console.error('bunkai_apply_billing_invoice_event failed after a confirmed retry', { workspaceId, invoiceId, error: rpcError.message });
  }
  return { status: 'recovered' };
}
