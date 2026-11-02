import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { CUSTOMER_ID, fakeSupabase, rejection, stateRow, WORKSPACE_ID } from './test-doubles';

// BK-231 — invoice history and PDF download (Scenarios 3.1-3.4). Stripe is a
// double; the workspace -> customer mapping is read through a fake of the
// caller's RLS client (null = a caller RLS does not let read it).

void mock.module('server-only', () => ({}));

const stripeModule = await import('@lib/billing/stripe');
const { getInvoicePdf, listWorkspaceInvoices, toInvoiceListItem } = await import('./invoices');

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in_march0001',
    number: 'INV-2026-0103',
    status: 'paid',
    customer: CUSTOMER_ID,
    currency: 'eur',
    total: 7800,
    created: 1_772_000_000,
    period_start: 1_000,
    period_end: 2_000,
    invoice_pdf: 'https://pay.stripe.com/invoice/acct_1/test_x/pdf',
    lines: { data: [{ quantity: 4, period: { start: 1_772_323_200, end: 1_774_915_200 } }] },
    ...overrides,
  };
}

let invoicesList: Mock<(params: Record<string, unknown>) => Promise<unknown>>;
let invoicesRetrieve: Mock<(id: string) => Promise<unknown>>;
let spies: Array<{ mockRestore: () => void }>;

function callerWith(state: unknown) {
  return fakeSupabase(call => (call.table === 'workspace_billing_state' ? { data: state, error: null } : { data: null, error: null }));
}

beforeEach(() => {
  invoicesList = mock(async () => ({ data: [], has_more: false }));
  invoicesRetrieve = mock(async () => invoice());
  spies = [spyOn(stripeModule, 'getStripeClient').mockReturnValue({ invoices: { list: invoicesList, retrieve: invoicesRetrieve } } as never)];
});
afterEach(() => { spies.forEach(spy => spy.mockRestore()); });

describe('toInvoiceListItem', () => {
  test('reads the billed period and seat count from the subscription line, not the look-back window', () => {
    const item = toInvoiceListItem(invoice() as never, null);
    expect(item).toMatchObject({
      id: 'in_march0001',
      number: 'INV-2026-0103',
      status: 'paid',
      amount_cents: 7800,
      currency: 'eur',
      seat_quantity: 4,
      pdf_available: true,
      period_start: new Date(1_772_323_200 * 1000).toISOString(),
      period_end: new Date(1_774_915_200 * 1000).toISOString(),
    });
  });

  test('marks the invoice behind a failed renewal as failed, and a plain open one as issued', () => {
    expect(toInvoiceListItem(invoice({ status: 'open' }) as never, 'in_march0001').status).toBe('failed');
    expect(toInvoiceListItem(invoice({ status: 'open' }) as never, 'in_other').status).toBe('issued');
    expect(toInvoiceListItem(invoice({ status: 'uncollectible' }) as never, null).status).toBe('failed');
  });

  test('reports a missing PDF link as not available', () => {
    expect(toInvoiceListItem(invoice({ invoice_pdf: null }) as never, null).pdf_available).toBe(false);
  });
});

describe('listWorkspaceInvoices', () => {
  test('lists the workspace customer\'s issued invoices newest first and hides drafts and voids', async () => {
    invoicesList.mockResolvedValue({
      data: [
        invoice({ id: 'in_draft0001', status: 'draft' }),
        invoice({ id: 'in_july00001', status: 'open', number: 'INV-2026-0107' }),
        invoice({ id: 'in_void00001', status: 'void' }),
        invoice({ id: 'in_june00001', number: 'INV-2026-0106' }),
      ],
      has_more: false,
    });
    const caller = callerWith(stateRow({ failed_invoice_id: 'in_july00001' }));

    const result = await listWorkspaceInvoices({ db: caller.client, workspaceId: WORKSPACE_ID, limit: 12 });

    expect(result.data.map(item => [item.id, item.status])).toEqual([['in_july00001', 'failed'], ['in_june00001', 'paid']]);
    expect(result.has_more).toBe(false);
    expect(result.next_cursor).toBeNull();
    // The customer comes from the RLS-scoped mapping, never from the request.
    expect(invoicesList.mock.calls[0][0]).toMatchObject({ customer: CUSTOMER_ID, limit: 12 });
  });

  test('pages with the last invoice id as cursor and clamps the page size', async () => {
    invoicesList.mockResolvedValue({ data: [invoice({ id: 'in_a0000001' }), invoice({ id: 'in_b0000001' })], has_more: true });
    const caller = callerWith(stateRow());

    const result = await listWorkspaceInvoices({ db: caller.client, workspaceId: WORKSPACE_ID, limit: 500, startingAfter: 'in_prev0001' });

    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe('in_b0000001');
    expect(invoicesList.mock.calls[0][0]).toMatchObject({ limit: 24, starting_after: 'in_prev0001' });
  });

  test('returns an empty history for a workspace with no invoice yet', async () => {
    const caller = callerWith(stateRow());
    expect(await listWorkspaceInvoices({ db: caller.client, workspaceId: WORKSPACE_ID, limit: 12 }))
      .toEqual({ data: [], has_more: false, next_cursor: null });
  });

  test('answers a uniform 404 when RLS shows the caller no billing state (member, Community, other workspace)', async () => {
    const caller = callerWith(null);
    expect(await rejection(listWorkspaceInvoices({ db: caller.client, workspaceId: WORKSPACE_ID, limit: 12 }))).toMatchObject({ code: 'not_found', status: 404 });
    expect(invoicesList).not.toHaveBeenCalled();
  });

  test('maps a Stripe failure to a generic 502 that does not echo Stripe text', async () => {
    invoicesList.mockRejectedValue(new Error('Invalid API Key provided: sk_test_secret'));
    const failure = await listWorkspaceInvoices({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, limit: 12 }).catch(error => error);
    expect(failure).toMatchObject({ code: 'upstream_error', status: 502 });
    expect(failure.message).not.toContain('sk_test_secret');
  });
});

