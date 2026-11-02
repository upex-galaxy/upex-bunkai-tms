import type { Principal } from '@lib/api/principal';
import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-231 — route-level coverage for the billing maintenance endpoints:
//   PATCH billing/details · POST billing/payment-method · POST billing/retry
//   GET billing/invoices · GET billing/invoices/{id}/pdf · GET billing (extended)
//
// Drives the REAL exported handlers (capability gate, workspace-context match,
// owner gate, validation, error serialisation). Only the edges that would need
// a live session, database or Stripe account are substituted, with `spyOn` on
// the module namespace (restored after every test), never `mock.module`:
//   - resolveIdentity                  -> a fixed principal
//   - the idempotency begin/record/discard calls -> in-memory
//   - the billing services themselves  -> canned answers (their logic is covered
//     in lib/billing/*.test.ts; here the question is routing and gating)
// This proves routing and authorization only. Nothing here exercises Stripe.

void mock.module('server-only', () => ({}));

const principalModule = await import('@lib/api/principal');
const idempotencyModule = await import('@lib/api/idempotency');
const detailsService = await import('@lib/billing/billing-details');
const paymentMethodService = await import('@lib/billing/payment-method');
const retryService = await import('@lib/billing/retry');
const invoicesService = await import('@lib/billing/invoices');
const summaryService = await import('@lib/billing/summary');
const rpcModule = await import('@lib/supabase/rpc');
const { ApiError } = await import('@lib/api/error-envelope');

const details = await import('./details/route');
const paymentMethod = await import('./payment-method/route');
const retry = await import('./retry/route');
const invoices = await import('./invoices/route');
const invoicePdf = await import('./invoices/[invoiceId]/pdf/route');
const overview = await import('./route');

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const BASE = `https://app.test/api/v1/workspaces/${WS}/billing`;

interface ErrorBody { error: { code: string, message: string, details?: Record<string, unknown> } }

const VALID_BODY = {
  company_name: 'Upex Systems S.L.',
  billing_email: 'billing@upex.dev',
  address_line1: 'Calle de Serrano 41',
  city: 'Madrid',
  postal_code: '28001',
  country: 'es',
};

function principal(opts: { isOwner?: boolean, via?: 'cookie' | 'bearer', scopes?: string[], workspaceId?: string | null } = {}): Principal {
  const via = opts.via ?? 'cookie';
  return {
    userId: USER_ID,
    workspaceId: opts.workspaceId ?? null,
    capabilities: via === 'cookie' ? [...principalModule.ALL_CAPABILITIES] : (opts.scopes ?? []),
    via,
    tokenId: via === 'bearer' ? 'tok_test' : null,
    db: {
      rpc: async (fn: string) => {
        if (fn === 'bunkai_is_workspace_owner') {
          return { data: opts.isOwner ?? true, error: null };
        }
        throw new Error(`unexpected rpc call: ${fn}`);
      },
      from: () => { throw new Error('unexpected table access through the caller client'); },
    } as unknown as Principal['db'],
  };
}

function request(path: string, init: { method?: string, body?: unknown, headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer bk_pat_test', 'idempotency-key': 'route-test-key-000000000001', ...init.headers },
    ...(init.body === undefined ? {} : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
  });
}

let spies: Mock<(...args: never[]) => unknown>[] = [];
let recordSpy: Mock<(...args: never[]) => unknown>;
let discardSpy: Mock<(...args: never[]) => unknown>;
let beginSpy: Mock<(...args: never[]) => unknown>;

function asPrincipal(p: Principal): void {
  spies.push(spyOn(principalModule, 'resolveIdentity').mockImplementation(async () => p) as never);
}

beforeEach(() => {
  spies = [];
  beginSpy = spyOn(idempotencyModule, 'beginIdempotentRequest').mockImplementation(async () => ({
    isReplay: false as const,
    token: { key: 'route-test-key-000000000001', userId: USER_ID, endpoint: 'e', rowId: 'row' },
  })) as never;
  recordSpy = spyOn(idempotencyModule, 'recordIdempotencyResult').mockImplementation(async () => {}) as never;
  discardSpy = spyOn(idempotencyModule, 'discardIdempotencyResult').mockImplementation(async () => {}) as never;
  spies.push(beginSpy, recordSpy, discardSpy);
});
afterEach(() => { spies.forEach(spy => spy.mockRestore()); });

