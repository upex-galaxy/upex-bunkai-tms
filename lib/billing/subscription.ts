import type { BillingStateRow } from '@lib/billing/billing-state';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { ApiError } from '@lib/api/error-envelope';
import { assertBillingOwner, loadBillingState, noActiveSubscription } from '@lib/billing/billing-state';
import { internalDbError, isStripeMissingResource, toProcessorError } from '@lib/billing/errors';
import { PLAN_TIERS } from '@lib/billing/plan-tiers';
import { getStripeClient } from '@lib/billing/stripe';
import { createAdminClient } from '@lib/supabase/admin';
import { chatRoster } from '@lib/supabase/rpc';

// Every Stripe call precedes any local write, so a Stripe failure leaves the workspace as it was.
type Client = SupabaseClient<Database>;

export interface ReadOnlyProjectRef {
  id: string
  name: string
}

export interface SeatConflictMember {
  user_id: string
  email: string | null
}

export type DowngradeBlockReason = 'seats_over_limit' | 'cancellation_pending' | 'checkout_open';

export interface DowngradePreview {
  workspace_name: string
  current_plan: 'cloud'
  target_plan: 'community'
  projects: { in_use: number, limit: number, read_only: ReadOnlyProjectRef[] }
  seats: { in_use: number, limit: number, over_limit: SeatConflictMember[] }
  retention: { current_days: number | null, target_days: number | null }
  blocked_reason: DowngradeBlockReason | null
}

export interface ProjectRow {
  id: string
  name: string
  created_at: string
}

export interface MemberRow {
  user_id: string
  role: string
  joined_at: string
}

// Same order as SQL bunkai_read_only_project_ids (created_at, then id), so preview and lock agree.
export function projectsBecomingReadOnly(projects: ProjectRow[], limit: number | null): ReadOnlyProjectRef[] {
  if (limit === null) {
    return [];
  }
  const sorted = [...projects].sort((a, b) => {
    const byDate = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (byDate !== 0) {
      return byDate;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const over = Math.max(0, sorted.length - limit);
  return sorted.slice(0, over).map(p => ({ id: p.id, name: p.name }));
}

// Seats are people, not data: they are never made read-only, the downgrade waits for the owner (PO ruling 2026-11-19).
export function membersOverSeatLimit(members: MemberRow[], limit: number | null): MemberRow[] {
  if (limit === null || members.length <= limit) {
    return [];
  }
  const nonOwners = members
    .filter(m => m.role !== 'owner')
    .sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime());
  return nonOwners.slice(0, members.length - limit);
}

export function sameProjectSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  return b.every(id => set.has(id));
}

function planChangeNotAvailable(reason: string, message: string, extra: Record<string, unknown> = {}): ApiError {
  return new ApiError('plan_change_not_available', message, { details: { reason, ...extra } });
}

interface Context {
  admin: Client
  state: BillingStateRow
  workspaceName: string
}

async function loadCloudContext(db: Client, workspaceId: string, action: string): Promise<Context> {
  await assertBillingOwner(db, workspaceId, action);
  const admin = createAdminClient();
  const { data: workspace, error } = await admin
    .from('workspaces')
    .select('name, plan')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) {
    throw internalDbError('workspaces lookup failed', error);
  }
  if (!workspace) {
    throw new ApiError('not_found', 'Workspace not found.');
  }
  const bundle = await loadBillingState(admin, workspaceId);
  if (workspace.plan !== 'cloud' || !bundle || !bundle.state.stripe_subscription_id) {
    throw noActiveSubscription();
  }
  return { admin, state: bundle.state, workspaceName: workspace.name };
}

