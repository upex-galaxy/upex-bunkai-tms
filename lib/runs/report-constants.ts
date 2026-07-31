// BK-38 — the constants the SERVER schema (`report-validation.ts`) and the
// CLIENT screen (`ProjectRunsReportView.tsx`, UI slice) both need, kept in a
// module with NO imports at all.
//
// Why a separate file: same reasoning as `history-constants.ts` (BK-37).
// `report-validation.ts` evaluates `z.object(...)` at its top level, so
// importing anything from it — even a plain number — pulls Zod and the whole
// schema graph into whatever bundle does the importing. The Run Report screen
// is a `'use client'` component that needs exactly these values, and nothing
// else from that module. Splitting them out keeps Zod on the server side of
// the boundary while both layers still read the SAME values.
//
// `report-validation.ts` re-exports all three, so every server-side import of
// that module keeps working unchanged.

// Same page size as BK-37's Run History (`RUN_HISTORY_PAGE_SIZE`,
// `history-constants.ts`) — not re-exported/aliased because the two features'
// page sizes are independent knobs that happen to share a value today; a
// future PO change to one must not silently change the other.
export const REPORT_PAGE_SIZE = 50;

// Mirrors the terminal statuses in the runs_status CHECK (0031_runs.sql) minus
// 'running'. `running` IS a valid `runs.status` value — a currently-running
// Run is a legitimate row in the report and is never dropped from it — it is
// simply excluded from the FILTER enum: the mockup's status filter chips are
// Passed/Failed/Aborted only (Divergence D-1 / Technical Decision D4 in the
// BK-38 implementation plan). There is no code path today that ever sets a
// Run header's own `status` to `blocked`/`skipped` (those are per-step /
// per-chain-position states), so they are not candidates here either.
export const REPORT_STATUS_VALUES = ['passed', 'failed', 'aborted'] as const;

export type ReportStatus = (typeof REPORT_STATUS_VALUES)[number];

// Mirrors the runs.executor_mode enum verbatim (0031_runs.sql, BK-34).
export const REPORT_EXECUTOR_VALUES = ['human', 'agent', 'ci'] as const;

export type ReportExecutor = (typeof REPORT_EXECUTOR_VALUES)[number];
