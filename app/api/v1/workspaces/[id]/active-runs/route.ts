import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { listActiveRuns } from '@lib/home/active-runs';
import { HOME_ACTIVE_RUNS_LIMIT } from '@lib/home/constants';

// GET /api/v1/workspaces/{id}/active-runs — every run currently in progress
// across every project in the workspace, newest first, with its step-completion
// progress and executor, plus the exact workspace-wide count of them (BK-256).
//
// This exists so the Home widget's numbers are verifiable by API rather than
// only by eye: the route and the Home server component call the SAME
// `listActiveRuns`, so what QA reads here is byte-for-byte what the screen
// renders. What "active" means — and why it is the same set the Home banner
// counts — is documented on that function.
//
//   ?limit=<1..20>  optional, default 5 (the widget's page size). `active_count`
//                   is workspace-wide and NOT capped by it. Out of range is
//                   rejected — never silently clamped.
//
// Auth: cookie session or Bearer PAT holding `atc:read`. `run:execute` is the
// only run-shaped scope in the catalog and it is a WRITE capability — gating a
// read behind it would be the wrong axis. `atc:read` is the same floor the
// sibling workspace read (`/recent-projects`) uses for the same class of
// workspace inventory: project names, run identifiers and executor identities.
// Cookie sessions hold the full capability set, so this constrains PATs only.
// Not a `workspace:admin` operation, so it deliberately does not call
// `assertWorkspaceContext` (ADR-0006 binds a PAT to its own workspace for admin
// operations only).
//
// Non-disclosure: a foreign, nonexistent, or lost-membership workspace id
// collapses into the SAME `200 {"runs": [], "active_count": 0}` an idle
// workspace returns. Every read runs through the caller's own RLS-scoped client
// (`getAuth(ctx).db`, never `createAdminClient()`), so the isolation is
// Postgres's, not this handler's — a forged path segment selects nothing.

const MAX_LIMIT = 20;

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  const { db } = getAuth(ctx);

  const result = await listActiveRuns(db, { workspaceId, limit });
  // A failed read must never leave here as an empty list — that is the answer
  // for a workspace with nothing running, and a client cannot tell the two
  // apart afterwards.
  if (!result.ok) {
    throw new ApiError('internal_error', 'The workspace\'s active runs could not be read.');
  }

  return jsonResponse({
    active_count: result.activeCount,
    runs: result.runs.map(run => ({
      id: run.id,
      project_slug: run.projectSlug,
      project_name: run.projectName,
      test_title: run.testTitle,
      executor_mode: run.executorMode,
      executor: run.executorLabel,
      state: run.state,
      total_steps: run.totalSteps,
      done_steps: run.doneSteps,
      blocked_steps: run.blockedSteps,
      failed_steps: run.failedSteps,
      started_at: run.startedAt,
      last_activity_at: run.lastActivityAt,
    })),
  }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function parseLimit(raw: string | null): number {
  if (raw === null) {
    return HOME_ACTIVE_RUNS_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new ApiError('validation_failed', `limit must be an integer between 1 and ${MAX_LIMIT}.`, {
      details: { reason: 'limit_out_of_range' },
    });
  }
  return parsed;
}

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/active-runs` -> the segment right after the
  // literal "workspaces" (mirrors the sibling projects/recent-projects routes).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
