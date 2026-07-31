// BK-40 — bare bugs-list view-state logic: framework-agnostic, pure functions
// only. All I/O (the GET .../bugs call) stays in the future standalone list
// page (Slice 3 — out of scope here); this file is what makes the empty-state
// resolution and per-row display formatting unit-testable without a browser or
// a live DB. Mirrors `lib/runs/report-view.ts`'s pattern, scaled down to the
// "bare-bones list" scope Technical Decision 2 sets for BK-40 (no filters, no
// counts — those are BK-41/BK-42's additive work on this same route).

export type BugListViewState = 'empty' | 'rows';

export function resolveBugListViewState(rowCount: number): BugListViewState {
  return rowCount > 0 ? 'rows' : 'empty';
}

export const BUG_LIST_EMPTY_TITLE = 'No bugs filed yet';
export const BUG_LIST_EMPTY_DESCRIPTION
  = 'File a bug from a failing run step, or create one directly from this list.';

// The shape `bunkai_bug_json` / `bunkai_list_project_bugs` return (the fields
// this view actually reads — the API surfaces more, e.g. description).
export interface BugListRowInput {
  id: string
  title: string
  severity: string
  status: string
  module: { path: string } | null
  run_id: string | null
}

export interface BugListRow {
  id: string
  title: string
  severity: string
  status: string
  modulePath: string
  runLinkLabel: string
}

// Row formatting for display. `module` should always be present (bugs.module_id
// is NOT NULL and bunkai_bug_json always nests it), but the type stays
// defensive rather than assuming the API never regresses on this. `run_id`
// null means a standalone bug — rendered as a dash, never a broken link.
export function formatBugListRow(bug: BugListRowInput): BugListRow {
  return {
    id: bug.id,
    title: bug.title,
    severity: bug.severity,
    status: bug.status,
    modulePath: bug.module?.path ?? '—',
    runLinkLabel: bug.run_id ? `Run ${bug.run_id.slice(0, 8)}` : '—',
  };
}
