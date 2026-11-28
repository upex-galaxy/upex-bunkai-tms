import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import { BUG_SEVERITY_LABEL } from '@lib/bugs/constants';

// BK-2098 — the shared vocabulary of the Bug bulk edit (ADR-0029): the change a
// user picks, the report the server returns and the words both sides use. Kept
// free of zod so the browser bundle does not pull it in; the request schema
// lives in `bulk-edit-validation`.

export const BUG_BULK_CEILING = 200;

export const BUG_BULK_FIELDS = ['status', 'severity'] as const;
export type BugBulkField = (typeof BUG_BULK_FIELDS)[number];

// The stages the screen offers. "open" is accepted by the API (P10) and never
// offered: no Bug can move back to it.
export const BUG_BULK_STATUS_TARGETS = ['in_progress', 'resolved', 'closed'] as const satisfies readonly BugStatus[];

export type BugBulkChange
  = | { field: 'status', status: BugStatus }
    | { field: 'severity', severity: BugSeverity };

export interface BugBulkItem {
  id: string
  version: number | null
}

export type BugBulkOutcomeKind = 'changed' | 'unchanged' | 'refused';

export const BUG_BULK_REFUSAL_REASONS = [
  'stale_version',
  'status_transition_skipped',
  'status_transition_backward',
  'not_found',
  'write_failed',
] as const;
export type BugBulkRefusalReason = (typeof BUG_BULK_REFUSAL_REASONS)[number];

export const BUG_BULK_REASON_LABEL: Record<BugBulkRefusalReason, string> = {
  stale_version: 'Corrected by someone else since you loaded the list',
  status_transition_skipped: 'Would skip a stage: a Bug moves one stage at a time',
  status_transition_backward: 'Would move back: a Bug never returns to an earlier stage',
  not_found: 'No longer available',
  write_failed: 'The write failed',
};

export interface BugBulkOutcome {
  bug_id: string
  title: string | null
  outcome: BugBulkOutcomeKind
  reason: string | null
  status: string | null
  severity: string | null
  version: number | null
}

export interface BugBulkEditReport {
  dry_run: boolean
  field: BugBulkField
  requested: number
  changed: number
  unchanged: number
  refused: number
  outcomes: BugBulkOutcome[]
}

export const BUG_BULK_STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function pluralBugs(count: number): string {
  return `${count} ${count === 1 ? 'Bug' : 'Bugs'}`;
}

// AC20 — refused before any confirmation, naming the ceiling.
export function bugBulkSelectionProblem(count: number): string | null {
  if (count > BUG_BULK_CEILING) {
    return `You can bulk-edit at most ${BUG_BULK_CEILING} Bugs at a time. Deselect ${count - BUG_BULK_CEILING} to continue.`;
  }
  return null;
}

export function describeBugBulkChange(change: BugBulkChange): string {
  return change.field === 'status'
    ? `Set status to ${BUG_BULK_STATUS_LABEL[change.status]}`
    : `Set severity to ${change.severity} ${BUG_SEVERITY_LABEL[change.severity]}`;
}

export function isIrreversibleBugBulkChange(change: BugBulkChange): boolean {
  return change.field === 'status' && change.status === 'closed';
}

export function toBugBulkWireChange(change: BugBulkChange): Record<string, string> {
  return change.field === 'status' ? { status: change.status } : { severity: change.severity };
}

export function isBugBulkRefusalReason(reason: string | null): reason is BugBulkRefusalReason {
  return reason !== null && (BUG_BULK_REFUSAL_REASONS as readonly string[]).includes(reason);
}

export function bugBulkReasonLabel(reason: string | null): string {
  return BUG_BULK_REASON_LABEL[isBugBulkRefusalReason(reason) ? reason : 'write_failed'];
}

export interface BugRefusalGroup {
  reason: BugBulkRefusalReason
  label: string
  outcomes: BugBulkOutcome[]
}

export function groupBugRefusals(report: BugBulkEditReport): BugRefusalGroup[] {
  const groups = new Map<BugBulkRefusalReason, BugBulkOutcome[]>();
  for (const outcome of report.outcomes) {
    if (outcome.outcome !== 'refused') { continue; }
    const reason = isBugBulkRefusalReason(outcome.reason) ? outcome.reason : 'write_failed';
    groups.set(reason, [...(groups.get(reason) ?? []), outcome]);
  }
  return BUG_BULK_REFUSAL_REASONS
    .filter(reason => groups.has(reason))
    .map(reason => ({ reason, label: BUG_BULK_REASON_LABEL[reason], outcomes: groups.get(reason) ?? [] }));
}

export function refusedBugIds(report: BugBulkEditReport): string[] {
  return report.outcomes.filter(o => o.outcome === 'refused').map(o => o.bug_id);
}
