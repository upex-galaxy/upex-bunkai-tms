import type { RunHistoryOutcome } from '@lib/runs/history-validation';

// BK-37 — Run History view-state logic: framework-agnostic, pure functions only.
// All I/O stays in `runs/page.tsx` (server) and `RunHistoryView` (client); this
// file is what makes the branch selection and the empty-state copy unit-testable
// without a browser or a live DB. Mirrors `resolveWorkspacesViewState`
// (lib/account/workspaces.ts), the same pattern one story earlier.

export type RunHistoryViewState = 'error' | 'empty-never-run' | 'empty-no-match' | 'rows';

// A Test that has never been run — the AC's literal string. NOT the same state
// as "the filter matched nothing": one says the history is empty, the other says
// the current question has no answer, and conflating them hides the difference.
export const RUN_HISTORY_EMPTY_NEVER_RUN = 'No runs yet for this Test';

// `passed` -> `Passed`. The outcome enum is lowercase on the wire; the PO's copy
// contract capitalizes it inside the sentence.
export function capitalizeOutcome(outcome: RunHistoryOutcome): string {
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

// 0-match copy, PO-contracted (Jira comment 2026-07-21): `No Aborted runs found
// for this Test`. This supersedes the AC scenario's shorter illustrative
// "No aborted runs found" — the PO comment prescribes the literal string with an
// explicit consistency rationale (plan §3.1). Exported so the component and its
// tests assert against ONE source.
export function runHistoryNoMatchMessage(outcome: RunHistoryOutcome): string {
  return `No ${capitalizeOutcome(outcome)} runs found for this Test`;
}

interface ResolveRunHistoryViewStateParams {
  // FIRST-PAGE failure only. A failed "load older" is NOT an input here: it must
  // leave the rows mounted and report inline at the load-older control, so the
  // caller keeps it in its own state and never routes it through this resolver.
  error: boolean
  rowCount: number
  outcome: RunHistoryOutcome | null
}

// Branch selection for the four mutually exclusive blocks. A first-page error
// wins over everything (a failed first query also resolves to zero rows, and
// rendering "no runs" on a broken request would be a lie). With rows, the filter
// is irrelevant — including when an APPEND has just failed, which is precisely
// why that failure is kept out of `error`: ranking it here would unmount every
// row already loaded, and a Retry could then only restore page 1.
// Without rows, the ACTIVE FILTER is what separates "never run" from "no match".
export function resolveRunHistoryViewState({ error, rowCount, outcome }: ResolveRunHistoryViewStateParams): RunHistoryViewState {
  if (error) {
    return 'error';
  }
  if (rowCount > 0) {
    return 'rows';
  }
  return outcome === null ? 'empty-never-run' : 'empty-no-match';
}