describe('getInvoicePdf', () => {
  const PDF_BYTES = new TextEncoder().encode('%PDF-1.7 fake invoice').buffer;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => new Response(PDF_BYTES, { status: 200 })) as never);
  });
  afterEach(() => { fetchSpy.mockRestore(); });

  test('proxies the PDF bytes for an invoice of the workspace customer (Scenario 3.2)', async () => {
    const result = await getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_march0001' });
    expect(result.filename).toBe('INV-2026-0103.pdf');
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe('%PDF-');
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://pay.stripe.com/invoice/acct_1/test_x/pdf');
  });

  test('answers 404 for an invoice that belongs to another customer, like one that does not exist (Scenario 3.3)', async () => {
    invoicesRetrieve.mockResolvedValue(invoice({ customer: 'cus_someone_else' }));
    const foreign = await getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_foreign001' }).catch(error => error);

    invoicesRetrieve.mockRejectedValue(Object.assign(new Error('No such invoice'), { code: 'resource_missing' }));
    const missing = await getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_missing001' }).catch(error => error);

    expect(foreign).toMatchObject({ code: 'not_found', status: 404 });
    expect(missing).toMatchObject({ code: 'not_found', status: 404 });
    expect(foreign.message).toBe(missing.message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('answers 404 when the caller has no billing access, before asking Stripe anything', async () => {
    expect(await rejection(getInvoicePdf({ db: callerWith(null).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_march0001' }))).toMatchObject({ code: 'not_found', status: 404 });
    expect(invoicesRetrieve).not.toHaveBeenCalled();
  });

  test('rejects an identifier that is not an invoice id without calling Stripe', async () => {
    expect(await rejection(getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: '../etc/passwd' }))).toMatchObject({ code: 'not_found' });
    expect(invoicesRetrieve).not.toHaveBeenCalled();
  });

  test('hides drafts and voids behind the same 404', async () => {
    invoicesRetrieve.mockResolvedValue(invoice({ status: 'draft' }));
    expect(await rejection(getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_draft0001' }))).toMatchObject({ code: 'not_found' });
  });

  test('answers a recoverable 409 when the invoice has no PDF, and downloads nothing (Scenario 3.4)', async () => {
    invoicesRetrieve.mockResolvedValue(invoice({ invoice_pdf: null }));
    expect(await rejection(getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_march0001' }))).toMatchObject({ code: 'invoice_pdf_unavailable', status: 409, details: { retryable: true } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('never fetches a PDF link that is not an https stripe.com URL', async () => {
    invoicesRetrieve.mockResolvedValue(invoice({ invoice_pdf: 'https://evil.example.com/x.pdf' }));
    expect(await rejection(getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_march0001' }))).toMatchObject({ code: 'invoice_pdf_unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    ['an error status', () => new Response('nope', { status: 500 })],
    ['an empty body', () => new Response('', { status: 200 })],
    ['an html error page', () => new Response('<html>oops</html>', { status: 200 })],
  ])('serves no file when the provider returns %s', async (_label, respond) => {
    fetchSpy.mockImplementation((async () => respond()) as never);
    expect(await rejection(getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_march0001' }))).toMatchObject({ code: 'invoice_pdf_unavailable', status: 409 });
  });

  test('serves no file when the provider cannot be reached', async () => {
    fetchSpy.mockImplementation((async () => { throw new Error('network down'); }) as never);
    expect(await rejection(getInvoicePdf({ db: callerWith(stateRow()).client, workspaceId: WORKSPACE_ID, invoiceId: 'in_march0001' }))).toMatchObject({ code: 'invoice_pdf_unavailable' });
  });
});
