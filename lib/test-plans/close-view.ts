import type { PlanVerdict } from '@lib/test-plans/close-validation';
import { formatLastRun } from '@lib/test-plans/progress-view';
import { z } from 'zod';

// BK-207 — Test Plan closure view model: framework-agnostic, pure functions only.
// `bunkai_close_test_plan` / `bunkai_reopen_test_plan` (0095_plan_close.sql) own the
// RULES; this file owns the WORDS, the role predicate the UI uses to decide whether to
// offer the action (presentation only: the RPC re-checks the live role on every call),
// and the parse of the list filter.

export type WorkspaceRole = 'viewer' | 'member' | 'admin' | 'owner';

// Close and reopen share one rule (ratified): the plan's creator while they still hold
// write access, or an admin / owner. A creator demoted to viewer cannot, because a
// viewer is read-only for every write.
export function canClosePlan(args: { role: string | null | undefined, isCreator: boolean }): boolean {
  if (args.role === 'admin' || args.role === 'owner') { return true; }
  return args.isCreator && args.role === 'member';
}

// The dialog's warning. It informs and never blocks (ratified): a plan whose tests were
// all never run still closes, and a plan with nothing to warn about shows no block.
export function notRunWarning(notRunCount: number): string | null {
  if (!Number.isFinite(notRunCount) || notRunCount <= 0) { return null; }
  return notRunCount === 1
    ? '1 test in this plan has never been run. You can still close it.'
    : `${notRunCount} tests in this plan have never been run. You can still close it.`;
}

const VERDICT_LABEL: Record<PlanVerdict, string> = { passed: 'Passed', failed: 'Failed' };
// The live `.status-chip` / `.dot` data-status tokens (app/globals.css).
const VERDICT_CHIP_TOKEN: Record<PlanVerdict, 'pass' | 'fail'> = { passed: 'pass', failed: 'fail' };

export function verdictLabel(verdict: PlanVerdict): string {
  return VERDICT_LABEL[verdict];
}

export function verdictChipToken(verdict: PlanVerdict): 'pass' | 'fail' {
  return VERDICT_CHIP_TOKEN[verdict];
}

export const PlanVerdictSchema = z.enum(['passed', 'failed']);

// A stored verdict that is not in the vocabulary (a closed row seeded without one, or
// anything unexpected) renders no chip rather than a guessed one.
export function parseVerdict(value: unknown): PlanVerdict | null {
  const parsed = PlanVerdictSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// "Closed by mateo@acme.test · 2026-10-19 18:14" (UTC, same rule as the run time
// column: server and browser must print the same text).
export function closedByLine(args: { closedByLabel: string, closedAtIso: string | null }): string {
  const who = args.closedByLabel.length > 0 ? args.closedByLabel : 'a workspace member';
  return args.closedAtIso === null ? `Closed by ${who}` : `Closed by ${who} · ${formatLastRun(args.closedAtIso)}`;
}

// ?status= on the plans list. Absent means All (ratified default). The list page falls
// back to All for an unknown value; the API rejects it (see `StatusFilterSchema`).
export type PlanStatusFilter = 'open' | 'closed';
export const StatusFilterSchema = z.enum(['open', 'closed']);

export function parseStatusFilter(raw: string | string[] | null | undefined): PlanStatusFilter | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = StatusFilterSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
