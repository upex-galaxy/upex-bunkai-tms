import { z } from 'zod';

// BK-207 — body validation for closing a Test Plan. The Zod layer mirrors the
// `bunkai_close_test_plan` rulebook (migration 0095_plan_close.sql) so a malformed
// body fails fast as a 422 before any DB round-trip; the RPC stays the enforcement
// point of record and answers the same rules with its own SQLSTATEs.
//
// Ratified 2026-10-04 (T5): the summary is OPTIONAL plain text, trimmed on save, at
// most 4000 characters AFTER trimming, and a whitespace-only summary is stored as
// empty (NULL). The VERDICT is the only required field.

export const PLAN_VERDICTS = ['passed', 'failed'] as const;
export type PlanVerdict = (typeof PLAN_VERDICTS)[number];

export const PLAN_SUMMARY_MAX = 4000;

// Declared once and consumed by BOTH layers (this schema and `mapTestPlanCloseRpcError`)
// so the wording cannot drift, the lesson of BK-592.
export const PLAN_VERDICT_REQUIRED_MESSAGE = 'Select a verdict (passed or failed) to close the plan.';
export const PLAN_VERDICT_INVALID_MESSAGE = 'Verdict must be passed or failed.';
export const PLAN_SUMMARY_LENGTH_MESSAGE = `Outcome summary must be ${PLAN_SUMMARY_MAX} characters or fewer.`;

// EXACT mirror of the RPC's trim class `[\t\n\v\f\r NBSP]`. `String.prototype.trim`
// also strips other Unicode spaces (U+2003, U+3000, ...) that Postgres keeps, so it is
// deliberately NOT used here.
const TRIMMED_EDGES = /^[\t\n\v\f\r \xA0]+|[\t\n\v\f\r \xA0]+$/g;

// Trimmed summary, or null when nothing is left. Blank means "no summary".
export function normalizePlanSummary(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').replace(TRIMMED_EDGES, '');
  return trimmed === '' ? null : trimmed;
}

// Characters, not UTF-16 units: Postgres `char_length` counts an emoji as one.
export function planSummaryLength(value: string): number {
  return [...value].length;
}

const VerdictSchema = z
  .string({ error: PLAN_VERDICT_REQUIRED_MESSAGE })
  .transform(value => value.trim())
  .pipe(
    z.string().min(1, PLAN_VERDICT_REQUIRED_MESSAGE),
  )
  .pipe(
    z.enum(PLAN_VERDICTS, { error: PLAN_VERDICT_INVALID_MESSAGE }),
  );

const SummarySchema = z
  .string()
  .nullish()
  .transform(value => normalizePlanSummary(value))
  .refine(value => value === null || planSummaryLength(value) <= PLAN_SUMMARY_MAX, PLAN_SUMMARY_LENGTH_MESSAGE);

export const TestPlanCloseBodySchema = z.object({
  verdict: VerdictSchema,
  summary: SummarySchema,
});

export type TestPlanCloseBody = z.infer<typeof TestPlanCloseBodySchema>;
