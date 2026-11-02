'use client';

import { formatMoney, formatUtcDate } from '@components/billing/billing-format';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { AlertTriangle, Check, Clock, Download, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Invoice {
  id: string
  number: string | null
  status: 'paid' | 'issued' | 'failed'
  period_start: string | null
  period_end: string | null
  amount_cents: number
  currency: string
  seat_quantity: number | null
  pdf_available: boolean
  created_at: string
}

interface InvoicePage {
  data: Invoice[]
  has_more: boolean
  next_cursor: string | null
}

interface InvoiceHistoryCardProps {
  workspaceId: string
  refreshKey?: number
}

type ViewState = 'loading' | 'ready' | 'error' | 'unavailable';
type RowState = 'downloading' | 'error';

const PAGE_SIZE = 12;
const FETCH_TIMEOUT_MS = 10_000;
const PDF_TIMEOUT_MS = 30_000;
const BLOB_REVOKE_DELAY_MS = 250;
const TABLE_LABEL = 'Invoice history: invoice number, billing period, seats, amount, status, download';
const PDF_ERROR_MESSAGE = 'This invoice PDF is not available right now. Your invoice is unchanged, try again later.';
const LOAD_MORE_ERROR_MESSAGE = 'Could not load more invoices. Your list is unchanged, try again.';

const COLUMNS = ['Invoice', 'Period', 'Seats', 'Amount', 'Status', 'Download'] as const;

const STATUS_CHIP: Record<Invoice['status'], { label: string, token: 'pass' | 'fail' | 'skipped', Icon: typeof Check }> = {
  paid: { label: 'Paid', token: 'pass', Icon: Check },
  issued: { label: 'Issued', token: 'skipped', Icon: Clock },
  failed: { label: 'Failed', token: 'fail', Icon: X },
};

function formatPeriod(invoice: Invoice): string {
  const start = formatUtcDate(invoice.period_start);
  const end = formatUtcDate(invoice.period_end);
  if (start && end) { return `${start} to ${end} UTC`; }
  if (start) { return `From ${start} UTC`; }
  if (end) { return `Until ${end} UTC`; }
  return 'n/a';
}

function pdfFileName(invoice: Invoice): string {
  const base = (invoice.number ?? invoice.id).replace(/[^\w.-]+/g, '_');
  return `${base}.pdf`;
}

// Invoice history card (BK-231). Fetches its own first page and refetches when
// `workspaceId` or `refreshKey` change (the parent bumps the key after a
// recovered renewal). Same abort/timeout idiom as BillingOverviewView: a
// request counts as superseded only when a newer one replaced it, so the 10s
// timeout surfaces as the error card rather than an endless skeleton.
export function InvoiceHistoryCard({ workspaceId, refreshKey = 0 }: InvoiceHistoryCardProps) {
  const [state, setState] = useState<ViewState>('loading');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const inFlight = useRef<AbortController | null>(null);
  const moreFlight = useRef<AbortController | null>(null);

  const basePath = `/api/v1/workspaces/${workspaceId}/billing`;

  const load = useCallback(async () => {
    inFlight.current?.abort();
    moreFlight.current?.abort();
    moreFlight.current = null;
    setLoadingMore(false);
    setLoadMoreError(null);
    setRowStates({});
    if (!workspaceId) {
      inFlight.current = null;
      setState('error');
      return;
    }
    setState('loading');
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${basePath}/invoices?limit=${PAGE_SIZE}`, { signal: controller.signal });
      if (inFlight.current !== controller) { return; }
      if (response.status === 404) {
        setState('unavailable');
        return;
      }
      if (!response.ok) {
        setState('error');
        return;
      }
      const page = await response.json() as InvoicePage;
      if (inFlight.current !== controller) { return; }
      setInvoices(page.data);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor);
      setState('ready');
    }
    catch {
      if (inFlight.current !== controller) { return; }
      setState('error');
    }
    finally {
      clearTimeout(timeout);
    }
  }, [workspaceId, basePath]);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
      moreFlight.current?.abort();
      moreFlight.current = null;
    };
  }, [load, refreshKey]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !nextCursor) { return; }
    moreFlight.current?.abort();
    const controller = new AbortController();
    moreFlight.current = controller;
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await fetch(
        `${basePath}/invoices?limit=${PAGE_SIZE}&starting_after=${encodeURIComponent(nextCursor)}`,
        { signal: controller.signal },
      );
      if (moreFlight.current !== controller) { return; }
      if (!response.ok) {
        setLoadMoreError(LOAD_MORE_ERROR_MESSAGE);
        setLoadingMore(false);
        return;
      }
      const page = await response.json() as InvoicePage;
      if (moreFlight.current !== controller) { return; }
      // Existing rows stay; the next page is appended, never swapped in.
      setInvoices(current => [...current, ...page.data]);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor);
      setLoadingMore(false);
    }
    catch {
      if (moreFlight.current !== controller) { return; }
      setLoadMoreError(LOAD_MORE_ERROR_MESSAGE);
      setLoadingMore(false);
    }
    finally {
      clearTimeout(timeout);
    }
  };

  // PDF download: fetch -> blob -> temporary <a download>. The PDF URL is never
  // navigated to, so a 409 `invoice_pdf_unavailable` (or any non-200) cannot
  // replace the page with a JSON error: it becomes an inline row message and
  // nothing is downloaded.
  const downloadPdf = async (invoice: Invoice) => {
    if (rowStates[invoice.id] === 'downloading') { return; }
    setRowStates(current => ({ ...current, [invoice.id]: 'downloading' }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PDF_TIMEOUT_MS);
    try {
      const response = await fetch(`${basePath}/invoices/${encodeURIComponent(invoice.id)}/pdf`, { signal: controller.signal });
      if (response.status !== 200) {
        setRowStates(current => ({ ...current, [invoice.id]: 'error' }));
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = pdfFileName(invoice);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking in the same task as click() can cancel the download in some
      // browsers, so the blob URL is released a moment later.
      setTimeout(() => { URL.revokeObjectURL(objectUrl); }, BLOB_REVOKE_DELAY_MS);
      setRowStates((current) => {
        const copy = { ...current };
        delete copy[invoice.id];
        return copy;
      });
    }
    catch {
      setRowStates(current => ({ ...current, [invoice.id]: 'error' }));
    }
    finally {
      clearTimeout(timeout);
    }
  };

  if (state === 'unavailable') {
    return (
      <p data-testid="invoice-history-unavailable" className="text-sm text-fg-3">
        Invoices are not available for your role.
      </p>
    );
  }

  return (
    <Card data-testid="invoice-history-card" className="overflow-hidden">
      <CardHeader className="border-b border-stroke-1 p-4">
        <CardTitle role="heading" aria-level={2}>Invoices</CardTitle>
        <CardDescription>
          Newest first. The PDF carries the company details, period, seats and amount that were on file when the invoice was issued.
        </CardDescription>
      </CardHeader>

      {state === 'loading' && <InvoiceSkeleton />}

      {state === 'error' && (
        <CardContent className="flex items-start gap-3 p-4" data-testid="invoice-history-error">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal-fail" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg-0">Unable to load invoices</p>
            <p className="mt-1 text-sm text-fg-2">The request failed. Your invoices are unchanged.</p>
            <Button type="button" className="mt-3" data-testid="invoice-history-retry" onClick={() => { void load(); }}>
              <RefreshCw size={13} aria-hidden="true" />
              Retry
            </Button>
          </div>
        </CardContent>
      )}

      {state === 'ready' && invoices.length === 0 && (
        <CardContent className="flex flex-col items-center gap-1 px-4 py-8 text-center" data-testid="invoice-history-empty">
          <p className="text-md font-semibold text-fg-1">No invoices yet</p>
          <p className="max-w-[52ch] text-sm text-fg-3">Your first invoice will appear here once it is issued.</p>
        </CardContent>
      )}

      {state === 'ready' && invoices.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="invoice-history-table">
              <caption className="sr-only">{TABLE_LABEL}</caption>
              <thead>
                <tr>
                  {COLUMNS.map(column => (
                    <th
                      key={column}
                      scope="col"
                      className={`whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-3 ${column === 'Seats' || column === 'Amount' ? 'text-right' : 'text-left'}`}
                    >
                      {column === 'Download' ? <span className="sr-only">Download</span> : column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const chip = STATUS_CHIP[invoice.status];
                  const rowState = rowStates[invoice.id];
                  const label = invoice.number ?? invoice.id;
                  return (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      chip={chip}
                      label={label}
                      rowState={rowState}
                      onDownload={() => { void downloadPdf(invoice); }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {(hasMore || loadMoreError) && (
            <div className="flex flex-col items-start gap-2 border-t border-stroke-1 p-4">
              {loadMoreError && (
                <p role="alert" data-testid="invoice-load-more-error" className="text-sm text-signal-fail">{loadMoreError}</p>
              )}
              {hasMore && (
                <Button type="button" data-testid="invoice-load-more" disabled={loadingMore} aria-busy={loadingMore} onClick={() => { void loadMore(); }}>
                  {loadingMore && <RefreshCw size={13} aria-hidden="true" className="motion-safe:animate-spin" />}
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

interface InvoiceRowProps {
  invoice: Invoice
  chip: { label: string, token: 'pass' | 'fail' | 'skipped', Icon: typeof Check }
  label: string
  rowState: RowState | undefined
  onDownload: () => void
}

function InvoiceRow({ invoice, chip, label, rowState, onDownload }: InvoiceRowProps) {
  const downloading = rowState === 'downloading';
  const { Icon } = chip;
  return (
    <>
      <tr data-testid={`invoice-row-${invoice.id}`} data-status={invoice.status} className="hover:bg-surface-3">
        <td className="border-t border-stroke-1 px-3 py-1.5 font-mono text-sm text-fg-1" data-testid={`invoice-number-${invoice.id}`}>
          {invoice.number ?? <span className="font-sans text-fg-3">No number yet</span>}
        </td>
        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5 font-mono text-xs text-fg-2" data-testid={`invoice-period-${invoice.id}`}>
          {formatPeriod(invoice)}
        </td>
        <td className="border-t border-stroke-1 px-3 py-1.5 text-right font-mono text-sm text-fg-1" data-testid={`invoice-seats-${invoice.id}`}>
          {invoice.seat_quantity ?? 'n/a'}
        </td>
        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5 text-right font-mono text-sm text-fg-0" data-testid={`invoice-amount-${invoice.id}`}>
          {formatMoney(invoice.amount_cents, invoice.currency)}
        </td>
        <td className="border-t border-stroke-1 px-3 py-1.5">
          <span className="status-chip" data-status={chip.token} data-testid={`invoice-status-${invoice.id}`}>
            <Icon size={11} aria-hidden="true" />
            {chip.label}
          </span>
        </td>
        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5 text-right">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid={`invoice-download-${invoice.id}`}
            disabled={!invoice.pdf_available || downloading}
            aria-busy={downloading}
            aria-label={`Download invoice ${label} as PDF`}
            title={invoice.pdf_available ? undefined : 'PDF not available'}
            onClick={onDownload}
          >
            {downloading
              ? <RefreshCw size={12} aria-hidden="true" className="motion-safe:animate-spin" />
              : <Download size={12} aria-hidden="true" />}
            PDF
          </Button>
        </td>
      </tr>
      {rowState === 'error' && (
        <tr data-testid={`invoice-download-error-row-${invoice.id}`}>
          <td colSpan={COLUMNS.length} className="px-3 pb-2">
            <p role="alert" data-testid={`invoice-download-error-${invoice.id}`} className="text-sm text-signal-fail">
              {PDF_ERROR_MESSAGE}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function InvoiceSkeleton() {
  return (
    <CardContent className="flex flex-col gap-3 p-4" data-testid="invoice-history-loading" role="status" aria-label="Loading invoices">
      {[0, 1, 2].map(row => (
        <div key={row} className="flex items-center gap-4">
          <div className="h-3 w-28 animate-status-pulse rounded-1 bg-surface-3" />
          <div className="h-3 flex-1 animate-status-pulse rounded-1 bg-surface-3" />
          <div className="h-3 w-16 animate-status-pulse rounded-1 bg-surface-3" />
        </div>
      ))}
    </CardContent>
  );
}
