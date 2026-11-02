import type { FetchHandler } from './billing-test-support';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { errorResponse, installFetchDouble, jsonResponse } from './billing-test-support';

// BK-231 PaymentMethodCard. MOCK ONLY: there is no Stripe account for this
// project, so the hosted-window hand-off is a fetch double plus a stubbed
// `window.location.assign`; no live provider is contacted. The DOM is
// registered per file and React is imported afterwards (same pattern as
// BillingOverviewView.test.ts).
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { PaymentMethodCard } = await import('@components/billing/PaymentMethodCard');

type Props = Parameters<typeof PaymentMethodCard>[0];

const realSetTimeout = globalThis.setTimeout;
const CARD = { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028 };
const HOSTED_URL = 'https://billing.provider.test/session/abc123';

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let double: ReturnType<typeof installFetchDouble>;
let assigned: string[] = [];
let realAssign: typeof window.location.assign;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

// A tiny stateful parent: the card is controlled (`replaceOpen`), exactly as
// the page will wire it so the failed-renewal banner can open the same dialog.
function Harness(props: Omit<Props, 'replaceOpen' | 'onReplaceOpenChange'> & { initialOpen?: boolean, onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(props.initialOpen ?? false);
  const { initialOpen: _initialOpen, onOpenChange, ...cardProps } = props;
  return createElement(PaymentMethodCard, {
    ...cardProps,
    replaceOpen: open,
    onReplaceOpenChange: (next: boolean) => { setOpen(next); onOpenChange?.(next); },
  });
}

function mount(overrides: Partial<Omit<Props, 'replaceOpen' | 'onReplaceOpenChange'>> & { initialOpen?: boolean, onOpenChange?: (open: boolean) => void } = {}) {
  const props = {
    workspaceId: 'ws-1',
    paymentMethod: CARD,
    canEdit: true,
    failed: false,
    ...overrides,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(Harness, props)); });
  mounted.push({ container, root });
  return container;
}

// The dialog is portalled to document.body, so it is queried there.
function inDoc<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.body.querySelector<T>(`[data-testid="${id}"]`);
}

function click(target: HTMLElement | null) {
  if (!target) { throw new Error('click target missing'); }
  act(() => { target.click(); });
}

function useHandler(handler: FetchHandler) {
  double = installFetchDouble(handler);
}

beforeEach(() => {
  mounted = [];
  assigned = [];
  // eslint-disable-next-line ts/unbound-method -- captured only to be restored after the test
  realAssign = window.location.assign;
  window.location.assign = ((url: string | URL) => { assigned.push(String(url)); }) as typeof window.location.assign;
  useHandler(() => jsonResponse({ url: HOSTED_URL }));
});

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  window.location.assign = realAssign;
  double.restore();
});

describe('PaymentMethodCard summary', () => {
  test('shows "{Brand} ending {last4}" and "Expires MM/YY"', () => {
    const container = mount();
    expect(container.textContent).toContain('Payment method');
    expect(inDoc('payment-method-summary')?.textContent).toBe('Visa ending 4242');
    expect(inDoc('payment-method-expiry')?.textContent).toBe('Expires 04/28');
  });

  test('pads the month and keeps only the last two digits of the year', () => {
    mount({ paymentMethod: { brand: 'mastercard', last4: '0005', exp_month: 12, exp_year: 2031 } });
    expect(inDoc('payment-method-summary')?.textContent).toBe('Mastercard ending 0005');
    expect(inDoc('payment-method-expiry')?.textContent).toBe('Expires 12/31');
  });

  test('an unknown brand is capitalised rather than dropped', () => {
    mount({ paymentMethod: { brand: 'cartes_bancaires', last4: '1111', exp_month: 1, exp_year: 2030 } });
    expect(inDoc('payment-method-summary')?.textContent).toBe('Cartes_bancaires ending 1111');
  });

  test('the "Last charge failed" chip appears only when failed, as text, not color alone', () => {
    mount({ failed: false });
    expect(inDoc('payment-method-failed-chip')).toBeNull();
    mount({ failed: true });
    const chip = inDoc('payment-method-failed-chip');
    expect(chip?.textContent).toBe('Last charge failed');
    expect(chip?.querySelector('svg')).not.toBeNull();
  });

  test('null payment method: the unavailable line, no brand or last four', () => {
    const container = mount({ paymentMethod: null });
    expect(inDoc('payment-method-unavailable')?.textContent).toBe('Payment method details are not available right now.');
    expect(inDoc('payment-method-summary')).toBeNull();
    expect(container.textContent).not.toContain('ending');
  });

  test('the provider-window footer note shows for everyone, owner or admin', () => {
    const note = 'Card details are entered in the payment provider\'s secure window. Bunkai never sees or stores the full card number.';
    mount({ canEdit: true });
    expect(inDoc('payment-method-note')?.textContent).toBe(note);
    mount({ canEdit: false });
    expect(document.body.querySelectorAll('[data-testid="payment-method-note"]')).toHaveLength(2);
  });

  test('never renders a card number, CVC or expiry input', () => {
    const container = mount({ initialOpen: true });
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(document.body.querySelectorAll('input')).toHaveLength(0);
  });
});

