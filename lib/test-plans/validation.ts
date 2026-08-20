import { z } from 'zod';

// BK-202 — Test Plan name/description/goal validation. The Zod layer mirrors
// the `bunkai_create_test_plan` / `bunkai_update_test_plan` RPC rulebook so a
// malformed body fails fast as a 422 before any DB round-trip; the RPC stays
// the enforcement point of record (it re-applies the identical
// normalize-then-bound rules, and the unique (project_id, lower(name)) index
// backed by the table CHECK is the authoritative case-insensitive-uniqueness
// check — never an app-level pre-check, which would reopen the concurrent
// -create race the DB index closes).
//
// Bounds are the AI Product Owner + AI Tech Lead ratified numbers (BK-202,
// 2026-08-14): name 1–100, description ≤ 500 (reused verbatim from the
// sibling Milestone entity), goal ≤ 100 — goal renders as a compact list
// column / chip ("R2.4"), so it carries name's short bound rather than
// description's paragraph bound.

export const TEST_PLAN_NAME_MAX = 100;
export const TEST_PLAN_DESCRIPTION_MAX = 500;
export const TEST_PLAN_GOAL_MAX = 100;

// Collapse THEN trim — see the RPC's own comment on operand order. A
// single-argument `.trim()` strips ASCII whitespace including tabs/newlines,
// so this mirrors the RPC's `btrim(regexp_replace(..., '\s+', ' ', 'g'))`
// closely enough for a client-side pre-check; the RPC remains authoritative.
// Neither side treats U+00A0 as whitespace — a deliberate scope match with
// the milestones precedent (BK-202 Technical Question 2), not an oversight.
export function normalizeTestPlanText(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

export const TestPlanNameSchema = z
  .string()
  .transform(normalizeTestPlanText)
  .pipe(
    z
      .string()
      .min(1, 'Name is required')
      .max(TEST_PLAN_NAME_MAX, `Name must be ${TEST_PLAN_NAME_MAX} characters or fewer`),
  );

export const TestPlanDescriptionSchema = z
  .string()
  .max(TEST_PLAN_DESCRIPTION_MAX, `Description must be ${TEST_PLAN_DESCRIPTION_MAX} characters or fewer`)
  .optional()
  .default('');

// Optional, so it normalizes to '' when blank — the column is `not null
// default ''` and its CHECK pins the same collapse-then-trim invariant the
// name column does, so an unnormalized goal would be rejected by the table
// itself rather than silently stored.
export const TestPlanGoalSchema = z
  .string()
  .transform(normalizeTestPlanText)
  .pipe(z.string().max(TEST_PLAN_GOAL_MAX, `Goal must be ${TEST_PLAN_GOAL_MAX} characters or fewer`))
  .optional()
  .default('');

export const TestPlanCreateBodySchema = z.object({
  name: TestPlanNameSchema,
  description: TestPlanDescriptionSchema,
  goal: TestPlanGoalSchema,
});

// Edit reuses create's rulebook wholesale. Unlike the Milestone pair there is
// no conditional carve-out here: Test Plans have no now()-relative bound, so
// every field is validated identically on both paths, which is exactly what
// ratified decision T5 requires (rename re-validates uniqueness under the
// same rule as create — enforced by the shared unique index, not by this
// schema).
export const TestPlanUpdateBodySchema = TestPlanCreateBodySchema;

export type TestPlanCreateBody = z.infer<typeof TestPlanCreateBodySchema>;
export type TestPlanUpdateBody = z.infer<typeof TestPlanUpdateBodySchema>;
