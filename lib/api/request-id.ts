const REQUEST_ID_HEADER = 'x-request-id';

// Returns the inbound `x-request-id` header if present (and reasonably shaped),
// otherwise mints a new UUID. Routes propagate this on the response so callers
// can correlate logs across the edge → server → Supabase boundary.
export function getRequestId(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  if (incoming && incoming.length > 0 && incoming.length <= 128) {
    return incoming;
  }
  return crypto.randomUUID();
}

export { REQUEST_ID_HEADER };