describe('PATCH billing/details', () => {
  test('the owner saves valid details and gets the stored profile back (Scenario 1.1)', async () => {
    asPrincipal(principal());
    const save = spyOn(detailsService, 'saveBillingDetails').mockResolvedValue({ company_name: 'Upex Systems S.L.' } as never);
    spies.push(save as never);

    const response = await details.PATCH(request('/details', { method: 'PATCH', body: VALID_BODY }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ company_name: 'Upex Systems S.L.' });
    expect(save.mock.calls[0][0]).toMatchObject({ workspaceId: WS, userId: USER_ID, input: { country: 'ES', address_line2: null, region: null } });
  });

  test('an admin who is not the owner gets 403 not_workspace_owner and nothing is parsed or saved', async () => {
    asPrincipal(principal({ isOwner: false }));
    const save = spyOn(detailsService, 'saveBillingDetails');
    spies.push(save as never);

    const response = await details.PATCH(request('/details', { method: 'PATCH', body: { garbage: true } }));

    expect(response.status).toBe(403);
    expect((await response.json() as ErrorBody).error.details?.reason).toBe('not_workspace_owner');
    expect(save).not.toHaveBeenCalled();
  });

  test.each([
    ['a missing required field', { ...VALID_BODY, company_name: undefined }],
    ['a malformed email', { ...VALID_BODY, billing_email: 'nope' }],
    ['a value beyond the limit', { ...VALID_BODY, company_name: 'x'.repeat(121) }],
  ])('rejects %s with 422 and saves nothing (Scenario 1.2)', async (_label, body) => {
    asPrincipal(principal());
    const save = spyOn(detailsService, 'saveBillingDetails');
    spies.push(save as never);

    const response = await details.PATCH(request('/details', { method: 'PATCH', body }));

    expect(response.status).toBe(422);
    expect((await response.json() as ErrorBody).error.code).toBe('validation_failed');
    expect(save).not.toHaveBeenCalled();
  });

  test('a body that is not JSON answers 400', async () => {
    asPrincipal(principal());
    const response = await details.PATCH(request('/details', { method: 'PATCH', body: '{not json' }));
    expect(response.status).toBe(400);
  });

  test('a default PAT without workspace:admin is rejected with missing_capability', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['atc:read'] }));
    const response = await details.PATCH(request('/details', { method: 'PATCH', body: VALID_BODY }));
    expect(response.status).toBe(403);
    expect((await response.json() as ErrorBody).error.details).toEqual({ reason: 'missing_capability', required_capability: 'workspace:admin' });
  });

  test('a PAT bound to another workspace is rejected', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['workspace:admin'], workspaceId: OTHER_WS }));
    const response = await details.PATCH(request('/details', { method: 'PATCH', body: VALID_BODY }));
    expect(response.status).toBe(403);
  });
});

