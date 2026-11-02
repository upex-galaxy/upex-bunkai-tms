import type { FetchHandler } from './billing-test-support';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { errorResponse, installFetchDouble, jsonResponse } from './billing-test-support';

// BK-231 FailedRenewalBanner. MOCK ONLY: there is no Stripe account for this
// project, so the retry endpoint is a fetch double and no live provider is
// contacted. The DOM is registered per file and React is imported afterwards
// (same pattern as BillingOverviewView.test.ts).
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { FailedRenewalBanner } = await import('@components/billing/FailedRenewalBanner');

const realSetTimeout = globalThis.setTimeout;
const GRACE_END = '2026-08-11T23:30:00.000Z';

type Props = Parameters<typeof FailedRenewalBanner>[0];

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let double: ReturnType<typeof installFetchDouble>;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    workspaceId: 'ws-1',
    graceEndsAt: GRACE_END,
    subscriptionState: 'grace_period',
    canEdit: true,
    retryAvailable: true,
    onReplacePaymentMethod: () => {},
    onRecovered: () => {},
    ...overrides,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(FailedRenewalBanner, props)); });
  mounted.push({ container, root });
  return container;
}

function testId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

function useHandler(handler: FetchHandler) {
  double = installFetchDouble(handler);
}

beforeEach(() => {
  mounted = [];
  useHandler(() => jsonResponse({ status: 'recovered' }));
});

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  double.restore();
});

describe('FailedRenewalBanner copy and roles', () => {
  test('grace period: persistent status banner with the UTC grace-end date and hour (the window ends at the exact instant)', () => {
    const container = mount();
    const banner = testId(container, 'failed-renewal-banner');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.textContent).toContain('Renewal charge failed');
    expect(testId(container, 'failed-renewal-body')?.textContent)
      .toBe('Your workspace keeps its paid limits until Aug 11, 2026 at 23:30 UTC.');
  });

  test('free after grace: names the end date, Community limits and that nothing was deleted', () => {
    const container = mount({ subscriptionState: 'free_after_grace' });
    expect(testId(container, 'failed-renewal-banner')?.getAttribute('role')).toBe('status');
    expect(testId(container, 'failed-renewal-body')?.textContent).toBe(
      'Your grace period ended on Aug 11, 2026 at 23:30 UTC. This workspace is on Community limits and nothing was deleted. Replace the payment method and retry the charge to restore your plan.',
    );
  });

  test('the date is rendered in UTC, not shifted by the viewer\'s timezone', () => {
    // 23:59 UTC on the 11th is already the 12th in UTC+2: the label must stay the 11th.
    const container = mount({ graceEndsAt: '2026-08-11T23:59:59.000Z' });
    expect(testId(container, 'failed-renewal-body')?.textContent).toContain('Aug 11, 2026 at 23:59 UTC');
  });

  test('an unparseable date never prints "Invalid Date"', () => {
    const container = mount({ graceEndsAt: 'not-a-date' });
    expect(testId(container, 'failed-renewal-body')?.textContent).not.toContain('Invalid');
    expect(testId(container, 'failed-renewal-body')?.textContent).toBe('Your workspace keeps its paid limits until the grace period ends.');
  });
});

describe('FailedRenewalBanner role gating', () => {
  test('owner sees Replace payment method and Retry charge', () => {
    const container = mount();
    expect(testId(container, 'failed-renewal-replace')).not.toBeNull();
    expect(testId(container, 'failed-renewal-retry')).not.toBeNull();
    expect(testId(container, 'failed-renewal-owner-only')).toBeNull();
  });

  test('admin sees the same text, no action buttons at all, and the owner-only line', () => {
    const container = mount({ canEdit: false });
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(testId(container, 'failed-renewal-replace')).toBeNull();
    expect(testId(container, 'failed-renewal-retry')).toBeNull();
    expect(testId(container, 'failed-renewal-body')?.textContent).toContain('until Aug 11, 2026 at 23:30 UTC');
    expect(testId(container, 'failed-renewal-owner-only')?.textContent).toBe('Only the workspace owner can fix this.');
  });

  test('Replace payment method calls onReplacePaymentMethod', () => {
    let called = 0;
    const container = mount({ onReplacePaymentMethod: () => { called += 1; } });
    act(() => { (testId(container, 'failed-renewal-replace') as HTMLButtonElement).click(); });
    expect(called).toBe(1);
  });
});

