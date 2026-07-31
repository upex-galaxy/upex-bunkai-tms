// BK-37 — the two run-history constants the SERVER schema and the CLIENT screen
// both need, kept in a module with NO imports at all.
//
// Why a separate file: `history-validation.ts` evaluates `z.object(...)` at its
// top level, so importing anything from it — even a plain number — pulls Zod and
// the whole schema graph into whatever bundle does the importing. The Run
// History screen is a `'use client'` component that needs exactly these two
// values, and nothing else from that module. Splitting them out keeps Zod on the
// server side of the boundary while the two layers still read the SAME numbers,
// which is the point of having a constant at all.
//
// `history-validation.ts` re-exports both, so every existing server-side import
// keeps working unchanged.

// PO-confirmed page size (BK-37, 2026-07-21). Single source of truth: the
// frontend imports THIS constant so the two layers can never drift.
export const RUN_HISTORY_PAGE_SIZE = 50;

// Mirrors the terminal statuses in the runs_status CHECK (0031_runs.sql) minus
// 'running', and the bunkai_list_test_runs outcome backstop (0038_run_history.sql).
export const RUN_HISTORY_OUTCOMES = ['passed', 'failed', 'aborted'] as const;

export type RunHistoryOutcome = (typeof RUN_HISTORY_OUTCOMES)[number];
