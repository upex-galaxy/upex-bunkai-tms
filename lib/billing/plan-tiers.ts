import type { WorkspacePlan } from '@lib/types';

// BK-229 — the Bunkai Cloud tier ladder, as typed constants. `null` on a
// limit field means unlimited (Enterprise). Ratified by the AI Product
// Owner, Jira comments 12415(a) + 12416, and relocated here from a proposed
// `plan_tiers` table by the AI Tech Lead's TQ1 reversal (comment 12417):
// `0065_atc_tags_cap_guard.sql`'s own header already establishes this repo's
// convention for a constant needed on both the TS and SQL side — TS owns it,
// SQL mirrors the literal with a pointer comment — and this story has no
// enforcement consumer yet (BK-232, which would need the limit DB-side, is
// still Backlog). If BK-232 ever needs a DB-level guard, mirror the literal
// into that migration with a comment naming this module, per the 0065
// convention — do not silently promote to a table without a real consumer.
//
// Display names are the title-case of the `workspaces.plan` storage literal
// (community/cloud/enterprise) per domain-glossary.md §3 — "Free / Team /
// Enterprise" is the anti-glossary's explicitly banned naming and must never
// reappear here.
export interface PlanTier {
  displayName: string
  seatLimit: number | null
  projectLimit: number | null
  retentionDays: number | null
  pricePerSeatCents: number | null
  priceNote: string | null
  isPaid: boolean
  // Static, non-fabricated renewal text (AC1/AC3/AC6). No subscription table
  // exists anywhere in the schema yet (verified live — the tier ladder's own
  // ratification, comment 12415, confirms zero seat/limit/price/subscription
  // columns beyond `workspaces.plan`), so a real renewal DATE cannot be
  // sourced honestly for a paying tier — that lands with BK-231 (billing
  // details + invoices). `null` here means "omit the renewal row entirely"
  // rather than print a figure the backend cannot back (the same standing
  // rule the retention meter's no-pruning clause follows, comment 12416).
  renewalNote: string | null
}

export const PLAN_TIERS: Record<WorkspacePlan, PlanTier> = {
  community: {
    displayName: 'Community',
    seatLimit: 5,
    projectLimit: 3,
    retentionDays: 30,
    pricePerSeatCents: 0,
    priceNote: null,
    isPaid: false,
    renewalNote: 'No active subscription',
  },
  cloud: {
    displayName: 'Cloud',
    seatLimit: 25,
    projectLimit: 50,
    retentionDays: 90,
    pricePerSeatCents: 2400,
    priceNote: null,
    isPaid: true,
    renewalNote: null,
  },
  enterprise: {
    displayName: 'Enterprise',
    seatLimit: null,
    projectLimit: null,
    retentionDays: null,
    pricePerSeatCents: null,
    priceNote: 'Custom',
    isPaid: true,
    renewalNote: 'Per contract',
  },
};

export type MeterState = 'normal' | 'warning' | 'limit-reached';

// AC2/AC15 (80% boundary is inclusive of warning) and AC4/AC5 (100%+ is
// limit-reached, no block). `limit === null` means unlimited — a meter
// against an unlimited resource never warns and never reaches its limit,
// because there is no limit to approach (AC6).
export function meterState(used: number, limit: number | null): MeterState {
  if (limit === null) {
    return 'normal';
  }
  if (limit <= 0) {
    return used > 0 ? 'limit-reached' : 'normal';
  }
  if (used >= limit) {
    return 'limit-reached';
  }
  if (used / limit >= 0.8) {
    return 'warning';
  }
  return 'normal';
}

// "8 of 10 seats" / "11 of 10 seats" (over-limit renders the true used count
// against the limit, never clamped — AC13). `null` limit renders "Unlimited".
export function meterLabel(used: number, limit: number | null, unit: string): string {
  if (limit === null) {
    return `${used} ${unit} · Unlimited`;
  }
  return `${used} of ${limit} ${unit}`;
}

// Fill width for the bar primitive — clamped to 100% so an over-limit meter
// (11 of 10) still renders a full, not overflowing, bar. Unlimited meters
// render no bar at all (caller's responsibility to check `limit === null`).
export function meterFillPercent(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((used / limit) * 100));
}

// "$24 / seat / month" · "Custom" (Enterprise) · "$0 / month" (Community —
// AC3's Free-plan price rendering, price is 0 not absent).
export function formatPrice(tier: PlanTier): string {
  if (tier.priceNote) {
    return tier.priceNote;
  }
  const cents = tier.pricePerSeatCents ?? 0;
  const dollars = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return tier.isPaid ? `$${dollars} / seat / month` : `$${dollars} / month`;
}
