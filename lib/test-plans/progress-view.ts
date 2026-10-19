import { z } from 'zod';

// BK-204 — Test Plan progress view model: framework-agnostic, pure functions only.
// `bunkai_plan_progress` / `bunkai_plans_progress` (0094_plan_progress.sql) own the
// RULES (latest run per member by `started_at`, a running run is "in progress", a
// test with no run is "not run", the floor percentage) and return data with no copy;
// this file owns the WORDS, the bar geometry and the defensive parse of the answer.
// The percentage is never recomputed here: the database value is the one number every
// surface shows. Mirrors `lib/runs/compare-view.ts` (BK-442) and
// `lib/runs/history-view.ts` (BK-37).

export type PlanOutcome = 'passed' | 'failed' | 'aborted' | 'in_progress' | 'not_run';

// Fixed display order: bar segments, legend chips and the aria sentence all follow it.
export const PLAN_OUTCOMES: readonly PlanOutcome[] = ['passed', 'failed', 'aborted', 'in_progress', 'not_run'];

const OUTCOME_LABEL: Record<PlanOutcome, string> = {
  passed: 'Passed',
  failed: 'Failed',
  aborted: 'Aborted',
  in_progress: 'In progress',
  not_run: 'Not run',
};

// The live `.status-chip` / `.dot` data-status tokens (app/globals.css). `aborted`
// reads in the blocked family (master-design-plan D14), `in_progress` is the running
// blue, and "Not run" is the neutral grey the skipped token already carries.
const OUTCOME_CHIP_TOKEN: Record<PlanOutcome, 'pass' | 'fail' | 'aborted' | 'running' | 'skipped'> = {
  passed: 'pass',
  failed: 'fail',
  aborted: 'aborted',
  in_progress: 'running',
  not_run: 'skipped',
};

const CountsSchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  aborted: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  not_run: z.number().int().nonnegative(),
});

const OutcomeSchema = z.enum(['passed', 'failed', 'aborted', 'in_progress', 'not_run']);

const SummarySchema = z.object({
  plan_id: z.string(),
  member_count: z.number().int().nonnegative(),
  // null only for a plan with no member tests (the empty progress state).
  passed_pct: z.number().int().min(0).max(100).nullable(),
  counts: CountsSchema,
});

const PlanProgressSchema = SummarySchema.extend({
  tests: z.array(z.object({
    test_id: z.string(),
    outcome: OutcomeSchema,
    run_id: z.string().nullable(),
    started_at: z.string().nullable(),
  })),
});

export type PlanProgressCounts = z.infer<typeof CountsSchema>;
export type PlanProgressSummary = z.infer<typeof SummarySchema>;
export type PlanProgress = z.infer<typeof PlanProgressSchema>;
export type PlanProgressTest = PlanProgress['tests'][number];

export function outcomeLabel(outcome: PlanOutcome): string {
  return OUTCOME_LABEL[outcome];
}

export function chipToken(outcome: PlanOutcome): 'pass' | 'fail' | 'aborted' | 'running' | 'skipped' {
  return OUTCOME_CHIP_TOKEN[outcome];
}

// UTC, sliced from the ISO string: toLocale* output differs between the server and the
// browser timezone and trips a hydration mismatch (same rule as run history's
// `formatRanAt`). '2026-07-29T11:52:00+00:00' -> '2026-07-29 11:52'. A never-run row
// has no time: a dash.
export function formatLastRun(iso: string | null): string {
  if (iso === null) { return '—'; }
  // Normalise to UTC first: the RPC may answer with any offset ('+02:00') and a plain slice would show that offset's wall clock.
  const utc = new Date(iso);
  if (Number.isNaN(utc.getTime())) { return '—'; }
  const normalised = utc.toISOString();
  return `${normalised.slice(0, 10)} ${normalised.slice(11, 16)}`;
}

export interface ProgressSegment { outcome: PlanOutcome, count: number, widthPct: number }
export interface ProgressLegendItem { outcome: PlanOutcome, label: string, count: number }
export interface ProgressView {
  state: 'empty' | 'progress'
  percentLabel: string
  passedLabel: string
  segments: ProgressSegment[]
  legend: ProgressLegendItem[]
  ariaLabel: string
}

export function buildProgressView(summary: PlanProgressSummary): ProgressView {
  const { counts, member_count: total, passed_pct: pct } = summary;
  const legend = PLAN_OUTCOMES.map(outcome => ({ outcome, label: OUTCOME_LABEL[outcome], count: counts[outcome] }));
  const ariaLabel = `Plan progress: ${PLAN_OUTCOMES.map(o => `${counts[o]} ${OUTCOME_LABEL[o].toLowerCase()}`).join(', ')}`;

  if (total === 0 || pct === null) {
    return { state: 'empty', percentLabel: '—', passedLabel: 'passed', segments: [], legend, ariaLabel };
  }

  const segments = PLAN_OUTCOMES
    .filter(outcome => counts[outcome] > 0)
    .map(outcome => ({ outcome, count: counts[outcome], widthPct: (counts[outcome] / total) * 100 }));

  return {
    state: 'progress',
    percentLabel: `${pct}%`,
    passedLabel: `passed · ${counts.passed} of ${total}`,
    segments,
    legend,
    ariaLabel,
  };
}

export function miniBarLabel(summary: PlanProgressSummary): string {
  return summary.passed_pct === null ? '—' : `${summary.passed_pct}%`;
}

// The RPC answers jsonb, which the generated types call `Json`. A shape that is not
// the contract degrades to null so the page can render without progress instead of
// crashing.
export function parsePlanProgress(data: unknown): PlanProgress | null {
  const parsed = PlanProgressSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function planProgressByTest(progress: PlanProgress): Map<string, PlanProgressTest> {
  return new Map(progress.tests.map(t => [t.test_id, t]));
}

export function parsePlansProgress(data: unknown): Map<string, PlanProgressSummary> {
  const result = new Map<string, PlanProgressSummary>();
  if (!Array.isArray(data)) { return result; }
  for (const entry of data) {
    const parsed = SummarySchema.safeParse(entry);
    if (parsed.success) { result.set(parsed.data.plan_id, parsed.data); }
  }
  return result;
}
