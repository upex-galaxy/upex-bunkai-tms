import type { SeatQuantityBounds } from '@lib/billing/seat-quantity';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { resolveSeatQuantityBounds } from '@lib/billing/seat-quantity';
import { getStripeClient, getStripeCloudPriceId } from '@lib/billing/stripe';
import { env } from '@lib/env';
import { getWorkspaceBillingOverview } from '@lib/supabase/rpc';

type Client = SupabaseClient<Database>;

const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60; // Stripe's own floor (30 min–24h, default 24h).

export { resolveSeatQuantityBounds };

export function validateSeatQuantity(seatQuantity: number, bounds: SeatQuantityBounds): void {
  if (bounds.min > bounds.max) {
    throw new ApiError(
      'seat_quantity_invalid',
      `This workspace already has more active members (${bounds.min}) than the Cloud plan's seat cap (${bounds.max}). Contact sales.`,
      { details: { reason: 'active_seats_exceed_cloud_cap', min: bounds.min, max: bounds.max } },
    );
  }
  if (!Number.isInteger(seatQuantity) || seatQuantity < bounds.min || seatQuantity > bounds.max) {
    throw new ApiError(
      'seat_quantity_invalid',
      `Seat quantity must be a whole number between ${bounds.min} and ${bounds.max}.`,
      { details: { reason: 'seat_quantity_out_of_bounds', min: bounds.min, max: bounds.max } },
    );
  }
}

interface WorkspaceBillingOverviewShape {
  plan: string
  active_seats: number
}

function isWorkspaceBillingOverviewShape(value: unknown): value is WorkspaceBillingOverviewShape {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.plan === 'string' && typeof v.active_seats === 'number';
}

export interface BeginBillingCheckoutArgs {
  db: Client
  workspaceId: string
  userId: string
  seatQuantity: number
  idempotencyKey: string
}

export interface BeginBillingCheckoutResult {
  url: string
}

// BK-230 — the checkout POST route's business logic. Owner-only (verified
// here via bunkai_is_workspace_owner, the same RLS helper the DB insert
// below re-checks — defense in depth, not redundancy: this call happens
// BEFORE any Stripe API call, so an unauthorized caller never causes a
// Stripe session to be created at all).
export async function beginBillingCheckout(args: BeginBillingCheckoutArgs): Promise<BeginBillingCheckoutResult> {
  const { db, workspaceId, userId, seatQuantity, idempotencyKey } = args;

  const ownerCheck = await db.rpc('bunkai_is_workspace_owner', { ws_id: workspaceId });
  if (ownerCheck.error) {
    throw new ApiError('internal_error', ownerCheck.error.message);
  }
  if (!ownerCheck.data) {
    throw new ApiError('forbidden', 'Only the workspace owner can start a plan upgrade.', {
      details: { reason: 'not_workspace_owner' },
    });
  }

  const { data: overviewData, error: overviewError } = await getWorkspaceBillingOverview(db, workspaceId);
  if (overviewError) {
    throw new ApiError('internal_error', overviewError.message);
  }
  if (!overviewData || !isWorkspaceBillingOverviewShape(overviewData)) {
    throw new ApiError('not_found', 'Workspace not found.');
  }

  if (overviewData.plan !== 'community') {
    throw new ApiError('plan_not_upgradable', 'This workspace is already on Cloud or Enterprise.', {
      details: { reason: 'not_on_community_plan', current_plan: overviewData.plan },
    });
  }

  validateSeatQuantity(seatQuantity, resolveSeatQuantityBounds(overviewData.active_seats));

  const stripe = getStripeClient();

  const existing = await reuseOpenCheckoutSession(db, stripe, workspaceId);
  if (existing) {
    return existing;
  }

  const expiresAtUnix = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [{ price: getStripeCloudPriceId(), quantity: seatQuantity }],
      expires_at: expiresAtUnix,
      metadata: {
        workspace_id: workspaceId,
        target_plan: 'cloud',
        seat_quantity: String(seatQuantity),
        initiated_by_user_id: userId,
      },
      success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?upgraded=1`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing/upgrade?checkout=canceled&session_id={CHECKOUT_SESSION_ID}`,
    },
    { idempotencyKey },
  );

  if (!session.url) {
    throw new ApiError('internal_error', 'Stripe did not return a checkout URL.');
  }

  const { error: insertError } = await db
    .from('billing_checkout_sessions')
    .insert({
      workspace_id: workspaceId,
      created_by_user_id: userId,
      target_plan: 'cloud',
      seat_quantity: seatQuantity,
      stripe_checkout_session_id: session.id,
      status: 'open',
      idempotency_key: idempotencyKey,
      expires_at: new Date(expiresAtUnix * 1000).toISOString(),
    });

  if (insertError) {
    // 23505 = unique_violation — lost the race against a concurrent request
    // for the SAME workspace on the one-open-session partial unique index
    // (E1). The Stripe session created above is orphaned but harmless: it
    // expires unused in 30 minutes and was never linked to any row a client
    // could retry against.
    if (insertError.code === '23505') {
      throw new ApiError('checkout_in_progress', 'A checkout session is already in progress for this workspace.', {
        details: { reason: 'checkout_already_open' },
      });
    }
    throw new ApiError('internal_error', insertError.message);
  }

  return { url: session.url };
}

