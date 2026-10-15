// BK-443 — saved views: the bounds and copy shared by the database, the routes
// and the client. No imports: this module is pulled into 'use client'
// components, so it must stay free of Zod and of anything server-only.
//
// The numbers mirror migration 0093 (the CHECK constraints and the cap
// trigger). The database is the authority; these exist so the application
// layers refuse early with the same numbers.

export const VIEW_KINDS = ['traceability', 'run_history', 'bugs', 'workbench'] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

// Per person, project and surface (QA-drafted PO response on the ticket,
// enforced by the 0093 insert trigger, SQLSTATE 45100).
export const SAVED_VIEW_LIMIT = 25;

// Code points, not UTF-16 units: `Array.from(name).length` here, `char_length`
// in SQL. A tester's "🔴 P1s this sprint" counts each emoji once.
export const SAVED_VIEW_NAME_MAX = 80;

// Mirrors the `user_view_state_state_check` size ceiling.
export const SAVED_VIEW_STATE_MAX_BYTES = 4096;

// Longest free-text filter value (workbench ATC search text, Test tag) a view
// will keep. The live inputs have no maximum; a saved one is bounded.
export const SAVED_VIEW_TEXT_MAX = 100;

// Copy fixed by the AI Product Owner design decision on BK-443.
export const SAVED_VIEW_COPY = {
  nothingToSave: 'Nothing to save: apply at least one filter first.',
  nameTaken: 'That name is already used on this list.',
  limitReached: `You can keep up to ${SAVED_VIEW_LIMIT} saved views per list. Delete one to save another.`,
  unavailable: 'Could not complete the saved view request.',
  allDropped: 'None of the saved filters still apply, so the filters were cleared.',
} as const;

export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

// The workbench's two free-text filters are capped at the control, in code
// points, so what the member sees is always what a saved view and the address
// keep (an over-long value used to be dropped from the state silently).
export function clampSavedViewText(value: string): string {
  const points = Array.from(value);
  return points.length <= SAVED_VIEW_TEXT_MAX ? value : points.slice(0, SAVED_VIEW_TEXT_MAX).join('');
}
