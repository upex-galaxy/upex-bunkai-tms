import type { SeatQuantityBounds } from '@lib/billing/seat-quantity';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { resolveSeatQuantityBounds } from '@lib/billing/seat-quantity';
import { getStripeClient, getStripeCloudPriceId } from '@lib/billing/stripe';
import { env } from '@lib/env';
import { createAdminClient } from '@lib/supabase/admin';
import { getWorkspaceBillingOverview } from '@lib/supabase/rpc';

type Client = SupabaseClient<Database>;

const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60; // Stripe's own floor (30 min–24h, default 24h).

// Conductor review (PR #208) item 3 — MAJOR: the RLS INSERT/UPDATE policies
// on billing_checkout_sessions let the owner write this table DIRECTLY via
// PostgREST, including PATCHing their own `status` from `open` to
// `canceled` to bypass the one-open-session-per-workspace guard entirely
// (start a second, independently payable Checkout Session). Migration 0077
// dropped those policies; every write to this table now goes through
// `createAdminClient()` instead of the caller's RLS-scoped client. This does
// NOT weaken authorization — both routes calling into this module already
// verify ownership (workspace:admin + assertWorkspaceContext +
// bunkai_is_workspace_owner) in TypeScript before any of these functions run.
// billing_checkout_sessions' SELECT policy still rides owner-only RLS
// (harmless, kept for parity with idempotency_keys' posture) — but every
// read AND write in this module uses `admin` once past the owner check
// below, for the same reason: the caller's authorization was already
// established via `db.rpc('bunkai_is_workspace_owner', ...)` before any
// table access, so there is nothing left for RLS to additionally prove here.

