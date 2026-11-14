// BK-513 — the values the workspace Runs index shares between the server
// (query schema, API route) and the `'use client'` screen. No imports at all,
// for the same reason as `report-constants.ts`: importing a value from the
// Zod schema module would pull Zod into the browser bundle.

// Same page size as the Project run report (BK-38). Independent knob: a change
// to one must not move the other.
export const WORKSPACE_RUNS_PAGE_SIZE = 50;

// Outcomes a caller can filter by. `running` is a state a Run passes through,
// not an outcome (AC-09, BK-38's convention), and aborted Runs are not offered
// (AC-08, PO ruling of 2026-11-12). Both still appear in the unfiltered list.
export const WORKSPACE_RUN_OUTCOME_VALUES = ['passed', 'failed'] as const;

export type WorkspaceRunOutcome = (typeof WORKSPACE_RUN_OUTCOME_VALUES)[number];

// Execution mode, BK-225's derivation: manual = executor `human`, automated =
// executor `agent` or `ci`.
export const WORKSPACE_RUN_MODE_VALUES = ['manual', 'automated'] as const;

export type WorkspaceRunMode = (typeof WORKSPACE_RUN_MODE_VALUES)[number];

// Environments are defined per Project; the filter matches by name across
// Projects, case-insensitively. Bounded so a URL cannot carry an essay.
export const WORKSPACE_RUN_ENVIRONMENT_MAX_LENGTH = 100;

// `status` of a row in the index — every value `runs.status` can hold (0031).
export type WorkspaceRunStatus = 'running' | 'passed' | 'failed' | 'aborted';

// One row of the index, as the API returns it and the screen renders it.
export interface WorkspaceRunItem {
  id: string
  project_id: string
  project_slug: string | null
  project_name: string | null
  test_id: string
  test_title: string
  environment_name: string | null
  executor_mode: string
  status: WorkspaceRunStatus
  started_at: string
  finished_at: string | null
  passed_steps: number
  failed_steps: number
  blocked_steps: number
}

export interface WorkspaceRunsPage {
  items: WorkspaceRunItem[]
  next_cursor: string | null
  workspace_run_count: number
}

// The four filters the screen holds. `null` / empty = not applied.
export interface WorkspaceRunFilters {
  projectId: string | null
  status: WorkspaceRunOutcome[]
  environment: string | null
  mode: WorkspaceRunMode | null
}

export const EMPTY_WORKSPACE_RUN_FILTERS: WorkspaceRunFilters = {
  projectId: null,
  status: [],
  environment: null,
  mode: null,
};
