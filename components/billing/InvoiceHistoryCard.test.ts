import type { FetchHandler, RecordedCall } from './billing-test-support';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { errorResponse, installFetchDouble, jsonResponse } from './billing-test-support';

// BK-231 InvoiceHistoryCard. MOCK ONLY: there is no Stripe account for this
// project, so every populated state runs against a fetch double (invoice list
// and PDF bytes alike); no live provider is contacted. The DOM is registered
// per file and React is imported afterwards (same pattern as
// BillingOverviewView.test.ts).
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { InvoiceHistoryCard } = await import('@components/billing/InvoiceHistoryCard');

type Props = Parameters<typeof InvoiceHistoryCard>[0];
type Invoice = ReturnType<typeof makeInvoice>;

const realSetTimeout = globalThis.setTimeout;
// Mirrors `FETCH_TIMEOUT_MS` in the component (not exported). Only timers at or
// above it are trapped; React's scheduler and happy-dom use far shorter ones.
const ABORT_TIMER_MIN_DELAY_MS = 10_000;
const BASE = '/api/v1/workspaces/ws-1/billing';

function makeInvoice(id: string, overrides: Partial<{
  number: string | null
  status: 'paid' | 'issued' | 'failed'
  period_start: string | null
  period_end: string | null
  amount_cents: number
  currency: string
  seat_quantity: number | null
  pdf_available: boolean
}> = {}) {
  return {
    id,
    number: `INV-2026-${id}`,
    status: 'paid' as 'paid' | 'issued' | 'failed',
    period_start: '2026-07-01T00:00:00.000Z',
    period_end: '2026-07-31T23:59:59.000Z',
    amount_cents: 9600,
    currency: 'eur',
    seat_quantity: 4,
    pdf_available: true,
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(data: Invoice[], hasMore = false, nextCursor: string | null = null) {
  return { data, has_more: hasMore, next_cursor: nextCursor };
}

let mounted: Array<{ container: HTMLElement, root: { render: (node: unknown) => void, unmount: () => void } }> = [];
let double: ReturnType<typeof installFetchDouble>;
let abortTimers: Array<() => void> = [];
let anchorClicks: Array<{ href: string, download: string }> = [];
// eslint-disable-next-line ts/unbound-method -- captured only to be restored after the test
const realAnchorClick = HTMLAnchorElement.prototype.click;
// eslint-disable-next-line ts/unbound-method -- captured only to be restored after the test
const realCreateObjectURL = URL.createObjectURL;
// eslint-disable-next-line ts/unbound-method -- captured only to be restored after the test
const realRevokeObjectURL = URL.revokeObjectURL;
let createdObjectUrls = 0;
let revokedObjectUrls = 0;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

function mount(overrides: Partial<Props> = {}) {
  const props: Props = { workspaceId: 'ws-1', ...overrides };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(InvoiceHistoryCard, props)); });
  const handle = { container, root: root as unknown as { render: (node: unknown) => void, unmount: () => void } };
  mounted.push(handle);
  return handle;
}

function rerender(handle: ReturnType<typeof mount>, props: Props) {
  act(() => { handle.root.render(createElement(InvoiceHistoryCard, props)); });
}

function el<T extends HTMLElement = HTMLElement>(container: HTMLElement, id: string): T | null {
  return container.querySelector<T>(`[data-testid="${id}"]`);
}

function click(target: HTMLElement | null) {
  if (!target) { throw new Error('click target missing'); }
  act(() => { target.click(); });
}

function useHandler(handler: FetchHandler) {
  double = installFetchDouble(handler);
}

function pdfOk(): Response {
  return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200, headers: { 'content-type': 'application/pdf' } });
}

function isPdf(call: RecordedCall): boolean {
  return call.url.includes('/pdf');
}

beforeEach(() => {
  mounted = [];
  abortTimers = [];
  anchorClicks = [];
  createdObjectUrls = 0;
  revokedObjectUrls = 0;

  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    anchorClicks.push({ href: this.href, download: this.download });
  };
  URL.createObjectURL = (() => { createdObjectUrls += 1; return 'blob:mock-invoice'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => { revokedObjectUrls += 1; }) as typeof URL.revokeObjectURL;

  globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (typeof handler === 'function' && (delay ?? 0) >= ABORT_TIMER_MIN_DELAY_MS) {
      abortTimers.push(handler as () => void);
      return 0;
    }
    return (realSetTimeout as unknown as (...rest: unknown[]) => unknown)(handler, delay, ...args);
  }) as unknown as typeof globalThis.setTimeout;

  useHandler(() => jsonResponse(page([makeInvoice('0001')])));
});

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  globalThis.setTimeout = realSetTimeout;
  HTMLAnchorElement.prototype.click = realAnchorClick;
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  double.restore();
});

