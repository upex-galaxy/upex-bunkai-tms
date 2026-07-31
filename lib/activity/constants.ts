// BK-49 — the activity feed's page size + event allowlist, kept in a
// zero-import module so the SERVER schema (`history-validation.ts`) and a
// future CLIENT view (Slice 3) both import the SAME values without pulling
// Zod and its schema graph into the browser bundle. Mirrors
// `lib/runs/history-constants.ts`'s split.

// Stage-1 gap-fill (Technical Decision 1, implementation-plan.md): no
// PO-specified default exists in the ATP/Jira thread. Reuses Run History's
// proven bound (clamp 1..50) with a smaller default than Runs' 50, since
// activity is typically higher-frequency per workspace than one Test's
// history.
export const ACTIVITY_PAGE_SIZE = 30;

// The MVP event allowlist (Technical Decision 2, Database design § "Event
// allowlist"). The API route ALWAYS passes this explicitly to
// bunkai_list_activity — the RPC's own default (migration
// 0045_activity_stream.sql) is a direct-caller backstop only, not the
// enforcement point. Kept in sync BY HAND with that SQL literal (Decision
// 2's flagged trade-off) — changing one without the other silently drifts
// `ACTION_LABELS` coverage from the server's actual filter.
export const ACTIVITY_ALLOWED_ACTIONS = [
  'module.renamed',
  'module.description_updated',
  'module.moved',
  'module.archived',
  'atc.created',
  'test.created',
  'run.finished',
  'run.aborted',
] as const;

export type ActivityAction = (typeof ACTIVITY_ALLOWED_ACTIONS)[number];
