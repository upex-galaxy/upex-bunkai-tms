// BK-337 — defect-detail view-state logic: framework-agnostic, pure
// functions only. All I/O (the GET /api/v1/bugs/{id} call) stays in the page
// (`app/(app)/projects/[projectSlug]/bugs/[bugId]/page.tsx`) and the client
// component (`components/bugs/BugDetailView.tsx`). Mirrors `lib/bugs/
// list-view.ts`'s split — formatting stays out of the component so it is
// unit-testable without a browser or a live DB.

import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import { BUG_SEVERITY_LABEL } from '@lib/bugs/constants';
import { isHttpUrl } from '@lib/utils/url';

// The shape `bunkai_bug_json` returns (0046_bugs.sql, widened by
// 0070_bug_detail_composer.sql) — the fields this view reads. `origin` is
// null end-to-end for a standalone defect (Product Owner Q3/2.1 ruling).
export interface BugDetailOrigin {
  run_id: string
  run_step_position: number | null
  atc_id: string | null
  atc_title: string | null
  atc_layer: string | null
}

export interface BugDetailInput {
  id: string
  title: string
  severity: string
  status: string
  description: string | null
  steps_to_reproduce: string
  evidence_urls: string[]
  assignee_user_id: string | null
  created_by: string | null
  created_at: string
  module: { id: string, name: string, path: string, archived_at: string | null } | null
  origin: BugDetailOrigin | null
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

// AC1.1 — the list's existing 8-character-prefix identifier treatment
// (BugsListView.tsx:774-776 / lib/bugs/list-view.ts:119), reused verbatim per
// the Product Owner's Q4 ruling. NOT a new format.
export function shortBugId(id: string): string {
  return id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Steps to reproduce (TQ1)
// ---------------------------------------------------------------------------

// Split on newlines at render time, drop blank lines, number from 1. This
// ordinal is a line number of a free-text field — NEVER `run_steps.position`
// (a different, 0-based quantity sourced from the Origin panel's own
// `run_step_position`). A run-linked defect's `steps_to_reproduce` carries
// the ONE failed step's own content verbatim (lib/runs/report-bug-view.ts) —
// there is no stored index of "which line failed" to highlight, which is why
// no line here ever carries a "failed" treatment (AC1.2, AC1.3).
export function splitStepsToReproduce(stepsToReproduce: string): string[] {
  return stepsToReproduce
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

// ---------------------------------------------------------------------------
// Origin panel (AC1.3, AC1.4, AC2.1)
// ---------------------------------------------------------------------------

export type BugOriginState = 'linked' | 'standalone';

export interface BugOriginView {
  state: BugOriginState
  // Only present when state === 'linked'.
  runId?: string
  atcId?: string
  atcTitle?: string
  // 1-based — the Product Owner's pinned arithmetic: the stored 0-based
  // `run_steps.position` plus 1. Absent when the composer could not resolve
  // a run_step_position (defensive — every real run-linked defect carries
  // one).
  failedStepNumber?: number
}

// AC2.1 — "Filed manually" is read from the absence of `origin`, not from a
// separate flag (the Product Owner's 2.2 ruling: no run-deletion path exists
// in this product, so there is nothing to distinguish "filed manually" from
// "origin no longer available").
export function resolveBugOriginView(origin: BugDetailOrigin | null): BugOriginView {
  if (!origin) {
    return { state: 'standalone' };
  }
  return {
    state: 'linked',
    runId: origin.run_id,
    atcId: origin.atc_id ?? undefined,
    atcTitle: origin.atc_title ?? undefined,
    failedStepNumber: origin.run_step_position === null ? undefined : origin.run_step_position + 1,
  };
}

// ---------------------------------------------------------------------------
// Details panel (AC2.1 — exactly severity/status/module/reporter/filed/assignee)
// ---------------------------------------------------------------------------

export function severityLabel(severity: string): string {
  return BUG_SEVERITY_LABEL[severity as BugSeverity] ?? severity;
}

const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function statusLabel(status: string): string {
  return BUG_STATUS_LABEL[status as BugStatus] ?? status;
}

// PO Q3, decision C — render the record, tag the module row, never 404 it.
export function isModuleArchived(module: BugDetailInput['module']): boolean {
  return module?.archived_at != null;
}

// ---------------------------------------------------------------------------
// Evidence panel (AC3.1-3.4, TQ4)
// ---------------------------------------------------------------------------

export interface BugEvidenceRow {
  url: string
  label: string
  isOpenable: boolean
}

// TQ4 — label = the URL's last non-empty path segment, else the host, full
// URL always in `title` (mirrors BugsListView.tsx:774-775's identifier
// treatment). Scenario 3.4 — only http/https entries are openable anchors;
// everything else renders as plain text, never dropped from the count.
export function formatBugEvidenceRow(url: string): BugEvidenceRow {
  return {
    url,
    label: evidenceLabel(url),
    isOpenable: isHttpUrl(url),
  };
}

function evidenceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(segment => segment.length > 0);
    if (segments.length > 0) {
      return segments.at(-1)!;
    }
    return parsed.host || url;
  }
  catch {
    // Not URL-parseable at all (defensive — evidenceUrlsSchema should have
    // rejected this at filing time) — the raw value is the best available
    // label, still rendered as inert text (isOpenable is false either way).
    return url;
  }
}

export function evidenceCountLabel(count: number, cap: number): string {
  return `${count} / ${cap}`;
}
