import { ApiError } from '@lib/api/error-envelope';

// BK-371 — "one check at a time per person" (PO Q4, reconciled by Dev T-section).
// A per-user in-flight guard, deliberately NOT a rate limiter: the PO ruled that
// no limiter is built. It is best effort and per server instance (Risk 4,
// accepted): exactness across instances would need shared state.
//
// The guard is released in `finally`, so a throwing or timed-out check can never
// lock a user out.

const inFlight = new Set<string>();

export async function withCheckGuard<T>(userId: string, run: () => Promise<T>): Promise<T> {
  if (inFlight.has(userId)) {
    throw new ApiError('rate_limited', 'A connection check is already running. Wait for it to finish.', {
      details: { reason: 'check_in_progress' },
    });
  }
  inFlight.add(userId);
  try {
    return await run();
  }
  finally {
    inFlight.delete(userId);
  }
}