// A row created recently enough that another in-flight request might still
// be mid-Stripe-call for it (crash-window handling below) is treated as
// "still in progress", not stale. Anything older is abandoned.
const IN_FLIGHT_GRACE_MS = 2 * 60 * 1000;

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
// here via bunkai_is_workspace_owner, using the caller's own RLS-scoped
// client — defense in depth: this runs BEFORE any Stripe call, so an
// unauthorized caller never causes a Stripe session to be created at all).
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

  const admin = createAdminClient();

  const existing = await reuseOpenCheckoutSession(admin, workspaceId, seatQuantity);
  if (existing) {
    return existing;
  }

  // Review item 2 (MAJOR) — insert the local row BEFORE calling Stripe. Its
  // own `id` becomes the Stripe session's `client_reference_id`, so the
  // webhook can always find this row back even if the app crashes between
  // creating the Stripe session and backfilling `stripe_checkout_session_id`
  // onto it (below). This is also the E1 race point now: a losing insert
  // here (23505) means NO Stripe session was ever created for the loser —
  // no orphaned payable session to worry about, unlike the pre-review
  // ordering.
  const expiresAtUnix = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS;
  const { data: insertedRow, error: insertError } = await admin
    .from('billing_checkout_sessions')
    .insert({
      workspace_id: workspaceId,
      created_by_user_id: userId,
      target_plan: 'cloud',
      seat_quantity: seatQuantity,
      stripe_checkout_session_id: null,
      status: 'open',
      idempotency_key: idempotencyKey,
      expires_at: new Date(expiresAtUnix * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (insertError || !insertedRow) {
    if (insertError?.code === '23505') {
      throw new ApiError('checkout_in_progress', 'A checkout session is already in progress for this workspace.', {
        details: { reason: 'checkout_already_open' },
      });
    }
    throw new ApiError('internal_error', insertError?.message ?? 'Failed to start checkout.');
  }

  let session: Awaited<ReturnType<ReturnType<typeof getStripeClient>['checkout']['sessions']['create']>>;
  try {
    session = await getStripeClient().checkout.sessions.create(
      {
        mode: 'subscription',
        // Review item 1 (BLOCKER, belt-and-braces): pin the accepted payment
        // methods to card only. Stripe's automatic payment methods default
        // includes delayed-notification methods (SEPA, Bacs, ACH, Boleto,
        // Konbini, ...) whose `checkout.session.completed` fires with
        // `payment_status: 'unpaid'` — the webhook RPC's own `payment_status
        // === 'paid'` gate is the real fix, this narrows what a customer can
        // even select in the first place.
        payment_method_types: ['card'],
        line_items: [{ price: getStripeCloudPriceId(), quantity: seatQuantity }],
        expires_at: expiresAtUnix,
        client_reference_id: insertedRow.id,
        metadata: {
          workspace_id: workspaceId,
          target_plan: 'cloud',
          seat_quantity: String(seatQuantity),
          initiated_by_user_id: userId,
          billing_checkout_session_row_id: insertedRow.id,
        },
        success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?upgraded=1`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing/upgrade?checkout=canceled&session_id={CHECKOUT_SESSION_ID}`,
      },
      // Namespaced by workspace: Stripe's idempotency key space is
      // ACCOUNT-GLOBAL, unlike our own `(user_id, endpoint, key)`-scoped
      // `idempotency_keys` table — passing the caller-chosen key straight
      // through would let two different workspaces collide if they ever
      // reused the same client-generated UUID (astronomically unlikely, but
      // free to close).
      { idempotencyKey: `${workspaceId}:${idempotencyKey}` },
    );
  }
  catch (raw) {
    // Stripe call failed — release the lock this row was holding so the
    // owner is not stranded, then surface the failure.
    await admin.from('billing_checkout_sessions').update({ status: 'expired' }).eq('id', insertedRow.id).eq('status', 'open');
    throw raw instanceof Error
      ? new ApiError('internal_error', `Stripe checkout session creation failed: ${raw.message}`)
      : new ApiError('internal_error', 'Stripe checkout session creation failed.');
  }

  if (!session.url) {
    await admin.from('billing_checkout_sessions').update({ status: 'expired' }).eq('id', insertedRow.id).eq('status', 'open');
    throw new ApiError('internal_error', 'Stripe did not return a checkout URL.');
  }

  const { error: backfillError } = await admin
    .from('billing_checkout_sessions')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', insertedRow.id);
  if (backfillError) {
    // Non-fatal — the row is still fully resolvable by the webhook via
    // `client_reference_id` (= insertedRow.id, already sent to Stripe
    // above). Log so a persistent failure here is visible, but the owner's
    // checkout is not blocked by a bookkeeping write.
    console.error('failed to backfill stripe_checkout_session_id', { rowId: insertedRow.id, sessionId: session.id, error: backfillError.message });
  }

  return { url: session.url };
}

async function reuseOpenCheckoutSession(
  admin: Client,
  workspaceId: string,
  requestedSeatQuantity: number,
): Promise<BeginBillingCheckoutResult | null> {
  const { data: openRow, error } = await admin
    .from('billing_checkout_sessions')
    .select('id, stripe_checkout_session_id, seat_quantity, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!openRow) {
    return null;
  }

  if (!openRow.stripe_checkout_session_id) {
    // The row exists but the Stripe call that should have backfilled its
    // session id never finished (app crash, or it is still running RIGHT
    // now in a concurrent request). Cannot ask Stripe about a session id we
    // do not have — decide from age alone.
    const ageMs = Date.now() - new Date(openRow.created_at).getTime();
    if (ageMs < IN_FLIGHT_GRACE_MS) {
      throw new ApiError('checkout_in_progress', 'A checkout session is already in progress for this workspace.', {
        details: { reason: 'checkout_already_open' },
      });
    }
    await admin.from('billing_checkout_sessions').update({ status: 'expired' }).eq('id', openRow.id).eq('status', 'open');
    return null;
  }

  // Review "worth doing" — a stale open session for a DIFFERENT seat
  // quantity than what the owner is asking for now must not be silently
  // reused (they would be charged for the old quantity while the UI showed
  // the new one). Point them at the cancel endpoint instead of guessing.
  if (openRow.seat_quantity !== requestedSeatQuantity) {
    throw new ApiError('checkout_in_progress', 'A checkout session for a different seat quantity is already in progress. Cancel it before starting a new one.', {
      details: { reason: 'checkout_seat_quantity_mismatch', open_seat_quantity: openRow.seat_quantity, requested_seat_quantity: requestedSeatQuantity },
    });
  }

  const stripeSession = await getStripeClient().checkout.sessions.retrieve(openRow.stripe_checkout_session_id);

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
  const { error: expireError } = await admin
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
//
// EXPLICIT owner check required here (review item 3 fallout, caught while
// implementing its fix): dropping billing_checkout_sessions' RLS
// INSERT/UPDATE policies means the caller's own `db` client is no longer
// what scopes this write — nothing did, before this check existed, since
// `workspace:admin` + `assertWorkspaceContext` are BOTH no-ops for a cookie
// session (ADR-0006: cookie sessions hold every capability and were always
// meant to be gated by RLS instead, "trusted UI" — the exact RLS this
// function no longer rides). Without this call, ANY member of the
// workspace, not just the owner, could cancel the owner's in-progress
// checkout. Mirrors beginBillingCheckout's identical gate — reads through
// the caller's own RLS-scoped `db`, all writes below stay on `admin`.
export async function cancelBillingCheckout(args: CancelBillingCheckoutArgs): Promise<void> {
  const { db, workspaceId } = args;

  const ownerCheck = await db.rpc('bunkai_is_workspace_owner', { ws_id: workspaceId });
  if (ownerCheck.error) {
    throw new ApiError('internal_error', ownerCheck.error.message);
  }
  if (!ownerCheck.data) {
    throw new ApiError('forbidden', 'Only the workspace owner can cancel a plan upgrade.', {
      details: { reason: 'not_workspace_owner' },
    });
  }

  const admin = createAdminClient();

  const { data: openRow, error } = await admin
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

  if (openRow.stripe_checkout_session_id) {
    try {
      await getStripeClient().checkout.sessions.expire(openRow.stripe_checkout_session_id);
    }
    catch {
      // Already expired/completed on Stripe's side — not fatal, we still
      // release our own lock below.
    }
  }

  const { error: updateError } = await admin
    .from('billing_checkout_sessions')
    .update({ status: 'canceled' })
    .eq('id', openRow.id)
    .eq('status', 'open');
  if (updateError) {
    throw new ApiError('internal_error', updateError.message);
  }
}
