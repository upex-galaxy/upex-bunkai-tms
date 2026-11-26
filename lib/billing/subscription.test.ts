import type { Mock } from 'bun:test';
import type { QueryCall } from './test-doubles';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { CUSTOMER_ID, fakeSupabase, ownerRpc, rejection, stateRow, WORKSPACE_ID } from './test-doubles';

void mock.module('server-only', () => ({}));

const stripeModule = await import('@lib/billing/stripe');
const adminModule = await import('@lib/supabase/admin');
const {
  cancelSubscription,
  confirmDowngrade,
  cancelsAtPeriodEnd,
  membersOverSeatLimit,
  periodEndOf,
  previewDowngrade,
  previewToken,
  resubscribe,
} = await import('./subscription');

const SUB_ID = 'sub_test_0001';
const PERIOD_END = '2026-12-31T00:00:00.000Z';

function projects(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name: `P${i + 1}`,
    created_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  }));
}

function members(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`,
    role: i === 0 ? 'owner' : 'member',
    joined_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  }));
}

interface SetupOptions {
  isOwner?: boolean
  plan?: string
  state?: Record<string, unknown> | null
  projectCount?: number
  memberCount?: number
  openCheckout?: boolean
  rpcError?: boolean
  rpcStatus?: string
}

let subscriptionsCancel: Mock<(id: string, params: unknown) => Promise<unknown>>;
let subscriptionsUpdate: Mock<(id: string, params: { cancel_at_period_end: boolean }, options: { idempotencyKey: string }) => Promise<unknown>>;
let spies: Array<{ mockRestore: () => void }>;

function setup(opts: SetupOptions = {}) {
  const projectRows = projects(opts.projectCount ?? 5);
  const memberRows = members(opts.memberCount ?? 3);
  const admin = fakeSupabase((call: QueryCall) => {
    switch (call.table) {
      case 'workspaces':
        return { data: { name: 'Acme QA', plan: opts.plan ?? 'cloud' }, error: null };
      case 'workspace_billing_state':
        return { data: opts.state === null ? null : stateRow({ cancel_at_period_end: false, current_period_end: PERIOD_END, ...opts.state }), error: null };
      case 'workspace_grace_periods':
        return { data: null, error: null };
      case 'projects':
        return { data: projectRows, error: null };
      case 'workspace_members':
        return { data: memberRows, error: null };
      case 'billing_checkout_sessions':
        return { data: opts.openCheckout ? { id: 'row' } : null, error: null };
      case 'runs':
        return { data: null, error: null };
      default:
        return undefined;
    }
  }, {
    bunkai_apply_billing_subscription_event: () => (opts.rpcError
      ? { data: null, error: { message: 'boom' } }
      : { data: { status: opts.rpcStatus ?? 'downgraded' }, error: null }),
    bunkai_project_ids_over_limit: args => ({ data: projectRows.slice(0, Math.max(0, projectRows.length - (args.p_limit as number))).map(p => p.id), error: null }),
  });
  spies = [
    spyOn(adminModule, 'createAdminClient').mockReturnValue(admin.client as never),
    spyOn(stripeModule, 'getStripeClient').mockReturnValue({ subscriptions: { cancel: subscriptionsCancel, update: subscriptionsUpdate } } as never),
  ];
  const caller = fakeSupabase(() => undefined, {
    ...ownerRpc(opts.isOwner ?? true),
    bunkai_chat_roster: () => ({ data: memberRows.map(m => ({ user_id: m.user_id, role: m.role, email: `${m.user_id.slice(-2)}@example.test` })), error: null }),
  });
  return { admin, caller, projectRows };
}

const rpcCalls = (admin: ReturnType<typeof fakeSupabase>) => admin.rpcCalls.filter(call => call.fn === 'bunkai_apply_billing_subscription_event');

beforeEach(() => {
  subscriptionsCancel = mock(async () => ({ id: SUB_ID, status: 'canceled' }));
  subscriptionsUpdate = mock(async (_id, params) => ({
    id: SUB_ID,
    cancel_at_period_end: params.cancel_at_period_end,
    cancel_at: params.cancel_at_period_end ? Date.parse(PERIOD_END) / 1000 : null,
    items: { data: [{ current_period_end: Date.parse(PERIOD_END) / 1000 }] },
  }));
  spies = [];
});
afterEach(() => { spies.forEach(spy => spy.mockRestore()); });

describe('membersOverSeatLimit', () => {
  test('should name the most recently joined non-owners beyond the Community cap (Scenario 1.3)', () => {
    const over = membersOverSeatLimit(members(8), 5);
    expect(over).toHaveLength(3);
    expect(over.every(m => m.role !== 'owner')).toBe(true);
    expect(over[0].joined_at > over[2].joined_at).toBe(true);
  });

  test('should name nobody at or under the cap', () => {
    expect(membersOverSeatLimit(members(5), 5)).toEqual([]);
  });
});

describe('previewToken, cancelsAtPeriodEnd and periodEndOf', () => {
  const consequences = {
    current_plan: 'cloud' as const,
    target_plan: 'community' as const,
    projects: { in_use: 5, limit: 3, read_only: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
    seats: { in_use: 3, limit: 5, over_limit: [] },
    retention: { current_days: 10, target_days: 30 },
  };

  test('previewToken changes when any consequence changes and is stable otherwise', () => {
    const base = previewToken(WORKSPACE_ID, consequences);
    expect(previewToken(WORKSPACE_ID, consequences)).toBe(base);
    expect(previewToken(WORKSPACE_ID, { ...consequences, projects: { ...consequences.projects, read_only: [{ id: 'a', name: 'A' }] } })).not.toBe(base);
    expect(previewToken(WORKSPACE_ID, { ...consequences, seats: { ...consequences.seats, in_use: 4 } })).not.toBe(base);
    expect(previewToken('other', consequences)).not.toBe(base);
    expect(base).toMatch(/^[\da-f]{64}$/);
  });

  test('cancelsAtPeriodEnd reads either Stripe field', () => {
    expect(cancelsAtPeriodEnd({ cancel_at_period_end: true, cancel_at: null })).toBe(true);
    expect(cancelsAtPeriodEnd({ cancel_at_period_end: false, cancel_at: 1798675200 })).toBe(true);
    expect(cancelsAtPeriodEnd({ cancel_at_period_end: false, cancel_at: null })).toBe(false);
  });

  test('periodEndOf prefers cancel_at, then the earliest item period end', () => {
    expect(periodEndOf({ cancel_at: 1798675200, items: { data: [] } })).toBe('2026-12-31T00:00:00.000Z');
    expect(periodEndOf({ cancel_at: null, items: { data: [{ current_period_end: 1798675200 }, { current_period_end: 1798761600 }] } })).toBe('2026-12-31T00:00:00.000Z');
    expect(periodEndOf({ cancel_at: null, items: { data: [] } })).toBeNull();
  });
});

describe('previewDowngrade', () => {
  test('should list the two oldest projects for 5 projects to Community, with a token (Scenario 1.1)', async () => {
    const { caller, admin } = setup();
    const preview = await previewDowngrade(caller.client, WORKSPACE_ID);
    expect(preview.projects.read_only.map(p => p.name)).toEqual(['P1', 'P2']);
    expect(admin.rpcCalls.find(call => call.fn === 'bunkai_project_ids_over_limit')?.args).toEqual({ p_workspace_id: WORKSPACE_ID, p_limit: 3 });
    expect(preview.preview_token).toMatch(/^[\da-f]{64}$/);
  });

  test('should block while a renewal is unpaid', async () => {
    const { caller } = setup({ state: { payment_state: 'payment_failed' } });
    expect((await previewDowngrade(caller.client, WORKSPACE_ID)).blocked_reason).toBe('payment_overdue');
  });

  test('should state nothing is read-only within the limit and carry the seat and retention effects (Scenario 1.2)', async () => {
    const { caller } = setup({ projectCount: 3, memberCount: 5 });
    const preview = await previewDowngrade(caller.client, WORKSPACE_ID);
    expect(preview.projects).toMatchObject({ in_use: 3, limit: 3, read_only: [] });
    expect(preview.seats).toMatchObject({ in_use: 5, limit: 5, over_limit: [] });
    expect(preview.retention.target_days).toBe(30);
    expect(preview.blocked_reason).toBeNull();
  });

  test('should block on members above the seat cap and name them (Scenario 1.3)', async () => {
    const { caller } = setup({ memberCount: 8 });
    const preview = await previewDowngrade(caller.client, WORKSPACE_ID);
    expect(preview.blocked_reason).toBe('seats_over_limit');
    expect(preview.seats.over_limit).toHaveLength(3);
    expect(preview.seats.over_limit[0].email).not.toBeNull();
  });

  test('should refuse a non-owner with the documented permission error (Scenario 5.2)', async () => {
    const { caller } = setup({ isOwner: false });
    const error = await rejection(previewDowngrade(caller.client, WORKSPACE_ID));
    expect(error.code).toBe('forbidden');
    expect(error.details).toEqual({ reason: 'not_workspace_owner' });
  });

  test('should answer no_active_subscription for a Community workspace', async () => {
    const { caller } = setup({ plan: 'community' });
    const error = await rejection(previewDowngrade(caller.client, WORKSPACE_ID));
    expect(error.code).toBe('no_active_subscription');
  });
});

describe('confirmDowngrade', () => {
  test('should end the subscription at Stripe, then apply the downgrade locally (Scenario 2.1)', async () => {
    const { admin, caller } = setup();
    const result = await confirmDowngrade(caller.client, WORKSPACE_ID, (await previewDowngrade(caller.client, WORKSPACE_ID)).preview_token);

    expect(result.status).toBe('downgraded');
    expect(result.read_only_projects.map(p => p.name)).toEqual(['P1', 'P2']);
    expect(subscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(subscriptionsCancel.mock.calls[0]).toEqual([SUB_ID, { prorate: false, invoice_now: false }]);
    expect(rpcCalls(admin)[0].args).toMatchObject({
      p_event_type: 'customer.subscription.deleted',
      p_stripe_customer_id: CUSTOMER_ID,
      p_stripe_subscription_id: SUB_ID,
      p_stripe_event_id: null,
    });
  });

  test('should answer downgrade_preview_stale when the read-only set changed, without calling Stripe', async () => {
    const { admin, caller } = setup();
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, 'f'.repeat(64)));
    expect(error.code).toBe('downgrade_preview_stale');
    expect(subscriptionsCancel).not.toHaveBeenCalled();
    expect(rpcCalls(admin)).toHaveLength(0);
  });

  test('should refuse while members are above the seat cap', async () => {
    const { caller } = setup({ memberCount: 8 });
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, 'f'.repeat(64)));
    expect(error.code).toBe('plan_change_not_available');
    expect((error.details as { reason: string }).reason).toBe('seats_over_limit');
    expect(subscriptionsCancel).not.toHaveBeenCalled();
  });

  test('should refuse while a checkout session is open (Scenario E3)', async () => {
    const { caller } = setup({ openCheckout: true });
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, 'f'.repeat(64)));
    expect((error.details as { reason: string }).reason).toBe('checkout_open');
  });

  test('should refuse while a cancellation is pending', async () => {
    const { caller } = setup({ state: { cancel_at_period_end: true } });
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, 'f'.repeat(64)));
    expect((error.details as { reason: string }).reason).toBe('cancellation_pending');
  });

  test('should leave local state unchanged when Stripe fails (Scenario E1)', async () => {
    subscriptionsCancel = mock(async () => { throw new Error('stripe down'); });
    const { admin, caller } = setup();
    const token = (await previewDowngrade(caller.client, WORKSPACE_ID)).preview_token;
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, token));
    expect(error.code).toBe('upstream_error');
    expect(rpcCalls(admin)).toHaveLength(0);
  });

  test('should treat a subscription the processor does not know as a failure, never a local downgrade', async () => {
    subscriptionsCancel = mock(async () => { throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' }); });
    const { admin, caller } = setup();
    const token = (await previewDowngrade(caller.client, WORKSPACE_ID)).preview_token;
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, token));
    expect(error.code).toBe('upstream_error');
    expect(rpcCalls(admin)).toHaveLength(0);
  });

  test('should refuse while a renewal is unpaid, before any Stripe call', async () => {
    const { caller } = setup({ state: { payment_state: 'payment_failed' } });
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, 'f'.repeat(64)));
    expect((error.details as { reason: string }).reason).toBe('payment_overdue');
    expect(subscriptionsCancel).not.toHaveBeenCalled();
  });

  test('should refuse a non-owner before any Stripe call (Scenario 5.2)', async () => {
    const { caller } = setup({ isOwner: false });
    const error = await rejection(confirmDowngrade(caller.client, WORKSPACE_ID, 'f'.repeat(64)));
    expect(error.code).toBe('forbidden');
    expect(subscriptionsCancel).not.toHaveBeenCalled();
  });
});

describe('cancelSubscription', () => {
  test('should schedule the cancel at period end and keep Cloud until then (Scenario 3.1)', async () => {
    const { admin, caller } = setup();
    const result = await cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000001');

    expect(result).toEqual({ status: 'cancel_scheduled', ends_at: PERIOD_END });
    expect(subscriptionsUpdate.mock.calls[0][1]).toEqual({ cancel_at_period_end: true });
    expect(subscriptionsUpdate.mock.calls[0][2].idempotencyKey).toBe(`${WORKSPACE_ID}:cancel:key-00000001`);
    expect(subscriptionsCancel).not.toHaveBeenCalled();
    expect(rpcCalls(admin)[0].args).toMatchObject({
      p_event_type: 'customer.subscription.updated',
      p_cancel_at_period_end: true,
      p_current_period_end: PERIOD_END,
    });
  });

  test('BK-2497: fires the owner notice hook once when this call scheduled the cancellation', async () => {
    const { caller } = setup({ rpcStatus: 'cancel_scheduled' });
    const onCancelScheduled = mock(() => {});
    await cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000011', { onCancelScheduled });
    expect(onCancelScheduled).toHaveBeenCalledTimes(1);
  });

  test('BK-2497: no notice when the webhook already scheduled it (the RPC answers updated)', async () => {
    const { caller } = setup({ rpcStatus: 'updated' });
    const onCancelScheduled = mock(() => {});
    const result = await cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000012', { onCancelScheduled });
    expect(result.status).toBe('cancel_scheduled');
    expect(onCancelScheduled).not.toHaveBeenCalled();
  });

  test('BK-2497: no notice on a second cancel, a Stripe failure or an unconfirmed cancel', async () => {
    const onCancelScheduled = mock(() => {});
    const pending = setup({ state: { cancel_at_period_end: true }, rpcStatus: 'cancel_scheduled' });
    await cancelSubscription(pending.caller.client, WORKSPACE_ID, 'key-00000013', { onCancelScheduled });
    spies.forEach(spy => spy.mockRestore());

    subscriptionsUpdate = mock(async () => { throw new Error('stripe down'); });
    const failing = setup({ rpcStatus: 'cancel_scheduled' });
    await rejection(cancelSubscription(failing.caller.client, WORKSPACE_ID, 'key-00000014', { onCancelScheduled }));
    spies.forEach(spy => spy.mockRestore());

    subscriptionsUpdate = mock(async () => ({ id: SUB_ID, cancel_at_period_end: false, cancel_at: null, items: { data: [] } }));
    const unconfirmed = setup({ rpcStatus: 'cancel_scheduled' });
    await rejection(cancelSubscription(unconfirmed.caller.client, WORKSPACE_ID, 'key-00000015', { onCancelScheduled }));

    expect(onCancelScheduled).not.toHaveBeenCalled();
  });

  test('should write nothing locally when the processor does not confirm the cancellation', async () => {
    subscriptionsUpdate = mock(async () => ({ id: SUB_ID, cancel_at_period_end: false, cancel_at: null, items: { data: [] } }));
    const { admin, caller } = setup();
    const error = await rejection(cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000008'));
    expect(error.code).toBe('upstream_error');
    expect(rpcCalls(admin)).toHaveLength(0);
  });

  test('should refuse to cancel while a renewal is unpaid', async () => {
    const { caller } = setup({ state: { payment_state: 'retry_pending' } });
    const error = await rejection(cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000009'));
    expect((error.details as { reason: string }).reason).toBe('payment_overdue');
    expect(subscriptionsUpdate).not.toHaveBeenCalled();
  });

  test('should be idempotent on a second cancel: same end date, no Stripe call (Scenario 3.3)', async () => {
    const { admin, caller } = setup({ state: { cancel_at_period_end: true } });
    const result = await cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000002');
    expect(result).toEqual({ status: 'cancel_scheduled', ends_at: PERIOD_END });
    expect(subscriptionsUpdate).not.toHaveBeenCalled();
    expect(rpcCalls(admin)).toHaveLength(0);
  });

  test('should leave local state unchanged when Stripe fails (Scenario E1)', async () => {
    subscriptionsUpdate = mock(async () => { throw new Error('stripe down'); });
    const { admin, caller } = setup();
    const error = await rejection(cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000003'));
    expect(error.code).toBe('upstream_error');
    expect(rpcCalls(admin)).toHaveLength(0);
  });

  test('should refuse an admin who is not the owner (Scenario 5.2)', async () => {
    const { caller } = setup({ isOwner: false });
    const error = await rejection(cancelSubscription(caller.client, WORKSPACE_ID, 'key-00000004'));
    expect(error.code).toBe('forbidden');
    expect(subscriptionsUpdate).not.toHaveBeenCalled();
  });
});

describe('resubscribe', () => {
  test('should revert a pending cancellation through Stripe with no new charge (Scenario 4.1)', async () => {
    const { admin, caller } = setup({ state: { cancel_at_period_end: true } });
    const result = await resubscribe(caller.client, WORKSPACE_ID, 'key-00000005', new Date('2026-12-20T00:00:00.000Z'));

    expect(result).toEqual({ status: 'resumed', renews_at: PERIOD_END });
    expect(subscriptionsUpdate.mock.calls[0][1]).toEqual({ cancel_at_period_end: false });
    expect(rpcCalls(admin)[0].args).toMatchObject({ p_cancel_at_period_end: false });
  });

  test('should not offer resubscribe after the period ended (Scenario 4.2)', async () => {
    const { caller } = setup({ state: { cancel_at_period_end: true } });
    const error = await rejection(resubscribe(caller.client, WORKSPACE_ID, 'key-00000006', new Date('2027-01-02T00:00:00.000Z')));
    expect(error.code).toBe('resubscribe_not_available');
    expect((error.details as { reason: string }).reason).toBe('period_ended');
    expect(subscriptionsUpdate).not.toHaveBeenCalled();
  });

  test('should write nothing locally when the processor still reports the cancellation', async () => {
    subscriptionsUpdate = mock(async () => ({ id: SUB_ID, cancel_at_period_end: true, cancel_at: null, items: { data: [] } }));
    const { admin, caller } = setup({ state: { cancel_at_period_end: true } });
    const error = await rejection(resubscribe(caller.client, WORKSPACE_ID, 'key-00000010', new Date('2026-12-20T00:00:00.000Z')));
    expect(error.code).toBe('upstream_error');
    expect(rpcCalls(admin)).toHaveLength(0);
  });

  test('should answer resubscribe_not_available with nothing pending', async () => {
    const { caller } = setup();
    const error = await rejection(resubscribe(caller.client, WORKSPACE_ID, 'key-00000007'));
    expect((error.details as { reason: string }).reason).toBe('no_pending_cancellation');
  });
});
