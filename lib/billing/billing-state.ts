import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { internalDbError } from '@lib/billing/errors';

type Client = SupabaseClient<Database>;

export type BillingStateRow = Database['public']['Tables']['workspace_billing_state']['Row'];
export type PaymentState = 'paid' | 'payment_failed' | 'retry_pending' | 'recovered';
export type SubscriptionState = 'active_paid' | 'grace_period' | 'free_after_grace';

export interface GraceWindow {
  started_at: string
  ends_at: string
}

// A retry claim older than this is treated as abandoned (the request crashed
// or timed out without releasing it), so a stuck workspace is never locked out.
// Longer than the payment client's own request timeout plus its retries, so a
// slow-but-alive charge is never reclaimed underneath itself.
export const RETRY_CLAIM_STALE_MS = 5 * 60 * 1000;

// 2026-11-01 ruling: paid limits hold strictly BEFORE the grace end and the
// workspace is Free from that exact instant. Mirrors SQL bunkai_effective_plan.
export function deriveSubscriptionState(grace: GraceWindow | null, now: Date): SubscriptionState {
  if (!grace) {
    return 'active_paid';
  }
  return now.getTime() >= new Date(grace.ends_at).getTime() ? 'free_after_grace' : 'grace_period';
}

// Retry is offered only once the owner confirmed a replacement method AFTER the
// failure opened the grace window, and only while a renewal is actually failed.
export function isRetryAvailable(state: BillingStateRow, grace: GraceWindow | null): boolean {
  if (state.payment_state !== 'payment_failed' && state.payment_state !== 'retry_pending') {
    return false;
  }
  if (!state.failed_invoice_id || !grace || !state.payment_method_updated_at) {
    return false;
  }
  return new Date(state.payment_method_updated_at).getTime() > new Date(grace.started_at).getTime();
}

export interface BillingStateBundle {
  state: BillingStateRow
  grace: GraceWindow | null
}

// Reads through whichever client it is given: the caller's own RLS-scoped
// client for reads (owner/admin only; anyone else gets null), the admin client
// once the caller's ownership was verified in TypeScript.
export async function loadBillingState(client: Client, workspaceId: string): Promise<BillingStateBundle | null> {
  const { data: state, error } = await client
    .from('workspace_billing_state')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) {
    throw internalDbError('workspace_billing_state lookup failed', error);
  }
  if (!state) {
    return null;
  }
  const { data: grace, error: graceError } = await client
    .from('workspace_grace_periods')
    .select('started_at, ends_at')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (graceError) {
    throw internalDbError('workspace_grace_periods lookup failed', graceError);
  }
  return { state, grace: grace ?? null };
}

// The owner gate for every billing write. `bunkai_is_workspace_owner` answers
// false both for a workspace the caller does not own AND for one that does not
// exist, so every such caller gets the same 403 (no existence oracle, BK-829).
export async function assertBillingOwner(db: Client, workspaceId: string, action: string): Promise<void> {
  const ownerCheck = await db.rpc('bunkai_is_workspace_owner', { ws_id: workspaceId });
  if (ownerCheck.error) {
    throw internalDbError('bunkai_is_workspace_owner failed', ownerCheck.error);
  }
  if (!ownerCheck.data) {
    throw new ApiError('forbidden', `Only the workspace owner can ${action}.`, {
      details: { reason: 'not_workspace_owner' },
    });
  }
}

export function noActiveSubscription(): ApiError {
  return new ApiError('no_active_subscription', 'This workspace has no active paid subscription.', {
    details: { reason: 'no_active_subscription' },
  });
}

// Reads for owner/admin: RLS on workspace_billing_state is the authorization.
// A member, a Community workspace and another workspace all collapse into the
// same 404 so the endpoint discloses nothing.
export async function requireBillingReader(db: Client, workspaceId: string): Promise<BillingStateBundle> {
  const bundle = await loadBillingState(db, workspaceId);
  if (!bundle) {
    throw new ApiError('not_found', 'Billing not found.');
  }
  return bundle;
}
