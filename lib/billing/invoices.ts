import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { ApiError } from '@lib/api/error-envelope';
import { requireBillingReader } from '@lib/billing/billing-state';
import { isStripeMissingResource, toProcessorError } from '@lib/billing/errors';
import { getStripeClient } from '@lib/billing/stripe';

type Client = SupabaseClient<Database>;

export const INVOICE_PAGE_DEFAULT = 12;
export const INVOICE_PAGE_MAX = 24;

// Upper bound of Stripe reads for one history page (see listWorkspaceInvoices).
const MAX_STRIPE_READS_PER_PAGE = 5;

const PDF_FETCH_TIMEOUT_MS = 10_000;
const INVOICE_ID_PATTERN = /^in_\w{4,64}$/;

export type InvoiceStatus = 'paid' | 'issued' | 'failed';

export interface InvoiceListItem {
  id: string
  number: string | null
  status: InvoiceStatus
  period_start: string | null
  period_end: string | null
  amount_cents: number
  currency: string
  seat_quantity: number | null
  pdf_available: boolean
  created_at: string
}

export interface InvoiceListResult {
  data: InvoiceListItem[]
  has_more: boolean
  next_cursor: string | null
}

function iso(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000).toISOString() : null;
}

function customerIdOf(invoice: Stripe.Invoice): string | null {
  return typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);
}

// Eligible for the history: invoices that were actually issued. Drafts are not
// issued yet and voids were cancelled, so neither is shown (2026-11-02 AI
// Product Owner ruling, comment 13337).
function isEligible(invoice: Stripe.Invoice): boolean {
  return invoice.status === 'open' || invoice.status === 'paid' || invoice.status === 'uncollectible';
}

function displayStatus(invoice: Stripe.Invoice, failedInvoiceId: string | null): InvoiceStatus {
  if (invoice.status === 'paid') {
    return 'paid';
  }
  if (invoice.status === 'uncollectible' || (invoice.id && invoice.id === failedInvoiceId)) {
    return 'failed';
  }
  return 'issued';
}

// The billed period and the seat count come from the subscription line: the
// invoice-level period_start / period_end is a look-back window, not the period
// the customer was charged for (Invoice object reference).
export function toInvoiceListItem(invoice: Stripe.Invoice, failedInvoiceId: string | null): InvoiceListItem {
  const line = invoice.lines?.data?.find(candidate => candidate.period) ?? null;
  const quantityLine = invoice.lines?.data?.find(candidate => typeof candidate.quantity === 'number') ?? null;
  return {
    id: invoice.id,
    number: invoice.number,
    status: displayStatus(invoice, failedInvoiceId),
    period_start: iso(line?.period.start ?? invoice.period_start),
    period_end: iso(line?.period.end ?? invoice.period_end),
    amount_cents: invoice.total,
    currency: invoice.currency,
    seat_quantity: quantityLine?.quantity ?? null,
    pdf_available: Boolean(invoice.invoice_pdf),
    created_at: new Date(invoice.created * 1000).toISOString(),
  };
}

export interface ListInvoicesArgs {
  db: Client
  workspaceId: string
  limit: number
  startingAfter?: string
}

