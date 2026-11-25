import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { installFetchDouble, jsonResponse } from './billing-test-support';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let searchParams = new URLSearchParams();
const replaced: string[] = [];
void mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => { replaced.push(href); } }),
  useSearchParams: () => searchParams,
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
void mock.module('next/link', () => ({
  default: ({ children, ...rest }: { href: string, children?: unknown }) => createElement('a', rest, children as never),
}));
const { BillingOverviewView } = await import('@components/billing/BillingOverviewView');

const { blockedReasonCopy, readOnlySummary } = await import('@components/billing/PlanChangeControls');

const WS = '11111111-1111-4111-8111-111111111111';
const PERIOD_END = '2026-12-31T00:00:00.000Z';

function billingBlock(overrides: Record<string, unknown> = {}) {
  return {
    can_edit: true,
    profile: null,
    payment_method: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028 },
    payment_method_updated_at: null,
    payment_state: 'paid',
    subscription_state: 'active_paid',
    grace: null,
    retry_available: false,
    has_subscription: true,
    cancel_at_period_end: false,
    current_period_end: PERIOD_END,
    ...overrides,
  };
}

function overview(overrides: Record<string, unknown> = {}) {
  return { plan: 'cloud', stored_plan: 'cloud', grace_ends_at: null, billing: billingBlock(), purchased_seats: 10, active_seats: 3, project_count: 5, oldest_run_age_days: 5, read_only_projects: [], ...overrides };
}

const PREVIEW = {
  workspace_name: 'Acme QA',
  current_plan: 'cloud',
  target_plan: 'community',
  projects: { in_use: 5, limit: 3, read_only: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }] },
  seats: { in_use: 3, limit: 5, over_limit: [] },
  retention: { current_days: 5, target_days: 30 },
  blocked_reason: null,
};

let restoreFetch: (() => void) | null = null;
let mounted: Array<{ container: HTMLElement, root: ReturnType<typeof createRoot> }> = [];
const realSetTimeout = globalThis.setTimeout;

async function flush(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); }); });
}

async function mountWith(body: unknown, preview: unknown = PREVIEW) {
  const double = installFetchDouble((call) => {
    if (call.url.includes('/billing/invoices')) {
      return jsonResponse({ data: [], has_more: false, next_cursor: null });
    }
    if (call.url.endsWith('/billing/downgrade') && call.method === 'GET') {
      return jsonResponse(preview);
    }
    if (call.url.endsWith('/billing/downgrade') && call.method === 'POST') {
      return jsonResponse({ status: 'downgraded', plan: 'community', read_only_projects: [] });
    }
    return jsonResponse(body);
  });
  restoreFetch = double.restore;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(BillingOverviewView, { workspaceId: WS })); });
  mounted.push({ container, root });
  await flush();
  await flush();
  return { container, calls: double.calls };
}

const has = (testId: string) => document.querySelector(`[data-testid="${testId}"]`) !== null;
const click = (testId: string) => act(() => { (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click(); });

beforeEach(() => {
  searchParams = new URLSearchParams();
  replaced.length = 0;
});

afterEach(() => {
  mounted.forEach(({ container, root }) => { act(() => { root.unmount(); }); container.remove(); });
  mounted = [];
  restoreFetch?.();
  restoreFetch = null;
});

describe('Billing plan card - downgrade and cancel (BK-233)', () => {
  test('the owner of a paid Cloud workspace gets Change plan and Cancel subscription', async () => {
    await mountWith(overview());
    expect(has('billing-change-plan')).toBe(true);
    expect(has('billing-cancel-subscription')).toBe(true);
  });

  test('an admin sees the plan but both actions are structurally absent (Scenarios 5.1, 5.3)', async () => {
    await mountWith(overview({ billing: billingBlock({ can_edit: false }) }));
    expect(has('billing-change-plan')).toBe(false);
    expect(has('billing-cancel-subscription')).toBe(false);
    expect(has('billing-owner-only-note')).toBe(true);
  });

  test('a pending cancellation shows the end date and Resubscribe instead of the plan actions (Scenario 3.1)', async () => {
    await mountWith(overview({ billing: billingBlock({ cancel_at_period_end: true }) }));
    expect(document.querySelector('[data-testid="billing-pending-cancellation"]')?.textContent).toContain('Dec 31, 2026');
    expect(has('billing-resubscribe')).toBe(true);
    expect(has('billing-change-plan')).toBe(false);
  });

  test('the preview names the oldest projects becoming read-only and says nothing is deleted before the confirm (Scenario 1.1)', async () => {
    const { calls } = await mountWith(overview());
    click('billing-change-plan');
    await flush();
    expect(document.querySelector('[data-testid="billing-preview-read-only"]')?.textContent).toContain('P1');
    expect(document.querySelector('[data-testid="billing-preview-projects"]')?.textContent).toBe('2 of 5 projects become read-only');
    expect(has('billing-preview-nothing-deleted')).toBe(true);
    expect((document.querySelector('[data-testid="billing-downgrade-confirm"]') as HTMLButtonElement).disabled).toBe(false);

    click('billing-downgrade-confirm');
    await flush();
    const post = calls.find(call => call.method === 'POST' && call.url.endsWith('/billing/downgrade'))!;
    expect(JSON.parse(post.body as string)).toEqual({ target_plan: 'community', expected_read_only_project_ids: ['p1', 'p2'] });
    expect(post.headers['idempotency-key']).toBeDefined();
  });

  test('a seat conflict blocks the confirm and names the members (Scenario 1.3)', async () => {
    await mountWith(overview(), { ...PREVIEW, seats: { in_use: 8, limit: 5, over_limit: [{ user_id: 'u1', email: 'late@example.test' }] }, blocked_reason: 'seats_over_limit' });
    click('billing-change-plan');
    await flush();
    expect(document.querySelector('[data-testid="billing-preview-seat-conflict"]')?.textContent).toContain('late@example.test');
    expect((document.querySelector('[data-testid="billing-downgrade-confirm"]') as HTMLButtonElement).disabled).toBe(true);
  });

  test('a downgraded workspace lists its read-only projects on the plan card (Scenario 2.1)', async () => {
    await mountWith(overview({ plan: 'community', stored_plan: 'community', billing: billingBlock({ has_subscription: false }), read_only_projects: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }] }));
    expect(document.querySelector('[data-testid="billing-read-only-projects"]')?.textContent).toContain('2 of 5 projects are read-only. Nothing was deleted.');
    expect(has('billing-change-plan')).toBe(false);
  });
});

describe('copy helpers', () => {
  test('readOnlySummary states that nothing changes within the limit (Scenario 1.2)', () => {
    expect(readOnlySummary(0, 3)).toBe('All 3 projects stay editable.');
    expect(readOnlySummary(1, 4)).toBe('1 of 4 projects become read-only');
  });

  test('blockedReasonCopy names the seat gap', () => {
    expect(blockedReasonCopy({ ...PREVIEW, seats: { in_use: 8, limit: 5, over_limit: [] }, blocked_reason: 'seats_over_limit' } as never)).toContain('Remove 3 members');
    expect(blockedReasonCopy(PREVIEW as never)).toBeNull();
  });
});