describe('PaymentMethodCard role gating', () => {
  test('owner gets Replace payment method, and it opens the dialog', () => {
    const changes: boolean[] = [];
    const container = mount({ onOpenChange: (open) => { changes.push(open); } });
    expect(inDoc('payment-method-dialog')).toBeNull();
    click(container.querySelector('[data-testid="payment-method-replace"]'));
    expect(changes).toEqual([true]);
    expect(inDoc('payment-method-dialog')).not.toBeNull();
  });

  test('admin has no replace button and no dialog, even if replaceOpen were true', () => {
    const container = mount({ canEdit: false, initialOpen: true });
    expect(container.querySelector('[data-testid="payment-method-replace"]')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(inDoc('payment-method-dialog')).toBeNull();
  });

  test('the owner still gets the replace button when the method details are unavailable', () => {
    const container = mount({ paymentMethod: null });
    expect(container.querySelector('[data-testid="payment-method-replace"]')).not.toBeNull();
  });
});

describe('PaymentMethodCard replace dialog', () => {
  test('can be opened from outside (the banner) and carries the title and body copy', () => {
    mount({ initialOpen: true });
    const dialog = inDoc('payment-method-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.textContent).toContain('Replace payment method');
    expect(dialog?.textContent).toContain('You will enter the new card in the payment provider\'s secure window. Bunkai never sees or stores the full card number.');
    expect(inDoc('payment-method-dialog-continue')?.textContent).toContain('Continue to secure window');
  });

  test('Cancel closes the dialog without any request', () => {
    const changes: boolean[] = [];
    mount({ initialOpen: true, onOpenChange: (open) => { changes.push(open); } });
    click(inDoc('payment-method-dialog-cancel'));
    expect(changes).toEqual([false]);
    expect(inDoc('payment-method-dialog')).toBeNull();
    expect(double.calls).toHaveLength(0);
  });

  test('Continue POSTs /payment-method with an Idempotency-Key and no body, then assigns the returned url', async () => {
    mount({ initialOpen: true });
    click(inDoc('payment-method-dialog-continue'));
    await flush();

    expect(double.calls).toHaveLength(1);
    const call = double.calls[0];
    expect(call.url).toBe('/api/v1/workspaces/ws-1/billing/payment-method');
    expect(call.method).toBe('POST');
    expect(call.body).toBeNull();
    expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(assigned).toEqual([HOSTED_URL]);
    // After the hand-off the button stays locked so a second click cannot open a second session.
    expect(inDoc<HTMLButtonElement>('payment-method-dialog-continue')?.disabled).toBe(true);
  });

  test('in flight: Continue and Cancel are disabled, aria-busy is set, and Escape does not close', async () => {
    let release: (response: Response) => void = () => {};
    useHandler(async () => new Promise<Response>((resolve) => { release = resolve; }));
    mount({ initialOpen: true });
    click(inDoc('payment-method-dialog-continue'));
    await flush();

    const next = inDoc<HTMLButtonElement>('payment-method-dialog-continue');
    expect(next?.disabled).toBe(true);
    expect(next?.getAttribute('aria-busy')).toBe('true');
    expect(inDoc<HTMLButtonElement>('payment-method-dialog-cancel')?.disabled).toBe(true);

    act(() => { inDoc('payment-method-dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(inDoc('payment-method-dialog')).not.toBeNull();

    await act(async () => { release(jsonResponse({ url: HOSTED_URL })); });
    await flush();
    expect(assigned).toEqual([HOSTED_URL]);
  });

  test('an error is shown inside the dialog, nothing is assigned, and Continue can be retried', async () => {
    useHandler(() => errorResponse(502, 'upstream_error', 'The payment provider is unavailable. Try again shortly.'));
    mount({ initialOpen: true });
    click(inDoc('payment-method-dialog-continue'));
    await flush();

    const error = inDoc('payment-method-dialog-error');
    expect(error?.textContent).toBe('The payment provider is unavailable. Try again shortly.');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(inDoc('payment-method-dialog')?.contains(error)).toBe(true);
    expect(assigned).toEqual([]);
    expect(inDoc<HTMLButtonElement>('payment-method-dialog-continue')?.disabled).toBe(false);
  });

  test('a 200 without a usable url, or with a non-https url, is refused', async () => {
    for (const body of [{}, { url: 'javascript:alert(1)' }, { url: 'http://insecure.test/x' }, { url: 42 }]) {
      double?.restore();
      useHandler(() => jsonResponse(body));
      mount({ initialOpen: true });
      click(inDoc('payment-method-dialog-continue'));
      await flush();
      expect(inDoc('payment-method-dialog-error')?.textContent).toBe('Could not open the secure window. Please try again.');
      click(inDoc('payment-method-dialog-cancel'));
    }
    expect(assigned).toEqual([]);
  });

  test('an unreadable error body falls back to safe copy and never prints the raw body', async () => {
    useHandler(() => new Response('<html>boom</html>', { status: 500 }));
    mount({ initialOpen: true });
    click(inDoc('payment-method-dialog-continue'));
    await flush();
    expect(inDoc('payment-method-dialog-error')?.textContent).toBe('Could not open the secure window. Please try again.');
    expect(document.body.textContent).not.toContain('boom');
  });

  test('reopening after a failure starts clean (no stale error)', async () => {
    useHandler(() => errorResponse(502, 'upstream_error', 'Provider down.'));
    const container = mount({ initialOpen: true });
    click(inDoc('payment-method-dialog-continue'));
    await flush();
    expect(inDoc('payment-method-dialog-error')).not.toBeNull();

    click(inDoc('payment-method-dialog-cancel'));
    click(container.querySelector('[data-testid="payment-method-replace"]'));
    await flush();
    expect(inDoc('payment-method-dialog')).not.toBeNull();
    expect(inDoc('payment-method-dialog-error')).toBeNull();
  });
});
