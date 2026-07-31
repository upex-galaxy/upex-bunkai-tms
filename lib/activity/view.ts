// BK-49 — Activity feed view-state logic: framework-agnostic, pure functions
// only. All I/O stays in `activity/page.tsx` (server) and `ActivityView`
// (client); this file is what makes branch selection, the actor fallback, and
// the run-verdict derivation unit-testable without a browser or a live DB.
// Mirrors `lib/runs/history-view.ts` (BK-37), the same pattern one story
// earlier — Activity has no filter axis, so its state machine is the
// three-way reduction RunHistory's four-way one collapses to without a filter.

export type ActivityViewState = 'error' | 'empty' | 'rows';

interface ResolveActivityViewStateParams {
  // FIRST-PAGE failure only. A failed "load older" is NOT an input here: it
  // must leave the rows mounted and report inline at the load-older control
  // (mirrors RunHistoryView's `appendError` / `error` split).
  error: boolean
  rowCount: number
}

// Branch selection for the three mutually exclusive blocks (AC3 3.1 vs 3.2:
// empty must never be mistaken for a read failure, and vice versa).
export function resolveActivityViewState({ error, rowCount }: ResolveActivityViewStateParams): ActivityViewState {
  if (error) {
    return 'error';
  }
  return rowCount > 0 ? 'rows' : 'empty';
}

// AC1 1.4's safe fallback: an unresolvable actor (departed member, or no
// actor on a system-originated row) renders as neutral copy, never a raw
// uuid, blank cell, or crash.
export function resolveActorLabel(actor: { email: string | null }): string {
  return actor.email ?? 'a workspace member';
}

// `run.finished`'s verdict is the one payload field ACTION_LABELS calls out
// as "shown alongside" the label (lib/activity/labels.ts) rather than folded
// into the label string itself. Narrows the wire payload's `unknown` shape
// defensively — the SQL projection (migration 0045) only ever emits
// 'passed'|'failed'|null, but this function does not trust that from the
// TS side, matching Risk R1's "verify, don't assume" posture for anything
// crossing the RPC boundary.
export function extractRunVerdict(action: string, payload: Record<string, unknown>): 'passed' | 'failed' | null {
  if (action !== 'run.finished') {
    return null;
  }
  const verdict = payload.verdict;
  return verdict === 'passed' || verdict === 'failed' ? verdict : null;
}