async function buildPreview(db: Client, workspaceId: string, ctx: Context): Promise<DowngradePreview> {
  const { admin, state } = ctx;
  const target = PLAN_TIERS.community;
  const [projects, members, roster, openCheckout, oldestRun] = await Promise.all([
    admin.from('projects').select('id, name, created_at').eq('workspace_id', workspaceId),
    admin.from('workspace_members').select('user_id, role, joined_at').eq('workspace_id', workspaceId).eq('status', 'active'),
    chatRoster(db, { workspaceId }),
    admin.from('billing_checkout_sessions').select('id').eq('workspace_id', workspaceId).eq('status', 'open').maybeSingle(),
    admin.from('runs').select('created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (projects.error) {
    throw internalDbError('projects lookup failed', projects.error);
  }
  if (members.error) {
    throw internalDbError('workspace_members lookup failed', members.error);
  }
  if (openCheckout.error) {
    throw internalDbError('billing_checkout_sessions lookup failed', openCheckout.error);
  }

  const emails = new Map((roster.data ?? []).map(row => [row.user_id, row.email]));
  const activeMembers = members.data ?? [];
  const over = membersOverSeatLimit(activeMembers, target.seatLimit);
  const oldest = oldestRun.data?.created_at ?? null;
  const currentDays = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000) : null;

  let blocked: DowngradeBlockReason | null = null;
  if (state.cancel_at_period_end) {
    blocked = 'cancellation_pending';
  }
  else if (openCheckout.data) {
    blocked = 'checkout_open';
  }
  else if (over.length > 0) {
    blocked = 'seats_over_limit';
  }

  return {
    workspace_name: ctx.workspaceName,
    current_plan: 'cloud',
    target_plan: 'community',
    projects: {
      in_use: (projects.data ?? []).length,
      limit: target.projectLimit ?? 0,
      read_only: projectsBecomingReadOnly(projects.data ?? [], target.projectLimit),
    },
    seats: {
      in_use: activeMembers.length,
      limit: target.seatLimit ?? 0,
      over_limit: over.map(m => ({ user_id: m.user_id, email: emails.get(m.user_id) ?? null })),
    },
    retention: { current_days: currentDays, target_days: target.retentionDays },
    blocked_reason: blocked,
  };
}

export async function previewDowngrade(db: Client, workspaceId: string): Promise<DowngradePreview> {
  const ctx = await loadCloudContext(db, workspaceId, 'change the plan');
  return buildPreview(db, workspaceId, ctx);
}

function refuseBlocked(preview: DowngradePreview): void {
  if (preview.blocked_reason === 'cancellation_pending') {
    throw planChangeNotAvailable('cancellation_pending', 'Plan changes pause while a cancellation is pending. Resubscribe first.');
  }
  if (preview.blocked_reason === 'checkout_open') {
    throw planChangeNotAvailable('checkout_open', 'A checkout is in progress for this workspace. Finish or cancel it first.');
  }
  if (preview.blocked_reason === 'seats_over_limit') {
    throw planChangeNotAvailable(
      'seats_over_limit',
      `This workspace has ${preview.seats.in_use} active members and Community allows ${preview.seats.limit}. Remove members before downgrading.`,
      { seats: preview.seats },
    );
  }
}

function applyRpc(admin: Client, args: {
  eventType: 'customer.subscription.updated' | 'customer.subscription.deleted'
  state: BillingStateRow
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}) {
  return admin.rpc('bunkai_apply_billing_subscription_event', {
    p_stripe_event_id: null as unknown as string,
    p_event_type: args.eventType,
    p_event_created: new Date().toISOString(),
    p_stripe_customer_id: args.state.stripe_customer_id,
    p_stripe_subscription_id: args.state.stripe_subscription_id as string,
    p_cancel_at_period_end: args.cancelAtPeriodEnd,
    p_current_period_end: args.currentPeriodEnd as string,
  });
}

export interface DowngradeResult {
  status: 'downgraded'
  plan: 'community'
  read_only_projects: ReadOnlyProjectRef[]
}

// The confirm must match the live read-only set, so a project created or deleted since the preview is caught.
export async function confirmDowngrade(db: Client, workspaceId: string, expectedReadOnlyIds: string[]): Promise<DowngradeResult> {
  const ctx = await loadCloudContext(db, workspaceId, 'change the plan');
  const preview = await buildPreview(db, workspaceId, ctx);
  refuseBlocked(preview);
  if (!sameProjectSet(preview.projects.read_only.map(p => p.id), expectedReadOnlyIds)) {
    throw new ApiError('downgrade_preview_stale', 'The projects affected by this downgrade changed. Review the preview again.', {
      details: { reason: 'preview_changed', preview },
    });
  }

  const subscriptionId = ctx.state.stripe_subscription_id as string;
  try {
    await getStripeClient().subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false });
  }
  catch (raw) {
    if (!isStripeMissingResource(raw)) {
      throw toProcessorError(raw, 'stripe subscription cancel failed', { workspaceId });
    }
  }

  const { error } = await applyRpc(ctx.admin, {
    eventType: 'customer.subscription.deleted',
    state: ctx.state,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });
  if (error) {
    throw internalDbError('bunkai_apply_billing_subscription_event (downgrade) failed', error);
  }
  return { status: 'downgraded', plan: 'community', read_only_projects: preview.projects.read_only };
}

