import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { getInvoicePdf } from '@lib/billing/invoices';
import { workspaceIdFromRequest } from '@lib/billing/route-helpers';

// GET /api/v1/workspaces/{id}/billing/invoices/{invoiceId}/pdf — downloads one
// invoice as a PDF (BK-231, AC3). The bytes are proxied by this route after the
// invoice was proven to belong to the workspace's customer; the provider URL
// never reaches the client. An invoice of another workspace and one that does
// not exist answer the same 404; a missing or invalid provider file answers a
// recoverable 409 `invoice_pdf_unavailable` and downloads nothing.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { db } = getAuth(ctx);

  // .../invoices/{invoiceId}/pdf: the id is the segment before the trailing "pdf".
  const segments = new URL(request.url).pathname.split('/');
  let invoiceId: string;
  try {
    invoiceId = decodeURIComponent(segments.at(-2) ?? '');
  }
  catch {
    // A malformed escape is just an id that matches no invoice: the same 404.
    throw new ApiError('not_found', 'Invoice not found.');
  }

  const pdf = await getInvoicePdf({ db, workspaceId, invoiceId });
  return new Response(pdf.bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}, { auth: 'required', requires: ['atc:read'] });