describe('InvoiceHistoryCard load states', () => {
  test('shows a skeleton (role=status) while the first page is in flight', async () => {
    useHandler(async () => new Promise<Response>(() => {}));
    const { container } = mount();
    await flush();
    const skeleton = el(container, 'invoice-history-loading');
    expect(skeleton?.getAttribute('role')).toBe('status');
    expect(container.textContent).toContain('Invoices');
    expect(el(container, 'invoice-history-table')).toBeNull();
  });

  test('fetches the first page of 12 on mount, with no cursor', async () => {
    mount();
    await flush();
    expect(double.calls).toHaveLength(1);
    expect(double.calls[0].url).toBe(`${BASE}/invoices?limit=12`);
    expect(double.calls[0].method).toBe('GET');
  });

  test('empty history: "No invoices yet" plus the first-invoice hint, no table', async () => {
    useHandler(() => jsonResponse(page([])));
    const { container } = mount();
    await flush();
    const empty = el(container, 'invoice-history-empty');
    expect(empty?.textContent).toContain('No invoices yet');
    expect(empty?.textContent).toContain('Your first invoice will appear here once it is issued.');
    expect(el(container, 'invoice-history-table')).toBeNull();
  });

  test('a 502 renders the error card, and Retry refetches and recovers', async () => {
    let attempts = 0;
    useHandler(() => {
      attempts += 1;
      return attempts === 1 ? errorResponse(502, 'upstream_error', 'Upstream down.') : jsonResponse(page([makeInvoice('0001')]));
    });
    const { container } = mount();
    await flush();

    expect(el(container, 'invoice-history-error')).not.toBeNull();
    expect(container.textContent).not.toContain('Upstream down.');
    expect(el(container, 'invoice-history-loading')).toBeNull();

    click(el(container, 'invoice-history-retry'));
    await flush();
    expect(double.calls).toHaveLength(2);
    expect(el(container, 'invoice-history-error')).toBeNull();
    expect(el(container, 'invoice-row-0001')).not.toBeNull();
  });

  test('a 503 and a network failure both land on the error card with Retry', async () => {
    useHandler(() => errorResponse(503, 'service_unavailable', 'Try later.'));
    const first = mount();
    await flush();
    expect(el(first.container, 'invoice-history-retry')).not.toBeNull();

    double.restore();
    useHandler(() => { throw new Error('network down'); });
    const second = mount();
    await flush();
    expect(el(second.container, 'invoice-history-error')).not.toBeNull();
    expect(second.container.textContent).not.toContain('network down');
  });

  test('a request that blows the 10s timeout lands on the error card, never an endless skeleton', async () => {
    useHandler(async call => new Promise<Response>((_resolve, reject) => {
      call.signal?.addEventListener('abort', () => { reject(new DOMException('The operation was aborted.', 'AbortError')); });
    }));
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-history-loading')).not.toBeNull();
    expect(abortTimers.length).toBeGreaterThan(0);

    const timers = abortTimers;
    abortTimers = [];
    await act(async () => { timers.forEach((fire) => { fire(); }); });
    await flush();

    expect(double.calls[0].signal?.aborted).toBe(true);
    expect(el(container, 'invoice-history-loading')).toBeNull();
    expect(el(container, 'invoice-history-error')).not.toBeNull();
    expect(el(container, 'invoice-history-retry')).not.toBeNull();
  });

  test('404 (not available to this role): a quiet line, no card, no table, no error', async () => {
    useHandler(() => errorResponse(404, 'not_found', 'Not found.'));
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-history-unavailable')?.textContent).toBe('Invoices are not available for your role.');
    expect(el(container, 'invoice-history-card')).toBeNull();
    expect(el(container, 'invoice-history-error')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  test('refetches when refreshKey or workspaceId change', async () => {
    const handle = mount({ refreshKey: 0 });
    await flush();
    expect(double.calls).toHaveLength(1);

    rerender(handle, { workspaceId: 'ws-1', refreshKey: 1 });
    await flush();
    expect(double.calls).toHaveLength(2);

    rerender(handle, { workspaceId: 'ws-2', refreshKey: 1 });
    await flush();
    expect(double.calls).toHaveLength(3);
    expect(double.calls[2].url).toBe('/api/v1/workspaces/ws-2/billing/invoices?limit=12');

    rerender(handle, { workspaceId: 'ws-2', refreshKey: 1 });
    await flush();
    expect(double.calls).toHaveLength(3);
  });
});

describe('InvoiceHistoryCard populated table', () => {
  test('semantic table with the documented label, the six columns and the card copy', async () => {
    const { container } = mount();
    await flush();

    const table = el(container, 'invoice-history-table');
    expect(table?.tagName).toBe('TABLE');
    expect(table?.querySelector('caption')?.textContent)
      .toBe('Invoice history: invoice number, billing period, seats, amount, status, download');
    const headers = Array.from(table?.querySelectorAll('thead th') ?? []);
    expect(headers.map(th => th.getAttribute('scope'))).toEqual(['col', 'col', 'col', 'col', 'col', 'col']);
    expect(headers.map(th => th.textContent)).toEqual(['Invoice', 'Period', 'Seats', 'Amount', 'Status', 'Download']);
    expect(container.textContent).toContain('Newest first. The PDF carries the company details, period, seats and amount that were on file when the invoice was issued.');
  });

  test('a row carries number, period, seats, amount and status', async () => {
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-number-0001')?.textContent).toBe('INV-2026-0001');
    expect(el(container, 'invoice-period-0001')?.textContent).toBe('Jul 1, 2026 to Jul 31, 2026 UTC');
    expect(el(container, 'invoice-seats-0001')?.textContent).toBe('4');
    expect(el(container, 'invoice-amount-0001')?.textContent).toBe('€96.00');
    expect(el(container, 'invoice-status-0001')?.textContent).toBe('Paid');
  });

  test('dates are UTC: 23:59 UTC on the 31st stays the 31st, and the UTC label is explicit', async () => {
    useHandler(() => jsonResponse(page([makeInvoice('0002', { period_start: '2026-12-31T23:30:00.000Z', period_end: '2027-01-31T23:59:59.000Z' })])));
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-period-0002')?.textContent).toBe('Dec 31, 2026 to Jan 31, 2027 UTC');
  });

  test('amounts use each invoice\'s own currency and minor-unit digits', async () => {
    useHandler(() => jsonResponse(page([
      makeInvoice('eur', { amount_cents: 9600, currency: 'eur' }),
      makeInvoice('usd', { amount_cents: 1250, currency: 'USD' }),
      makeInvoice('gbp', { amount_cents: 100050, currency: 'gbp' }),
      makeInvoice('jpy', { amount_cents: 1200, currency: 'jpy' }),
    ])));
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-amount-eur')?.textContent).toBe('€96.00');
    expect(el(container, 'invoice-amount-usd')?.textContent).toBe('$12.50');
    expect(el(container, 'invoice-amount-gbp')?.textContent).toBe('£1,000.50');
    // JPY has no minor unit: 1200 means 1,200 yen, not 12.00.
    expect(el(container, 'invoice-amount-jpy')?.textContent).toBe('¥1,200');
  });

  test('an unknown currency code degrades to a plain number with the code, not a crash', async () => {
    useHandler(() => jsonResponse(page([makeInvoice('odd', { amount_cents: 500, currency: 'zz' })])));
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-amount-odd')?.textContent).toBe('5.00 ZZ');
  });

  test('missing number, seats and period render honest placeholders', async () => {
    useHandler(() => jsonResponse(page([makeInvoice('nulls', { number: null, seat_quantity: null, period_start: null, period_end: null })])));
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-number-nulls')?.textContent).toBe('No number yet');
    expect(el(container, 'invoice-seats-nulls')?.textContent).toBe('n/a');
    expect(el(container, 'invoice-period-nulls')?.textContent).toBe('n/a');
  });

  test('status chips pair an icon with text for Paid, Issued and Failed', async () => {
    useHandler(() => jsonResponse(page([
      makeInvoice('p', { status: 'paid' }),
      makeInvoice('i', { status: 'issued' }),
      makeInvoice('f', { status: 'failed' }),
    ])));
    const { container } = mount();
    await flush();
    for (const [id, label, token] of [['p', 'Paid', 'pass'], ['i', 'Issued', 'skipped'], ['f', 'Failed', 'fail']] as const) {
      const chip = el(container, `invoice-status-${id}`);
      expect(chip?.textContent).toBe(label);
      expect(chip?.getAttribute('data-status')).toBe(token);
      expect(chip?.querySelector('svg')).not.toBeNull();
    }
  });

  test('a PDF that is not available is disabled with the "PDF not available" title', async () => {
    useHandler(() => jsonResponse(page([makeInvoice('nopdf', { pdf_available: false }), makeInvoice('haspdf')])));
    const { container } = mount();
    await flush();
    const disabled = el<HTMLButtonElement>(container, 'invoice-download-nopdf');
    expect(disabled?.disabled).toBe(true);
    expect(disabled?.getAttribute('title')).toBe('PDF not available');
    const enabled = el<HTMLButtonElement>(container, 'invoice-download-haspdf');
    expect(enabled?.disabled).toBe(false);
    expect(enabled?.getAttribute('title')).toBeNull();
    expect(enabled?.getAttribute('aria-label')).toBe('Download invoice INV-2026-haspdf as PDF');

    click(disabled);
    await flush();
    expect(double.calls.filter(isPdf)).toHaveLength(0);
  });
});

describe('InvoiceHistoryCard load more', () => {
  test('no Load more button when has_more is false', async () => {
    const { container } = mount();
    await flush();
    expect(el(container, 'invoice-load-more')).toBeNull();
  });

  test('Load more requests the next page with starting_after and appends, keeping existing rows', async () => {
    useHandler((call) => {
      if (call.url.includes('starting_after=')) {
        return jsonResponse(page([makeInvoice('0003')], false, null));
      }
      return jsonResponse(page([makeInvoice('0002'), makeInvoice('0001')], true, 'in_0001'));
    });
    const { container } = mount();
    await flush();
    expect(container.querySelectorAll('[data-testid^="invoice-row-"]')).toHaveLength(2);

    click(el(container, 'invoice-load-more'));
    await flush();

    expect(double.calls).toHaveLength(2);
    expect(double.calls[1].url).toBe(`${BASE}/invoices?limit=12&starting_after=in_0001`);
    expect(Array.from(container.querySelectorAll('[data-testid^="invoice-row-"]')).map(row => row.getAttribute('data-testid')))
      .toEqual(['invoice-row-0002', 'invoice-row-0001', 'invoice-row-0003']);
    expect(el(container, 'invoice-load-more')).toBeNull();
  });

  test('in flight: Load more is disabled and aria-busy, and a second click sends nothing', async () => {
    let release: (response: Response) => void = () => {};
    useHandler(async (call) => {
      if (call.url.includes('starting_after=')) {
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return jsonResponse(page([makeInvoice('0001')], true, 'in_0001'));
    });
    const { container } = mount();
    await flush();

    click(el(container, 'invoice-load-more'));
    await flush();
    const button = el<HTMLButtonElement>(container, 'invoice-load-more');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    click(button);
    expect(double.calls).toHaveLength(2);

    await act(async () => { release(jsonResponse(page([makeInvoice('0002')]))); });
    await flush();
    expect(el(container, 'invoice-row-0002')).not.toBeNull();
  });

  test('a load-more failure keeps the rows already shown, says so, and can be retried', async () => {
    let failNext = true;
    useHandler((call) => {
      if (call.url.includes('starting_after=')) {
        if (failNext) {
          failNext = false;
          return errorResponse(502, 'upstream_error', 'Upstream down.');
        }
        return jsonResponse(page([makeInvoice('0002')]));
      }
      return jsonResponse(page([makeInvoice('0001')], true, 'in_0001'));
    });
    const { container } = mount();
    await flush();

    click(el(container, 'invoice-load-more'));
    await flush();
    expect(el(container, 'invoice-row-0001')).not.toBeNull();
    expect(el(container, 'invoice-history-error')).toBeNull();
    const alert = el(container, 'invoice-load-more-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('Could not load more invoices. Your list is unchanged, try again.');
    expect(el<HTMLButtonElement>(container, 'invoice-load-more')?.disabled).toBe(false);

    click(el(container, 'invoice-load-more'));
    await flush();
    expect(el(container, 'invoice-row-0002')).not.toBeNull();
    expect(el(container, 'invoice-load-more-error')).toBeNull();
  });
});

describe('InvoiceHistoryCard PDF download', () => {
  test('200: fetches the PDF (never navigates), triggers exactly one download with the invoice name, revokes the blob URL', async () => {
    useHandler(call => (isPdf(call) ? pdfOk() : jsonResponse(page([makeInvoice('0001')]))));
    const { container } = mount();
    await flush();

    click(el(container, 'invoice-download-0001'));
    await flush();

    const pdfCalls = double.calls.filter(isPdf);
    expect(pdfCalls).toHaveLength(1);
    expect(pdfCalls[0].url).toBe(`${BASE}/invoices/0001/pdf`);
    expect(pdfCalls[0].method).toBe('GET');
    expect(anchorClicks).toEqual([{ href: 'blob:mock-invoice', download: 'INV-2026-0001.pdf' }]);
    expect(createdObjectUrls).toBe(1);
    // Deferred: not revoked in the same task as the click.
    expect(revokedObjectUrls).toBe(0);
    await act(async () => { await new Promise<void>((resolve) => { realSetTimeout(resolve, 400); }); });
    expect(revokedObjectUrls).toBe(1);
    // The temporary link is removed again and no inline error is left behind.
    expect(document.body.querySelectorAll('a[download]')).toHaveLength(0);
    expect(el(container, 'invoice-download-error-0001')).toBeNull();
  });

  test('409 invoice_pdf_unavailable: inline row alert, NO download, NO blob, invoice row untouched', async () => {
    useHandler(call => (isPdf(call) ? errorResponse(409, 'invoice_pdf_unavailable', 'PDF not ready.') : jsonResponse(page([makeInvoice('0001')]))));
    const { container } = mount();
    await flush();

    click(el(container, 'invoice-download-0001'));
    await flush();

    const alert = el(container, 'invoice-download-error-0001');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('This invoice PDF is not available right now. Your invoice is unchanged, try again later.');
    // The raw server body is never surfaced.
    expect(container.textContent).not.toContain('PDF not ready.');
    expect(anchorClicks).toHaveLength(0);
    expect(createdObjectUrls).toBe(0);
    expect(el(container, 'invoice-row-0001')).not.toBeNull();
    expect(el(container, 'invoice-status-0001')?.textContent).toBe('Paid');
    // The button is usable again so the viewer can try later.
    expect(el<HTMLButtonElement>(container, 'invoice-download-0001')?.disabled).toBe(false);
  });

  test('any non-200 (404, 500, 204) and a network failure show the same inline message and download nothing', async () => {
    for (const respond of [
      () => errorResponse(404, 'not_found', 'Gone.'),
      () => new Response('boom', { status: 500 }),
      () => new Response(null, { status: 204 }),
      () => { throw new Error('offline'); },
    ]) {
      double?.restore();
      useHandler(call => (isPdf(call) ? respond() : jsonResponse(page([makeInvoice('0001')]))));
      const { container } = mount();
      await flush();
      click(el(container, 'invoice-download-0001'));
      await flush();
      expect(el(container, 'invoice-download-error-0001')?.textContent)
        .toBe('This invoice PDF is not available right now. Your invoice is unchanged, try again later.');
    }
    expect(anchorClicks).toHaveLength(0);
    expect(createdObjectUrls).toBe(0);
  });

  test('per-row loading: only the clicked row is busy, and a second click on it sends nothing', async () => {
    let release: (response: Response) => void = () => {};
    useHandler(async (call) => {
      if (isPdf(call)) { return new Promise<Response>((resolve) => { release = resolve; }); }
      return jsonResponse(page([makeInvoice('0001'), makeInvoice('0002')]));
    });
    const { container } = mount();
    await flush();

    click(el(container, 'invoice-download-0001'));
    await flush();
    const busy = el<HTMLButtonElement>(container, 'invoice-download-0001');
    expect(busy?.disabled).toBe(true);
    expect(busy?.getAttribute('aria-busy')).toBe('true');
    expect(el<HTMLButtonElement>(container, 'invoice-download-0002')?.disabled).toBe(false);
    click(busy);
    expect(double.calls.filter(isPdf)).toHaveLength(1);

    await act(async () => { release(pdfOk()); });
    await flush();
    expect(el<HTMLButtonElement>(container, 'invoice-download-0001')?.disabled).toBe(false);
    expect(anchorClicks).toHaveLength(1);
  });

  test('a row error clears on a successful retry', async () => {
    let pdfAttempts = 0;
    useHandler((call) => {
      if (isPdf(call)) {
        pdfAttempts += 1;
        return pdfAttempts === 1 ? errorResponse(409, 'invoice_pdf_unavailable', 'nope') : pdfOk();
      }
      return jsonResponse(page([makeInvoice('0001')]));
    });
    const { container } = mount();
    await flush();

    click(el(container, 'invoice-download-0001'));
    await flush();
    expect(el(container, 'invoice-download-error-0001')).not.toBeNull();

    click(el(container, 'invoice-download-0001'));
    await flush();
    expect(el(container, 'invoice-download-error-0001')).toBeNull();
    expect(anchorClicks).toHaveLength(1);
  });

  test('a file name with unsafe characters is sanitised', async () => {
    useHandler(call => (isPdf(call) ? pdfOk() : jsonResponse(page([makeInvoice('0001', { number: '../INV 2026/07' })]))));
    const { container } = mount();
    await flush();
    click(el(container, 'invoice-download-0001'));
    await flush();
    expect(anchorClicks[0].download).toBe('.._INV_2026_07.pdf');
  });
});
