import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { coveragePercent, summarizeWorkspaceCoverage } from '@lib/home/coverage';

// GET /api/v1/workspaces/{id}/coverage — the workspace's overall test-coverage
// summary: how much of its acceptance criteria has a test case bound, how much
// of that has actually been executed, and how much has nothing bound at all
// (BK-259).
//
// This exists so the Home stat card's percentage is verifiable by API rather
// than only by eye: the route and the Home server component call the SAME
// `summarizeWorkspaceCoverage`, so what QA reads here is what the screen
// renders. That function in turn adds up `bunkai_report_project_coverage` —
// the same RPC behind `/api/v1/projects/{id}/coverage` — so this endpoint and
// the per-project one can never disagree about whether a given acceptance
// criterion is covered.
//
// THE ROLL-UP RULE, stated so the number is auditable: every acceptance
// criterion in the workspace counts exactly once, regardless of which project
// it belongs to (`sum(ac_bound) / sum(ac_total)`). It is NOT the average of the
// per-project percentages, which would weight a 3-criteria project the same as
// a 300-criteria one. The raw counts ship alongside the percentages so a caller
// can recompute either figure rather than trust it.
//
// No `limit` parameter: this endpoint returns a handful of numbers, not a page.
//
// Auth: cookie session or Bearer PAT holding `atc:read`. Coverage is a
// workspace-wide inventory of test assets, the same class of read the three
// sibling Home endpoints (`/recent-projects`, `/active-runs`, `/open-bugs`) are
// gated on, so it uses the same floor. Cookie sessions hold the full capability
// set, so this constrains PATs only. Not a `workspace:admin` operation, so it
// deliberately does not call `assertWorkspaceContext` (ADR-0006 binds a PAT to
// its own workspace for admin operations only).
//
// Non-disclosure: a foreign, nonexistent, or lost-membership workspace id
// collapses into the SAME `200` — zero projects, zero acceptance criteria, null
// percentages — that a brand-new empty workspace returns. The project list is
// read through the caller's own RLS-scoped client (`getAuth(ctx).db`, never
// `createAdminClient()`) and each per-project RPC re-checks the actor's
// membership on its own account, so the isolation is Postgres's, not this
// handler's.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);

  const result = await summarizeWorkspaceCoverage(db, {
    workspaceId,
    actorUserId: principal.userId,
  });
  // A failed read must never leave here as zeroes: "0 of 0 acceptance criteria"
  // is the honest answer for an empty workspace, and a client cannot tell the
  // two apart afterwards.
  if (!result.ok) {
    throw new ApiError('internal_error', 'The workspace\'s test coverage could not be measured.');
  }

  return jsonResponse({
    ac_total: result.acTotal,
    ac_bound: result.acBound,
    ac_executed: result.acExecuted,
    ac_not_run: result.acNotRun,
    ac_uncovered: result.acUncovered,
    ac_coverage_percent: coveragePercent(result.acBound, result.acTotal),
    executed_coverage_percent: coveragePercent(result.acExecuted, result.acTotal),
    modules_total: result.modulesTotal,
    modules_fully_covered: result.modulesFullyCovered,
    project_count: result.projectCount,
  }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/coverage` -> the segment right after the literal
  // "workspaces" (mirrors the sibling recent-projects/active-runs/open-bugs
  // routes).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