// Stripe keeps the period end on the subscription items; `cancel_at` is set once a cancellation is scheduled.
export function periodEndOf(subscription: Pick<Stripe.Subscription, 'cancel_at'> & { items?: { data?: Array<{ current_period_end?: number | null }> } }): string | null {
  const ends = (subscription.items?.data ?? [])
    .map(item => item.current_period_end)
    .filter((value): value is number => typeof value === 'number');
  const seconds = subscription.cancel_at ?? (ends.length > 0 ? Math.min(...ends) : null);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

export interface CancelResult {
  status: 'cancel_scheduled'
  ends_at: string | null
}

export async function cancelSubscription(db: Client, workspaceId: string, idempotencyKey: string): Promise<CancelResult> {
  const ctx = await loadCloudContext(db, workspaceId, 'cancel the subscription');
  if (ctx.state.cancel_at_period_end) {
    return { status: 'cancel_scheduled', ends_at: ctx.state.current_period_end };
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await getStripeClient().subscriptions.update(
      ctx.state.stripe_subscription_id as string,
      { cancel_at_period_end: true },
      { idempotencyKey: `${workspaceId}:cancel:${idempotencyKey}` },
    );
  }
  catch (raw) {
    throw toProcessorError(raw, 'stripe subscription cancel_at_period_end failed', { workspaceId });
  }

  const endsAt = periodEndOf(subscription) ?? ctx.state.current_period_end;
  const { error } = await applyRpc(ctx.admin, {
    eventType: 'customer.subscription.updated',
    state: ctx.state,
    cancelAtPeriodEnd: true,
    currentPeriodEnd: endsAt,
  });
  if (error) {
    throw internalDbError('bunkai_apply_billing_subscription_event (cancel) failed', error);
  }
  return { status: 'cancel_scheduled', ends_at: endsAt };
}

export interface ResubscribeResult {
  status: 'resumed'
  renews_at: string | null
}

export async function resubscribe(db: Client, workspaceId: string, idempotencyKey: string, now: Date = new Date()): Promise<ResubscribeResult> {
  const ctx = await loadCloudContext(db, workspaceId, 'resubscribe');
  if (!ctx.state.cancel_at_period_end) {
    throw new ApiError('resubscribe_not_available', 'This subscription has no pending cancellation.', {
      details: { reason: 'no_pending_cancellation' },
    });
  }
  if (ctx.state.current_period_end && now.getTime() >= new Date(ctx.state.current_period_end).getTime()) {
    throw new ApiError('resubscribe_not_available', 'The paid period has ended. Upgrade again to restore the plan.', {
      details: { reason: 'period_ended' },
    });
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await getStripeClient().subscriptions.update(
      ctx.state.stripe_subscription_id as string,
      { cancel_at_period_end: false },
      { idempotencyKey: `${workspaceId}:resubscribe:${idempotencyKey}` },
    );
  }
  catch (raw) {
    throw toProcessorError(raw, 'stripe subscription resume failed', { workspaceId });
  }

  const renewsAt = periodEndOf({ ...subscription, cancel_at: null }) ?? ctx.state.current_period_end;
  const { error } = await applyRpc(ctx.admin, {
    eventType: 'customer.subscription.updated',
    state: ctx.state,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: renewsAt,
  });
  if (error) {
    throw internalDbError('bunkai_apply_billing_subscription_event (resubscribe) failed', error);
  }
  return { status: 'resumed', renews_at: renewsAt };
}
