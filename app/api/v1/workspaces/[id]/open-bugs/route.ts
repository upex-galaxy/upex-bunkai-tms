import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { HOME_OPEN_BUG_STATUSES } from '@lib/home/constants';
import { countOpenBugs } from '@lib/home/open-bugs';

// GET /api/v1/workspaces/{id}/open-bugs — how many defects are currently
// outstanding across every project in the workspace, broken down by severity
// (BK-258).
//
// This exists so the Home stat card's numbers are verifiable by API rather than
// only by eye: the route and the Home server component call the SAME
// `countOpenBugs`, so what QA reads here is byte-for-byte what the screen
// renders. What "open" means is documented on `HOME_OPEN_BUG_STATUSES` and
// echoed on the wire as `open_statuses`, so a caller reads the rule instead of
// reverse-engineering it from a number.
//
// `open_count` is always the sum of `by_severity` — see the derivation note on
// `countOpenBugs` for why the total is derived rather than counted separately.
//
// No `limit` parameter: this endpoint returns five numbers, not a page.
//
// Auth: cookie session or Bearer PAT holding `atc:read`. The response is a
// workspace-wide defect posture — how much is broken and how badly — which is
// the same class of workspace inventory the two sibling Home reads
// (`/recent-projects`, `/active-runs`) gate behind `atc:read`, so it uses the
// same floor rather than inventing a bug-shaped scope the catalog does not have.
// Cookie sessions hold the full capability set, so this constrains PATs only.
// Not a `workspace:admin` operation, so it deliberately does not call
// `assertWorkspaceContext` (ADR-0006 binds a PAT to its own workspace for admin
// operations only).
//
// Non-disclosure: a foreign, nonexistent, or lost-membership workspace id
// collapses into the SAME `200` with zeroes that a workspace with no open bugs
// returns. Every read runs through the caller's own RLS-scoped client
// (`getAuth(ctx).db`, never `createAdminClient()`), so the isolation is
// Postgres's, not this handler's — a forged path segment counts nothing.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const result = await countOpenBugs(db, { workspaceId });
  // A failed read must never leave here as zeroes — that is the answer for a
  // workspace with nothing outstanding, and a client cannot tell the two apart
  // afterwards.
  if (!result.ok) {
    throw new ApiError('internal_error', 'The workspace\'s open bugs could not be counted.');
  }

  return jsonResponse({
    open_count: result.totalOpen,
    by_severity: result.bySeverity,
    open_statuses: [...HOME_OPEN_BUG_STATUSES],
  }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/open-bugs` -> the segment right after the literal
  // "workspaces" (mirrors the sibling recent-projects/active-runs routes).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
