import type Stripe from 'stripe';
import { internalDbError } from '@lib/billing/errors';
import { createAdminClient } from '@lib/supabase/admin';

// BK-231 — maps the Stripe invoice events the Billing screen depends on onto the
// service_role-only RPC of migration 0113. The signature has already been
// verified by the route.
export const INVOICE_EVENT_TYPES = new Set(['invoice.payment_failed', 'invoice.paid']);

// An invoice event for a customer we do not know yet is retried by Stripe for a
// short window (the checkout row may not have committed), then dropped: the
// Stripe account may carry customers that belong to no workspace.
export const UNKNOWN_CUSTOMER_RETRY_WINDOW_MS = 60 * 60 * 1000;

export interface InvoiceEventOutcome {
  status: string
  retryable: boolean
}

export async function applyInvoiceEvent(event: Stripe.Event, now: Date = new Date()): Promise<InvoiceEventOutcome> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);
  if (!customerId || !invoice.id) {
    return { status: 'ignored', retryable: false };
  }

  const { data, error } = await createAdminClient().rpc('bunkai_apply_billing_invoice_event', {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_event_created: new Date(event.created * 1000).toISOString(),
    p_stripe_customer_id: customerId,
    p_stripe_invoice_id: invoice.id,
    p_billing_reason: invoice.billing_reason as string,
  });
  if (error) {
    throw internalDbError('bunkai_apply_billing_invoice_event failed', error);
  }

  const status = (data as { status?: string } | null)?.status ?? 'ignored';
  const recent = now.getTime() - event.created * 1000 < UNKNOWN_CUSTOMER_RETRY_WINDOW_MS;
  return { status, retryable: status === 'unknown_customer' && recent };
}
