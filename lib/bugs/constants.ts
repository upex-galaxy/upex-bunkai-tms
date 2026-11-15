// BK-40 — shared bounds for the bugs domain. Mirrors the `bugs` table CHECKs
// (0046_bugs.sql) so the Zod layer, the RPC backstop, and the DB CHECK can
// never drift apart on the numbers themselves.

export const BUG_TITLE_MIN = 5;
export const BUG_TITLE_MAX = 200;

export const BUG_SEVERITY_VALUES = ['P1', 'P2', 'P3', 'P4'] as const;
export type BugSeverity = (typeof BUG_SEVERITY_VALUES)[number];

// Single source for the P1-P4 -> Critical/Major/Minor/Trivial mapping
// (matches bug-reports-index.html's own chip-toggle labels) — previously
// duplicated verbatim between BugFormDialog.tsx and list-view.ts (final-
// assembly review finding, 2026-08-01).
export const BUG_SEVERITY_LABEL: Record<BugSeverity, string> = {
  P1: 'Critical',
  P2: 'Major',
  P3: 'Minor',
  P4: 'Trivial',
};

export const BUG_EVIDENCE_MAX = 10;

// BK-594 — one budget per defect: at most BUG_EVIDENCE_MAX items (pasted links
// and uploaded images together) and BUG_EVIDENCE_MAX_BYTES of images (links
// weigh 0 bytes). Mirrors 0131_bug_evidence_attachments.sql (45303).
export const BUG_EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;

// BK-594 AI Product Owner decision P2: the refusal copy, chosen by the reason.
export const BUG_EVIDENCE_MESSAGES = {
  count: `This defect already holds the maximum evidence (${BUG_EVIDENCE_MAX} items).`,
  bytes: `This defect already holds the maximum evidence (${BUG_EVIDENCE_MAX} items or 50 MiB).`,
  unavailable: 'An attached image is no longer available. Remove it and attach it again.',
  frozen: 'Evidence on a filed defect cannot be changed.',
  expired: 'This upload expired. Attach the image again.',
} as const;

// BK-40 Slice 3 — mirrors the `bugs.status` CHECK (0046_bugs.sql). BK-40 only
// ever writes 'open' (Technical Decision 5); the full enum is needed now
// because the standalone list (Slice 3) renders whatever status a bug is
// already in, not just the one this ticket writes.
export const BUG_STATUS_VALUES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type BugStatus = (typeof BUG_STATUS_VALUES)[number];

// BK-41 — pagination bounds for GET /api/v1/bugs (Decision 4's contract:
// 1..50, default 30 — matches `lib/activity/constants.ts`'s ACTIVITY_PAGE_SIZE
// / activity route's own hardcoded max so `/bugs` stays consistent with its
// two closest siblings, `/activity` and `/tests/{id}/runs`).
export const BUGS_LIST_PAGE_SIZE = 30;
export const BUGS_LIST_MAX_PAGE_SIZE = 50;