async function reuseOpenCheckoutSession(
  db: Client,
  stripe: ReturnType<typeof getStripeClient>,
  workspaceId: string,
): Promise<BeginBillingCheckoutResult | null> {
  const { data: openRow, error } = await db
    .from('billing_checkout_sessions')
    .select('id, stripe_checkout_session_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!openRow) {
    return null;
  }

  const stripeSession = await stripe.checkout.sessions.retrieve(openRow.stripe_checkout_session_id);

  if (stripeSession.status === 'open' && stripeSession.url) {
    return { url: stripeSession.url };
  }

  if (stripeSession.status === 'complete') {
    // The webhook has not landed yet, but Stripe already has the payment.
    // Creating a second session here would risk a double charge — refuse
    // instead, the same shape as the E1 race guard.
    throw new ApiError('checkout_in_progress', 'A payment for this workspace has already completed and is being activated.', {
      details: { reason: 'checkout_already_completed' },
    });
  }

  // expired (or any other terminal state): release the lock so a fresh
  // session can be created below. checkout.session.expired will also do
  // this via the webhook — this covers the gap before that delivery lands.
  const { error: expireError } = await db
    .from('billing_checkout_sessions')
    .update({ status: 'expired' })
    .eq('id', openRow.id)
    .eq('status', 'open');
  if (expireError) {
    throw new ApiError('internal_error', expireError.message);
  }
  return null;
}

export interface CancelBillingCheckoutArgs {
  db: Client
  workspaceId: string
}

// BK-230 — called when the owner lands back on the upgrade screen from
// Stripe's cancel_url. Expires the Stripe session server-side (best-effort —
// an already-expired/completed session throws, which we swallow: the goal is
// just to free the one-open-session lock) and flips the row to canceled.
export async function cancelBillingCheckout(args: CancelBillingCheckoutArgs): Promise<void> {
  const { db, workspaceId } = args;

  const { data: openRow, error } = await db
    .from('billing_checkout_sessions')
    .select('id, stripe_checkout_session_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!openRow) {
    return;
  }

  try {
    await getStripeClient().checkout.sessions.expire(openRow.stripe_checkout_session_id);
  }
  catch {
    // Already expired/completed on Stripe's side — not fatal, we still
    // release our own lock below.
  }

  const { error: updateError } = await db
    .from('billing_checkout_sessions')
    .update({ status: 'canceled' })
    .eq('id', openRow.id)
    .eq('status', 'open');
  if (updateError) {
    throw new ApiError('internal_error', updateError.message);
  }
}