describe('POST billing/payment-method', () => {
  test('the owner gets the hosted setup URL and the result is stored for replay', async () => {
    asPrincipal(principal());
    const begin = spyOn(paymentMethodService, 'beginPaymentMethodUpdate').mockResolvedValue({ url: 'https://checkout.stripe.test/setup' });
    spies.push(begin as never);

    const response = await paymentMethod.POST(request('/payment-method', { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.test/setup' });
    expect(begin.mock.calls[0][0]).toMatchObject({ workspaceId: WS, idempotencyKey: 'route-test-key-000000000001' });
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  test('a replayed key returns the stored answer without opening a second session', async () => {
    asPrincipal(principal());
    beginSpy.mockImplementation((async () => ({ isReplay: true, snapshot: { url: 'https://checkout.stripe.test/first' }, status: 200 })) as never);
    const begin = spyOn(paymentMethodService, 'beginPaymentMethodUpdate');
    spies.push(begin as never);

    const response = await paymentMethod.POST(request('/payment-method', { method: 'POST' }));

    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.test/first' });
    expect(begin).not.toHaveBeenCalled();
  });

  test('a non-owner is refused before the idempotency row is written', async () => {
    asPrincipal(principal({ isOwner: false }));
    const response = await paymentMethod.POST(request('/payment-method', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(beginSpy).not.toHaveBeenCalled();
  });

  test('a processor failure is not stored, so a fresh key can retry', async () => {
    asPrincipal(principal());
    const begin = spyOn(paymentMethodService, 'beginPaymentMethodUpdate').mockRejectedValue(new ApiError('upstream_error', 'The payment processor could not complete the request. Please try again in a moment.'));
    spies.push(begin as never);

    const response = await paymentMethod.POST(request('/payment-method', { method: 'POST' }));

    expect(response.status).toBe(502);
    expect(discardSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).not.toHaveBeenCalled();
  });
});

describe('POST billing/retry', () => {
  test('the owner retries and gets recovered only when the service confirms it (Scenario 4.4)', async () => {
    asPrincipal(principal());
    spies.push(spyOn(retryService, 'retryFailedRenewal').mockResolvedValue({ status: 'recovered' }) as never);

    const response = await retry.POST(request('/retry', { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'recovered' });
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  test.each([
    [new ApiError('payment_declined', 'The payment was declined. Check the payment method and try again.', { details: { reason: 'card_declined' } }), 402],
    [new ApiError('retry_not_available', 'Replace the payment method before retrying the charge.', { details: { reason: 'payment_method_not_replaced' } }), 409],
    [new ApiError('upstream_error', 'We could not confirm the payment.'), 502],
  ])('a refused or unconfirmed retry (%#) keeps its status and is not stored (Scenario 4.5)', async (failure, status) => {
    asPrincipal(principal());
    spies.push(spyOn(retryService, 'retryFailedRenewal').mockRejectedValue(failure) as never);

    const response = await retry.POST(request('/retry', { method: 'POST' }));

    expect(response.status).toBe(status);
    expect(discardSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).not.toHaveBeenCalled();
  });

  test('an admin who is not the owner is refused before any retry work', async () => {
    asPrincipal(principal({ isOwner: false }));
    const service = spyOn(retryService, 'retryFailedRenewal');
    spies.push(service as never);
    const response = await retry.POST(request('/retry', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(service).not.toHaveBeenCalled();
    expect(beginSpy).not.toHaveBeenCalled();
  });
});

describe('GET billing/invoices', () => {
  const page = { data: [], has_more: false, next_cursor: null };

  test('lists with the default page size and forwards the cursor', async () => {
    asPrincipal(principal());
    const list = spyOn(invoicesService, 'listWorkspaceInvoices').mockResolvedValue(page);
    spies.push(list as never);

    const response = await invoices.GET(request('/invoices?starting_after=in_abcdef123'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(list.mock.calls[0][0]).toMatchObject({ workspaceId: WS, limit: 12, startingAfter: 'in_abcdef123' });
  });

  test.each(['0', '25', 'abc', '1.5'])('rejects limit=%s with 400', async (limit) => {
    asPrincipal(principal());
    const list = spyOn(invoicesService, 'listWorkspaceInvoices');
    spies.push(list as never);
    const response = await invoices.GET(request(`/invoices?limit=${limit}`));
    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  test('rejects a cursor that is not an invoice id', async () => {
    asPrincipal(principal());
    const response = await invoices.GET(request('/invoices?starting_after=../x'));
    expect(response.status).toBe(400);
  });

  test('the service\'s uniform 404 reaches the caller (Scenario 3.3)', async () => {
    asPrincipal(principal({ isOwner: false }));
    spies.push(spyOn(invoicesService, 'listWorkspaceInvoices').mockRejectedValue(new ApiError('not_found', 'Billing not found.')) as never);
    const response = await invoices.GET(request('/invoices'));
    expect(response.status).toBe(404);
  });

  test('a PAT without atc:read is refused', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['run:execute'] }));
    const response = await invoices.GET(request('/invoices'));
    expect(response.status).toBe(403);
  });
});

describe('GET billing/invoices/{invoiceId}/pdf', () => {
  test('serves the PDF as a private attachment, never cached (Scenario 3.2)', async () => {
    asPrincipal(principal());
    const bytes = new TextEncoder().encode('%PDF-1.7 test').buffer;
    const get = spyOn(invoicesService, 'getInvoicePdf').mockResolvedValue({ bytes, filename: 'INV-2026-0103.pdf' });
    spies.push(get as never);

    const response = await invoicePdf.GET(request('/invoices/in_march0001/pdf'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="INV-2026-0103.pdf"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('%PDF-1.7 test');
    expect(get.mock.calls[0][0]).toMatchObject({ workspaceId: WS, invoiceId: 'in_march0001' });
  });

  test('an unavailable PDF is a recoverable JSON 409 and never a download (Scenario 3.4)', async () => {
    asPrincipal(principal());
    spies.push(spyOn(invoicesService, 'getInvoicePdf').mockRejectedValue(new ApiError('invoice_pdf_unavailable', 'not available', { details: { retryable: true } })) as never);

    const response = await invoicePdf.GET(request('/invoices/in_march0001/pdf'));

    expect(response.status).toBe(409);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json() as ErrorBody).error.code).toBe('invoice_pdf_unavailable');
  });

  test('a foreign or unknown invoice is a 404', async () => {
    asPrincipal(principal());
    spies.push(spyOn(invoicesService, 'getInvoicePdf').mockRejectedValue(new ApiError('not_found', 'Invoice not found.')) as never);
    const response = await invoicePdf.GET(request('/invoices/in_foreign001/pdf'));
    expect(response.status).toBe(404);
  });
});

describe('GET billing (overview, extended)', () => {
  const OVERVIEW = { plan: 'cloud', stored_plan: 'cloud', grace_ends_at: null, purchased_seats: 4, active_seats: 3, project_count: 2, oldest_run_age_days: 10 };

  test('adds the billing block to the BK-229 overview', async () => {
    asPrincipal(principal());
    spies.push(spyOn(rpcModule, 'getWorkspaceBillingOverview').mockResolvedValue({ data: OVERVIEW, error: null } as never) as never);
    const block = { can_edit: true, profile: null, payment_method: null, payment_state: 'paid', subscription_state: 'active_paid', grace: null, retry_available: false };
    spies.push(spyOn(summaryService, 'loadBillingBlock').mockResolvedValue(block as never) as never);

    const response = await overview.GET(request(''));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ plan: 'cloud', stored_plan: 'cloud', grace_ends_at: null, billing: block, active_seats: 3 });
  });

  test('reports the effective plan after the grace expiry and keeps the stored one', async () => {
    asPrincipal(principal());
    spies.push(spyOn(rpcModule, 'getWorkspaceBillingOverview').mockResolvedValue({
      data: { ...OVERVIEW, plan: 'community', stored_plan: 'cloud', grace_ends_at: '2026-10-15T12:00:00+00:00' },
      error: null,
    } as never) as never);
    spies.push(spyOn(summaryService, 'loadBillingBlock').mockResolvedValue(null) as never);

    const body = await (await overview.GET(request(''))).json() as Record<string, unknown>;

    expect(body).toMatchObject({ plan: 'community', stored_plan: 'cloud', billing: null });
    expect(body.grace_ends_at).toBe('2026-10-15T12:00:00+00:00');
  });

  test('still answers a uniform 404 to a caller who may not read billing', async () => {
    asPrincipal(principal());
    spies.push(spyOn(rpcModule, 'getWorkspaceBillingOverview').mockResolvedValue({ data: null, error: null } as never) as never);
    const loader = spyOn(summaryService, 'loadBillingBlock');
    spies.push(loader as never);

    const response = await overview.GET(request(''));

    expect(response.status).toBe(404);
    expect(loader).not.toHaveBeenCalled();
  });
});
