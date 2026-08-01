// BK-40 — bare bugs-list view-state logic: framework-agnostic, pure functions
// only. All I/O (the GET .../bugs call) stays in the standalone list page
// (`components/bugs/BugsListView.tsx`, Slice 3); this file is what makes the
// empty-state resolution and per-row display formatting unit-testable without
// a browser or a live DB. Mirrors `lib/runs/report-view.ts`'s pattern, scaled
// down to the "bare-bones list" scope Technical Decision 2 sets for BK-40 (no
// filters, no counts — those are BK-41/BK-42's additive work on this same
// route).

import type { BugSeverity, BugStatus } from '@lib/bugs/constants';

export type BugListViewState = 'empty' | 'rows';

// BK-40 Slice 3 — status/severity -> the live `.status-chip`/`.dot`
// `data-status` tokens (`app/globals.css`), same substitution shape
// RunHistoryView/RunnerView already establish for their own domains. Tone
// mapping matches the mockup's own chip-toggle `data-tone` values
// (`bug-reports-index.html`) exactly, so BK-41's filter chips (same tones)
// will read as the same visual language as this bare list's rows.
const BUG_STATUS_TOKEN: Record<BugStatus, string> = {
  open: 'fail',
  in_progress: 'running',
  resolved: 'pass',
  closed: 'skipped',
};

const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const BUG_SEVERITY_TOKEN: Record<BugSeverity, string> = {
  P1: 'fail',
  P2: 'blocked',
  P3: 'running',
  P4: 'skipped',
};

const BUG_SEVERITY_LABEL: Record<BugSeverity, string> = {
  P1: 'Critical',
  P2: 'Major',
  P3: 'Minor',
  P4: 'Trivial',
};

// Defensive casts, not a trust boundary: `bug.status`/`bug.severity` come off
// the composed `bunkai_bug_json` payload as plain `string` (see
// `BugListRowInput` below), but the DB CHECK constraints guarantee one of
// these values in practice. A value outside the enum (only reachable by a
// future migration widening the CHECK without updating this map) falls back
// to the neutral 'skipped' token / the raw string, rather than throwing.
function resolveBugStatusToken(status: string): string {
  return BUG_STATUS_TOKEN[status as BugStatus] ?? 'skipped';
}

function resolveBugStatusLabel(status: string): string {
  return BUG_STATUS_LABEL[status as BugStatus] ?? status;
}

function resolveBugSeverityToken(severity: string): string {
  return BUG_SEVERITY_TOKEN[severity as BugSeverity] ?? 'skipped';
}

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
  severityLabel: string
  severityToken: string
  status: string
  statusLabel: string
  statusToken: string
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
    severityLabel: BUG_SEVERITY_LABEL[bug.severity as BugSeverity] ?? bug.severity,
    severityToken: resolveBugSeverityToken(bug.severity),
    status: bug.status,
    statusLabel: resolveBugStatusLabel(bug.status),
    statusToken: resolveBugStatusToken(bug.status),
    modulePath: bug.module?.path ?? '—',
    runLinkLabel: bug.run_id ? `Run ${bug.run_id.slice(0, 8)}` : '—',
  };
}
