// BK-40 — shared bounds for the bugs domain. Mirrors the `bugs` table CHECKs
// (0046_bugs.sql) so the Zod layer, the RPC backstop, and the DB CHECK can
// never drift apart on the numbers themselves.

export const BUG_TITLE_MIN = 5;
export const BUG_TITLE_MAX = 200;

export const BUG_SEVERITY_VALUES = ['P1', 'P2', 'P3', 'P4'] as const;
export type BugSeverity = (typeof BUG_SEVERITY_VALUES)[number];

export const BUG_EVIDENCE_MAX = 10;
