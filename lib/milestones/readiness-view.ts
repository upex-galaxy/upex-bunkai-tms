import type { PlanProgressCounts, PlanProgressSummary } from '@lib/test-plans/progress-view';
import { computeCountdown } from '@lib/milestones/countdown';
import { todayUtcIso } from '@lib/milestones/validation';
import { z } from 'zod';

// BK-206 — milestone readiness view model: framework-agnostic, pure functions only.
// `bunkai_milestones_readiness` (0112_milestone_plans.sql) owns the RULES (pooled
// counts, floor percentage, a closed plan counted by its frozen snapshot) and returns
// data with no copy; this file owns the overdue predicate, the WORDS and the defensive
// parse of the answer. The percentage is never recomputed here.
//
// The overdue predicate lives here, once, for the list and the detail (ratified Q3/Q4
// and the AI Tech Lead decision TL-5 on BK-206): overdue = target date before today
// (server UTC, the same `todayUtcIso()` the countdown chip uses) AND readiness is not
// 100. No readiness at all (no plan attached, or attached plans with no tests) counts
// as "not 100". It clears when the date moves to today or later, or when readiness
// reaches 100, and comes back by itself if readiness drops again.

const CountsSchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  aborted: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  not_run: z.number().int().nonnegative(),
});

const AttachedPlanSchema = z.object({
  plan_id: z.string(),
  name: z.string(),
  status: z.enum(['open', 'closed']),
  frozen: z.boolean(),
  member_count: z.number().int().nonnegative(),
  passed_pct: z.number().int().min(0).max(100).nullable(),
  counts: CountsSchema,
});

const MilestoneReadinessSchema = z.object({
  milestone_id: z.string(),
  plan_count: z.number().int().nonnegative(),
  member_count: z.number().int().nonnegative(),
  // null = no readiness: no plan attached, or the attached plans have no tests.
  passed_pct: z.number().int().min(0).max(100).nullable(),
  counts: CountsSchema,
  plans: z.array(AttachedPlanSchema),
});

export type AttachedPlanReadiness = z.infer<typeof AttachedPlanSchema>;
export type MilestoneReadiness = z.infer<typeof MilestoneReadinessSchema>;

// The RPC answers jsonb. An element that is not the contract is dropped, so the page
// renders without readiness for that milestone instead of crashing.
export function parseMilestonesReadiness(data: unknown): Map<string, MilestoneReadiness> {
  const result = new Map<string, MilestoneReadiness>();
  if (!Array.isArray(data)) { return result; }
  for (const entry of data) {
    const parsed = MilestoneReadinessSchema.safeParse(entry);
    if (parsed.success) { result.set(parsed.data.milestone_id, parsed.data); }
  }
  return result;
}

// The three states the readiness area must keep visibly apart (AC 2.5, 2.7, 5.1, 5.2):
// nothing attached, attached plans that hold no tests, and a real percentage (0 too).
export type ReadinessState = 'no-plans' | 'no-tests' | 'progress';

export function readinessState(readiness: Pick<MilestoneReadiness, 'plan_count' | 'member_count' | 'passed_pct'>): ReadinessState {
  if (readiness.plan_count === 0) { return 'no-plans'; }
  if (readiness.member_count === 0 || readiness.passed_pct === null) { return 'no-tests'; }
  return 'progress';
}

// The milestone's pooled answer in the BK-204 summary shape, so the live progress
// grammar (segmented bar, legend chips) renders it unchanged.
export function asProgressSummary(args: { id: string, member_count: number, passed_pct: number | null, counts: PlanProgressCounts }): PlanProgressSummary {
  return { plan_id: args.id, member_count: args.member_count, passed_pct: args.passed_pct, counts: args.counts };
}

export function isOverdue(args: { targetDate: string, readinessPct: number | null }, todayIso: string = todayUtcIso()): boolean {
  // Both are plain `YYYY-MM-DD` strings, so string order is date order.
  return args.targetDate < todayIso && args.readinessPct !== 100;
}

export interface OverdueInfo {
  days: number
  label: string
}

// null when the milestone is not overdue. The day count comes from the countdown
// rulebook, so the badge and the "N days past target" chip always agree.
export function overdueInfo(args: { targetDate: string, readinessPct: number | null }, todayIso: string = todayUtcIso()): OverdueInfo | null {
  if (!isOverdue(args, todayIso)) { return null; }
  const days = Math.abs(computeCountdown(args.targetDate, todayIso).daysFromToday);
  return { days, label: `Overdue by ${dayWord(days)}` };
}

// The detail's overdue note, after the bold "This milestone is overdue." lead. With no
// readiness it says so instead of printing a zero (PO-3 on BK-206: an empty state is
// never rendered as 0%).
export function overdueNoteText(args: { days: number, readinessPct: number | null, planCount: number }): { passed: string, readiness: string, action: string } {
  return {
    passed: `passed ${dayWord(args.days)} ago`,
    readiness: args.readinessPct === null
      ? 'no readiness has been recorded yet'
      : `readiness is at ${args.readinessPct}%`,
    action: args.planCount === 0
      ? 'move the target date or attach the test plans that gate it.'
      : 'move the target date or finish the attached plans.',
  };
}

// "12 of 20 tests passed across 2 plans · refreshed on view."
export function readinessNote(args: { passed: number, total: number, planCount: number }): string {
  return `${args.passed} of ${args.total} tests passed across ${args.planCount} ${args.planCount === 1 ? 'plan' : 'plans'} · refreshed on view.`;
}

export function planCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'plan' : 'plans'}`;
}

function dayWord(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
