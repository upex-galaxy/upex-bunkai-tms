// Small pure helpers shared by the BK-231 billing components (failed-renewal
// banner, billing details, payment method, invoice history). No React here.

const UTC_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

// The workspace has no timezone setting, so every date is rendered in UTC and
// the caller appends an explicit "UTC" label. Returns null for a missing or
// unparseable value so the caller can fall back to copy that names no date
// instead of printing "Invalid Date".
export function formatUtcDate(value: string | null | undefined): string | null {
  if (!value) { return null; }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) { return null; }
  return UTC_DATE_FORMAT.format(date);
}

// Amounts arrive as integer minor units in the invoice's OWN currency. The
// currency decides both the symbol and the number of minor-unit digits
// (EUR/USD: 2, JPY: 0), so nothing here hardcodes either.
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / 10 ** digits);
  }
  catch {
    // An unknown currency code makes Intl throw a RangeError: show the plain
    // number with the raw code rather than failing the whole table.
    return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export interface ApiErrorInfo {
  code: string | null
  message: string | null
}

// Reads the documented `{ error: { code, message } }` envelope. Never returns
// or logs anything else from the body: a server error body that does not match
// the envelope yields nulls and the caller shows its own fallback copy.
export async function readApiError(response: Response): Promise<ApiErrorInfo> {
  try {
    const body = await response.json() as { error?: { code?: unknown, message?: unknown } } | null;
    return {
      code: typeof body?.error?.code === 'string' ? body.error.code : null,
      message: typeof body?.error?.message === 'string' && body.error.message.length > 0 ? body.error.message : null,
    };
  }
  catch {
    return { code: null, message: null };
  }
}

// Date AND time in UTC, for the one deadline where the hour matters: the grace
// window ends at the exact instant of the first failed renewal plus 14 days.
export function formatUtcDateTime(value: string | null | undefined): string | null {
  if (!value) { return null; }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) { return null; }
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
