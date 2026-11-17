import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import type { BugAggregates } from '@lib/bugs/list-view';

// BK-555 — the values the workspace Bug Reports index shares between the
// server (query schema, API route, page) and the `'use client'` screen. Type
// imports only, so nothing here pulls Zod into the browser bundle.

// The RPC's ceiling (0132 clamps 1..50). One knob, independent of the Project
// list's page size (BK-41): a change to one must not move the other.
export const WORKSPACE_BUGS_PAGE_SIZE = 50;

// The resolved assignee of a row: `email` is null when the teammate's address
// cannot be resolved; the whole object is null for an unassigned defect.
export interface WorkspaceBugAssignee {
  user_id: string
  email: string | null
}

// One row of the index, as the API returns it and the screen renders it.
export interface WorkspaceBugItem {
  id: string
  workspace_id: string
  project_id: string
  project_slug: string | null
  project_name: string | null
  module: { id: string, name: string, path: string }
  // null for a defect filed manually, and for one whose Run was deleted later
  // (`bugs.run_id` is ON DELETE SET NULL).
  run_id: string | null
  title: string
  severity: BugSeverity
  status: BugStatus
  assignee_user_id: string | null
  assignee: WorkspaceBugAssignee | null
  created_at: string
}

export interface WorkspaceBugsPage {
  data: WorkspaceBugItem[]
  // Over the whole filtered set, never the page (AC-12).
  aggregates: BugAggregates
  next_cursor: string | null
  // Unfiltered: the number beside the sidebar's "Bug Reports" entry (AC-02).
  workspace_bug_count: number
}

// The three filters the screen holds. `null` / empty = not applied.
export interface WorkspaceBugFilters {
  projectId: string | null
  statuses: BugStatus[]
  severities: BugSeverity[]
}

export const EMPTY_WORKSPACE_BUG_FILTERS: WorkspaceBugFilters = {
  projectId: null,
  statuses: [],
  severities: [],
};
