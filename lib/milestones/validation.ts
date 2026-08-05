import { ApiError } from '@lib/api/error-envelope';
import { z } from 'zod';

// BK-205 — Milestone name/description/target-date validation. The Zod layer
// mirrors the `bunkai_create_milestone` / `bunkai_update_milestone` RPC
// rulebook so malformed bodies fail fast as a 422 before any DB round-trip;
// the RPC stays the enforcement point of record (it re-applies the identical
// normalize-then-bound rules, and the unique (project_id, lower(name)) index
// backed by the table CHECK is the authoritative case-insensitive-uniqueness
// check).
//
// Target-date bounds (AI Product Owner + AI Tech Lead ratified decisions,
// BK-205): lower bound is today-or-later, upper bound is within 5 years of
// the write date. Both are relative to `now()`, evaluated in server UTC —
// this module derives "today" the same way the RPC does (`current_date` is
// UTC on this Supabase project), so the picker's own min/max never offers a
// date the server would then reject near a timezone boundary.

export const MILESTONE_NAME_MAX = 100;
export const MILESTONE_DESCRIPTION_MAX = 500;
export const MILESTONE_TARGET_DATE_MAX_YEARS = 5;

// Collapse THEN trim — see the RPC's own comment on operand order. A
// single-argument `.trim()` strips ASCII whitespace including tabs/newlines,
// so this mirrors the RPC's `btrim(regexp_replace(..., '\s+', ' ', 'g'))`
// closely enough for a client-side pre-check; the RPC remains authoritative.
function normalizeName(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

export function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function maxTargetDateUtcIso(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + MILESTONE_TARGET_DATE_MAX_YEARS);
  return d.toISOString().slice(0, 10);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const MilestoneNameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(1, 'Name is required')
      .max(MILESTONE_NAME_MAX, `Name must be ${MILESTONE_NAME_MAX} characters or fewer`),
  );

export const MilestoneDescriptionSchema = z
  .string()
  .max(MILESTONE_DESCRIPTION_MAX, `Description must be ${MILESTONE_DESCRIPTION_MAX} characters or fewer`)
  .optional()
  .default('');

// Format only — no bound check here. Bounds are conditional on the RPC's own
// "only when the value actually changes" rule (see below), which a static
// Zod schema cannot express by itself since it has no notion of "the stored
// value". Both routes parse `target_date` through this format-only schema
// first; assertTargetDateBounds is then applied explicitly where it applies.
export const MilestoneTargetDateFormatSchema = z
  .string()
  .regex(DATE_ONLY, 'Target date must be a calendar date (YYYY-MM-DD)');

export const MilestoneCreateBodySchema = z.object({
  name: MilestoneNameSchema,
  target_date: MilestoneTargetDateFormatSchema,
  description: MilestoneDescriptionSchema,
});

// Edit reuses create's validation logic for shape (Dev Backend decision), but
// NOT for the target-date bounds: the create route always calls
// assertTargetDateBounds unconditionally, while the edit route calls it ONLY
// when the submitted date differs from the milestone's current stored value
// (mirroring the RPC's own `p_target_date is distinct from` guard). Applying
// the bound unconditionally at the edge on edit would reject a
// description-only edit of a past-dated milestone with a 422 before the
// request ever reached the RPC — breaking the exact scenario
// business-rules.md requires to stay editable.
export const MilestoneUpdateBodySchema = MilestoneCreateBodySchema;

export type MilestoneCreateBody = z.infer<typeof MilestoneCreateBodySchema>;
export type MilestoneUpdateBody = z.infer<typeof MilestoneUpdateBodySchema>;

// Throws the canonical `validation_failed` ApiError (422, same envelope a
// route throws directly) when the target date is out of bounds. Both bounds
// are relative to `now()`, recomputed at CALL time (not module load time),
// matching the RPC's own `current_date` evaluation in server UTC.
export function assertTargetDateBounds(targetDate: string): void {
  const today = todayUtcIso();
  const max = maxTargetDateUtcIso();
  if (targetDate < today) {
    throw new ApiError('validation_failed', 'Target date must be today or later.', {
      details: { reason: 'milestone_target_date_past' },
    });
  }
  if (targetDate > max) {
    throw new ApiError('validation_failed', 'Target date must be within the next 5 years.', {
      details: { reason: 'milestone_target_date_too_far' },
    });
  }
}
