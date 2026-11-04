import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { installFetchDouble, jsonResponse } from './billing-test-support';

// BK-231 - how the Billing screen composes the new sections: which cards and
// which actions each role and each billing state gets. The cards' own behaviour
// (validation, downloads, retry) is covered in their own suites; this file is
// about COMPOSITION. MOCK ONLY: a fetch double stands in for the API, and no
// payment provider is involved anywhere.

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

const WS = '11111111-1111-4111-8111-111111111111';
const GRACE = { started_at: '2026-10-01T12:00:00.000Z', ends_at: '2026-10-15T12:00:00.000Z' };
const PROFILE = {
  company_name: 'Upex Systems S.L.',
  billing_email: 'billing@upex.dev',
  address_line1: 'Calle de Serrano 41',
  address_line2: null,
  city: 'Madrid',
  region: null,
  postal_code: '28001',
  country: 'ES',
  updated_at: '2026-10-01T00:00:00.000Z',
};

function billingBlock(overrides: Record<string, unknown> = {}) {
  return {
    can_edit: true,
    profile: PROFILE,
    payment_method: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028 },
    payment_method_updated_at: null,
    payment_state: 'paid',
    subscription_state: 'active_paid',
    grace: null,
    retry_available: false,
    ...overrides,
  };
}

function overview(overrides: Record<string, unknown> = {}) {
  return { plan: 'cloud', stored_plan: 'cloud', grace_ends_at: null, billing: billingBlock(), purchased_seats: 10, active_seats: 3, project_count: 2, oldest_run_age_days: 5, ...overrides };
}

let restoreFetch: (() => void) | null = null;
let mounted: Array<{ container: HTMLElement, root: ReturnType<typeof createRoot> }> = [];
const realSetTimeout = globalThis.setTimeout;

async function flush(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); }); });
}

