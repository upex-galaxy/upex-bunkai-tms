import { ApiError } from '@lib/api/error-envelope';

// BK-231 — error helpers shared by the billing services. Same rule as
// lib/billing/checkout.ts (BK-827): Postgres and processor text is for the
// server log, never the response body.
const INTERNAL_ERROR_MESSAGE = 'Could not process the billing request. Please try again in a moment.';
const UPSTREAM_ERROR_MESSAGE = 'The payment processor could not complete the request. Please try again in a moment.';

export function internalDbError(logMessage: string, error: { message: string, code?: string }): ApiError {
  console.error(logMessage, { error: error.message, code: error.code });
  return new ApiError('internal_error', INTERNAL_ERROR_MESSAGE);
}

// An ApiError (getStripeClient()'s own `payment_processor_unavailable`) is
// already client-safe and keeps its status; anything else is upstream text:
// log it, answer a generic 502.
export function toProcessorError(
  raw: unknown,
  logMessage: string,
  logContext: Record<string, unknown> = {},
  message: string = UPSTREAM_ERROR_MESSAGE,
): ApiError {
  if (raw instanceof ApiError) {
    return raw;
  }
  console.error(logMessage, { ...logContext, error: raw instanceof Error ? raw.message : String(raw) });
  return new ApiError('upstream_error', message);
}

// stripe-node tags every thrown error with `type`; a decline is `StripeCardError`.
export function isStripeCardError(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as { type?: unknown }).type === 'StripeCardError';
}

export function isStripeMissingResource(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as { code?: unknown }).code === 'resource_missing';
}
