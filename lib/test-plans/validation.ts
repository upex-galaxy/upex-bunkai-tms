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

// BK-592 — the ratified user-facing copy for each length rule, declared ONCE
// here and consumed by BOTH validation layers: the Zod pre-check below, and
// `mapTestPlanRpcError`'s 45600 / 45601 / 45602 arms.
//
// The defect this closes: the copy used to be written out twice — once as a
// Zod message and once as a string literal in errors.ts — and the two
// disagreed. Because the Zod schema fails fast, the RPC (and therefore the
// ratified wording in errors.ts) was never reached for a malformed body, so
// the API answered a 101-character name with Zod's own "Name must be 100
// characters or fewer" and a blank name with "Name is required", while the
// ratified copy says "Name must be between 1 and 100 characters." for both.
//
// Two duplicated string literals cannot be kept in sync by discipline; the
// bug was that they were duplicated at all. Deriving both layers from these
// constants — and deriving the constants from the bounds directly above —
// makes the divergence unrepresentable rather than merely fixed. `name`'s
// message deliberately covers the too-short AND too-long case with one
// string, exactly as the RPC's single 45600 SQLSTATE does.
export const TEST_PLAN_NAME_LENGTH_MESSAGE
  = `Name must be between 1 and ${TEST_PLAN_NAME_MAX} characters.`;
export const TEST_PLAN_DESCRIPTION_LENGTH_MESSAGE
  = `Description must be ${TEST_PLAN_DESCRIPTION_MAX} characters or fewer.`;
export const TEST_PLAN_GOAL_LENGTH_MESSAGE
  = `Goal must be ${TEST_PLAN_GOAL_MAX} characters or fewer.`;

// Collapse THEN trim — see the RPC's own comment on operand order. This is an
// EXACT mirror of the RPC's
// `btrim(regexp_replace(..., '[\t\n\v\f\r ]+', ' ', 'g'))`, and the character
// class is spelled out rather than written `\s` on purpose: `\s` matches
// U+00A0 (and the rest of Unicode Zs) on BOTH sides — in JavaScript, and in
// Postgres, where `\s` is `[[:space:]]` and this instance's UTF-8 collation
// makes it match U+00A0 too.
//
// BK-591: until migration 0074 this comment claimed the opposite of Postgres
// ("Postgres's POSIX `\s` does not [match U+00A0]"), and 0073 carried the same
// claim. This module was accidentally right for a wrong reason; the SQL was
// wrong, so an NBSP-padded name normalized onto its unpadded twin in the
// database and came back 409. Do NOT "simplify" this back to `\s` +
// `.trim()` — that reintroduces the defect on this side of the mirror.
//
// Using `\s` + `.trim()` here would silently normalize a non-breaking space
// that the database now stores as-is, so the same name would round-trip
// differently through the HTTP route than through a direct RPC call — with
// the table CHECK, not this module, deciding who was right.
//
// NOT covering U+00A0 is the ratified scope (BK-202 Technical Question 2:
// match the milestones precedent, do not widen it unasked). Making both sides
// agree on that answer is the point of the explicit class.
const PG_WHITESPACE = /[\t\n\v\f\r ]+/g;

export function normalizeTestPlanText(value: string): string {
  return value.replace(PG_WHITESPACE, ' ').replace(/^ +| +$/g, '');
}

export const TestPlanNameSchema = z
  .string()
  .transform(normalizeTestPlanText)
  .pipe(
    z
      .string()
      .min(1, TEST_PLAN_NAME_LENGTH_MESSAGE)
      .max(TEST_PLAN_NAME_MAX, TEST_PLAN_NAME_LENGTH_MESSAGE),
  );

export const TestPlanDescriptionSchema = z
  .string()
  .max(TEST_PLAN_DESCRIPTION_MAX, TEST_PLAN_DESCRIPTION_LENGTH_MESSAGE)
  .optional()
  .default('');

// Optional, so it normalizes to '' when blank — the column is `not null
// default ''` and its CHECK pins the same collapse-then-trim invariant the
// name column does, so an unnormalized goal would be rejected by the table
// itself rather than silently stored.
export const TestPlanGoalSchema = z
  .string()
  .transform(normalizeTestPlanText)
  .pipe(z.string().max(TEST_PLAN_GOAL_MAX, TEST_PLAN_GOAL_LENGTH_MESSAGE))
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