async function mountWith(body: unknown) {
  const double = installFetchDouble((call) => {
    if (call.url.includes('/billing/invoices')) {
      return jsonResponse({ data: [], has_more: false, next_cursor: null });
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

const has = (container: HTMLElement, testId: string) => container.querySelector(`[data-testid="${testId}"]`) !== null;

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

describe('BillingOverviewView - maintenance sections (BK-231)', () => {
  test('a workspace that does not pay through the processor gets none of the new sections', async () => {
    const { container, calls } = await mountWith(overview({ plan: 'community', stored_plan: 'community', billing: null }));
    expect(has(container, 'billing-plan-card')).toBe(true);
    expect(has(container, 'billing-details-card')).toBe(false);
    expect(has(container, 'payment-method-card')).toBe(false);
    expect(has(container, 'invoice-history-card')).toBe(false);
    expect(has(container, 'failed-renewal-banner')).toBe(false);
    expect(calls.some(call => call.url.includes('/billing/invoices'))).toBe(false);
  });

  test('the owner of a paid workspace sees billing details, payment method and invoices with their actions', async () => {
    const { container } = await mountWith(overview());
    expect(has(container, 'billing-details-card')).toBe(true);
    expect(has(container, 'billing-details-edit')).toBe(true);
    expect(has(container, 'payment-method-card')).toBe(true);
    expect(has(container, 'payment-method-replace')).toBe(true);
    expect(has(container, 'invoice-history-card')).toBe(true);
    expect(has(container, 'failed-renewal-banner')).toBe(false);
  });

  test('an admin sees the same sections read-only: Edit and Replace are structurally absent (D51 point 6)', async () => {
    const { container } = await mountWith(overview({ billing: billingBlock({ can_edit: false }) }));
    expect(has(container, 'billing-details-card')).toBe(true);
    expect(has(container, 'payment-method-card')).toBe(true);
    expect(has(container, 'invoice-history-card')).toBe(true);
    expect(has(container, 'billing-details-edit')).toBe(false);
    expect(has(container, 'payment-method-replace')).toBe(false);
  });

  test('a failed renewal puts the persistent banner above everything, with Retry locked until a method is replaced (Scenario 4.1)', async () => {
    const { container } = await mountWith(overview({
      grace_ends_at: GRACE.ends_at,
      billing: billingBlock({ payment_state: 'payment_failed', subscription_state: 'grace_period', grace: GRACE, retry_available: false }),
    }));
    const root = container.querySelector('[data-testid="billing-overview"]')!;
    expect(root.firstElementChild?.getAttribute('data-testid')).toBe('failed-renewal-banner');
    expect(container.querySelector('[data-testid="failed-renewal-banner"]')?.textContent).toContain('Oct 15, 2026');
    expect((container.querySelector('[data-testid="failed-renewal-retry"]') as HTMLButtonElement).disabled).toBe(true);
    expect(has(container, 'payment-method-failed-chip')).toBe(true);
  });

  test('Retry unlocks once the backend says a replacement method is on file', async () => {
    const { container } = await mountWith(overview({
      billing: billingBlock({ payment_state: 'payment_failed', subscription_state: 'grace_period', grace: GRACE, retry_available: true }),
    }));
    expect((container.querySelector('[data-testid="failed-renewal-retry"]') as HTMLButtonElement).disabled).toBe(false);
  });

  test('"Replace payment method" in the banner opens the same hosted-window dialog as the card', async () => {
    const { container } = await mountWith(overview({
      billing: billingBlock({ payment_state: 'payment_failed', subscription_state: 'grace_period', grace: GRACE }),
    }));
    expect(document.querySelector('[data-testid="payment-method-dialog"]')).toBeNull();
    await act(async () => { (container.querySelector('[data-testid="failed-renewal-replace"]') as HTMLElement).click(); });
    await flush();
    expect(document.querySelector('[data-testid="payment-method-dialog"]')).not.toBeNull();
  });

  test('after the grace window the effective plan reads Community and the banner says nothing was deleted (Scenario 4.3)', async () => {
    const { container } = await mountWith(overview({
      plan: 'community',
      stored_plan: 'cloud',
      grace_ends_at: GRACE.ends_at,
      billing: billingBlock({ payment_state: 'payment_failed', subscription_state: 'free_after_grace', grace: GRACE, retry_available: true }),
    }));
    expect(container.querySelector('[data-testid="billing-plan-name"]')?.textContent).toBe('Community');
    expect(container.querySelector('[data-testid="failed-renewal-banner"]')?.textContent).toContain('nothing was deleted');
    expect((container.querySelector('[data-testid="failed-renewal-retry"]') as HTMLButtonElement).disabled).toBe(false);
  });

  test('no banner for a recovered workspace even if a grace payload lingers', async () => {
    const { container } = await mountWith(overview({ billing: billingBlock({ payment_state: 'recovered', grace: null }) }));
    expect(has(container, 'failed-renewal-banner')).toBe(false);
  });

  test('coming back from a replacement the backend has already recorded stops polling at once and strips the param (Scenario 4.4)', async () => {
    searchParams = new URLSearchParams('payment_method=updated');
    const recent = new Date(Date.now() - 60 * 1000).toISOString();
    const { calls } = await mountWith(overview({
      billing: billingBlock({ payment_state: 'payment_failed', subscription_state: 'grace_period', grace: GRACE, retry_available: true, payment_method_updated_at: recent }),
    }));
    expect(replaced).toContain('/settings/billing');
    // One load for the mount plus the poll's first tick; no endless polling.
    expect(calls.filter(call => call.url.endsWith('/billing')).length).toBeLessThanOrEqual(3);
  });

  test('past the grace window there is no upgrade link and the purchased seats do not leak into the Community label', async () => {
    const { container } = await mountWith(overview({
      plan: 'community',
      stored_plan: 'cloud',
      purchased_seats: 12,
      billing: billingBlock({ payment_state: 'payment_failed', subscription_state: 'free_after_grace', grace: GRACE }),
    }));
    expect(has(container, 'billing-upgrade-entry')).toBe(false);
    expect(container.querySelector('[data-testid="billing-seats-meter"]')?.textContent).toContain('3 of 5');
  });

  test('coming back from a cancelled replacement says the current method is unchanged and strips the param', async () => {
    searchParams = new URLSearchParams('payment_method=canceled');
    const { container } = await mountWith(overview());
    expect(container.querySelector('[data-testid="billing-payment-method-canceled"]')?.textContent).toContain('unchanged');
    expect(replaced).toContain('/settings/billing');
  });
});