describe('FailedRenewalBanner retry gate', () => {
  test('retry is disabled with the helper text while no new method is on file', () => {
    const container = mount({ retryAvailable: false });
    const retry = testId(container, 'failed-renewal-retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(testId(container, 'failed-renewal-retry-note')?.textContent).toBe('Retry becomes available once a new payment method is on file.');
    expect(retry.getAttribute('aria-describedby')).toBe('failed-renewal-retry-note');

    act(() => { retry.click(); });
    expect(double.calls).toHaveLength(0);
  });

  test('retry is enabled and the helper text is gone once a new method is on file', () => {
    const container = mount({ retryAvailable: true });
    expect((testId(container, 'failed-renewal-retry') as HTMLButtonElement).disabled).toBe(false);
    expect(testId(container, 'failed-renewal-retry-note')).toBeNull();
  });
});

describe('FailedRenewalBanner retry request', () => {
  test('POSTs /retry with an Idempotency-Key and no body, then calls onRecovered', async () => {
    let recovered = 0;
    const container = mount({ onRecovered: () => { recovered += 1; } });
    act(() => { (testId(container, 'failed-renewal-retry') as HTMLButtonElement).click(); });
    await flush();

    expect(double.calls).toHaveLength(1);
    const call = double.calls[0];
    expect(call.url).toBe('/api/v1/workspaces/ws-1/billing/retry');
    expect(call.method).toBe('POST');
    expect(call.body).toBeNull();
    expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(recovered).toBe(1);
    expect(testId(container, 'failed-renewal-error')).toBeNull();
  });

  test('in flight: the button is disabled, aria-busy, and a second click sends nothing', async () => {
    let release: (response: Response) => void = () => {};
    useHandler(async () => new Promise<Response>((resolve) => { release = resolve; }));
    const container = mount();
    const retry = testId(container, 'failed-renewal-retry') as HTMLButtonElement;

    act(() => { retry.click(); });
    await flush();
    expect(retry.disabled).toBe(true);
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(retry.textContent).toContain('Retrying charge');

    act(() => { retry.click(); });
    expect(double.calls).toHaveLength(1);

    await act(async () => { release(jsonResponse({ status: 'recovered' })); });
    await flush();
    expect(retry.getAttribute('aria-busy')).toBe('false');
  });

  test('402 payment_declined: shows the server message and re-enables Retry', async () => {
    useHandler(() => errorResponse(402, 'payment_declined', 'The new card was declined by the issuer.'));
    let recovered = 0;
    const container = mount({ onRecovered: () => { recovered += 1; } });
    act(() => { (testId(container, 'failed-renewal-retry') as HTMLButtonElement).click(); });
    await flush();

    const error = testId(container, 'failed-renewal-error');
    expect(error?.textContent).toBe('The new card was declined by the issuer.');
    expect(error?.getAttribute('role')).toBe('alert');
    expect((testId(container, 'failed-renewal-retry') as HTMLButtonElement).disabled).toBe(false);
    expect(recovered).toBe(0);
  });

  test('409 retry_not_available: shows the server message and keeps Retry available', async () => {
    useHandler(() => errorResponse(409, 'retry_not_available', 'There is nothing to retry right now.'));
    const container = mount();
    act(() => { (testId(container, 'failed-renewal-retry') as HTMLButtonElement).click(); });
    await flush();

    expect(testId(container, 'failed-renewal-error')?.textContent).toBe('There is nothing to retry right now.');
    expect((testId(container, 'failed-renewal-retry') as HTMLButtonElement).disabled).toBe(false);
  });

  test('502 and a network failure both fall back to a safe message and never print a raw body', async () => {
    useHandler(() => new Response('<html>upstream exploded</html>', { status: 502 }));
    const container = mount();
    act(() => { (testId(container, 'failed-renewal-retry') as HTMLButtonElement).click(); });
    await flush();
    expect(testId(container, 'failed-renewal-error')?.textContent).toBe('Could not retry the charge. Please try again.');
    expect(container.textContent).not.toContain('upstream exploded');

    double.restore();
    useHandler(() => { throw new Error('socket hang up'); });
    act(() => { (testId(container, 'failed-renewal-retry') as HTMLButtonElement).click(); });
    await flush();
    expect(testId(container, 'failed-renewal-error')?.textContent).toBe('Could not retry the charge. Please try again.');
    expect(container.textContent).not.toContain('socket hang up');
  });
});
