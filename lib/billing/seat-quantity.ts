import { PLAN_TIERS } from '@lib/billing/plan-tiers';

// BK-230 — seat-quantity bounds ONLY (no ApiError, no server-only imports),
// split out from lib/billing/checkout.ts so the client-side UpgradeView
// (seat stepper min/max) can import this directly WITHOUT pulling in
// checkout.ts's `stripe` SDK / `server-only` chain, which would break the
// browser bundle. `validateSeatQuantity` (which throws ApiError) stays in
// checkout.ts — a server-only module — since only server routes need it.

export interface SeatQuantityBounds {
  min: number
  max: number
}

// Scenario 2.4/2.5 (AI Product Owner, published on BK-230): minimum
// purchasable seats = the workspace's current active membership — this story
// has no seat-reduction path (that is BK-233, downgrade, out of scope), so
// selling fewer seats than are already occupied would misrepresent the
// workspace's own membership the moment the purchase completes. Maximum
// stays the already-ratified Cloud seatLimit (25, D34) — this story adds a
// variable PURCHASED quantity beneath that cap, not a variable ceiling.
export function resolveSeatQuantityBounds(activeSeats: number): SeatQuantityBounds {
  const max = PLAN_TIERS.cloud.seatLimit ?? activeSeats;
  return { min: Math.max(1, activeSeats), max };
}