// GET /billing/invoices. Scope and authorization are the workspace -> customer
// mapping read through the caller's own RLS client (owner/admin only): the
// Stripe customer is never taken from the request.
export async function listWorkspaceInvoices(args: ListInvoicesArgs): Promise<InvoiceListResult> {
  const { db, workspaceId, startingAfter } = args;
  const limit = Math.min(Math.max(Math.trunc(args.limit), 1), INVOICE_PAGE_MAX);

  const { state } = await requireBillingReader(db, workspaceId);
  const stripe = getStripeClient();

  // Eligibility is applied after Stripe's own paging, so a page made only of drafts
  // and voids would look like "no invoices" while older ones exist. Keep reading
  // (bounded) until the page is full or Stripe has no more.
  const collected: Stripe.Invoice[] = [];
  let cursor = startingAfter;
  let hasMore = false;
  try {
    for (let reads = 0; reads < MAX_STRIPE_READS_PER_PAGE; reads += 1) {
      const page: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
        customer: state.stripe_customer_id,
        limit,
        ...(cursor ? { starting_after: cursor } : {}),
      });
      hasMore = page.has_more;
      const last = page.data.at(-1);
      for (const invoice of page.data) {
        if (isEligible(invoice)) {
          collected.push(invoice);
        }
      }
      cursor = last?.id;
      if (collected.length >= limit || !page.has_more || !cursor) {
        break;
      }
    }
  }
  catch (raw) {
    if (isStripeMissingResource(raw) && startingAfter) {
      throw new ApiError('bad_request', 'The invoice cursor is not valid.');
    }
    throw toProcessorError(raw, 'stripe invoices list failed', { workspaceId });
  }

  // More than a page may have been collected on the last read: return exactly
  // `limit` and point the cursor at the last invoice RETURNED, so nothing is skipped.
  const returned = collected.slice(0, limit);
  const truncated = collected.length > limit;
  const nextCursor = truncated || hasMore ? (returned.at(-1)?.id ?? cursor ?? null) : null;
  return {
    data: returned.map(invoice => toInvoiceListItem(invoice, state.failed_invoice_id)),
    has_more: truncated || hasMore,
    next_cursor: nextCursor,
  };
}

export interface InvoicePdf {
  bytes: ArrayBuffer
  filename: string
}

function pdfUnavailable(): ApiError {
  return new ApiError(
    'invoice_pdf_unavailable',
    'This invoice PDF is not available right now. Your invoice details are unchanged, please try again later.',
    { details: { reason: 'invoice_pdf_unavailable', retryable: true } },
  );
}

function invoiceNotFound(): ApiError {
  return new ApiError('not_found', 'Invoice not found.');
}

// The PDF link is Stripe-hosted; only an https URL on stripe.com is ever fetched
// on the server, so a corrupted field can never turn this route into a proxy.
function isTrustedPdfUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && (url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'));
  }
  catch {
    return false;
  }
}

export interface GetInvoicePdfArgs {
  db: Client
  workspaceId: string
  invoiceId: string
}

// GET /billing/invoices/{invoiceId}/pdf. Authorization order: the workspace's
// customer (RLS-scoped, owner/admin) first, then the invoice's own customer must
// be that same customer. Every failure to prove ownership answers the same 404,
// whether the invoice exists elsewhere or not. The bytes are proxied, never a
// redirect, so no raw provider URL reaches the client.
export async function getInvoicePdf(args: GetInvoicePdfArgs): Promise<InvoicePdf> {
  const { db, workspaceId, invoiceId } = args;

  const { state } = await requireBillingReader(db, workspaceId);
  if (!INVOICE_ID_PATTERN.test(invoiceId)) {
    throw invoiceNotFound();
  }

  const stripe = getStripeClient();
  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(invoiceId);
  }
  catch (raw) {
    if (isStripeMissingResource(raw)) {
      throw invoiceNotFound();
    }
    throw toProcessorError(raw, 'stripe invoice retrieve failed', { workspaceId, invoiceId });
  }

  if (customerIdOf(invoice) !== state.stripe_customer_id || !isEligible(invoice)) {
    throw invoiceNotFound();
  }
  if (!invoice.invoice_pdf || !isTrustedPdfUrl(invoice.invoice_pdf)) {
    throw pdfUnavailable();
  }

  let response: Response;
  try {
    response = await fetch(invoice.invoice_pdf, { signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS) });
  }
  catch (raw) {
    console.error('invoice pdf fetch failed', { workspaceId, invoiceId, error: raw instanceof Error ? raw.message : String(raw) });
    throw pdfUnavailable();
  }
  if (!response.ok) {
    console.error('invoice pdf fetch returned a non-2xx status', { workspaceId, invoiceId, status: response.status });
    throw pdfUnavailable();
  }

  const bytes = await response.arrayBuffer();
  // A real PDF starts with "%PDF-". Anything else (an HTML error page, an empty
  // body) must never be served as a download.
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (bytes.byteLength === 0 || header !== '%PDF-') {
    console.error('invoice pdf body is not a pdf', { workspaceId, invoiceId, length: bytes.byteLength });
    throw pdfUnavailable();
  }

  return { bytes, filename: `${(invoice.number ?? invoiceId).replace(/[^\w.-]/g, '_')}.pdf` };
}
