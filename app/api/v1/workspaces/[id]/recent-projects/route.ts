import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { HOME_RECENT_PROJECTS_LIMIT } from '@lib/home/constants';
import { listRecentProjects } from '@lib/home/recent-projects';

// GET /api/v1/workspaces/{id}/recent-projects — the workspace's projects
// ordered by most recent activity, each with its module count, ATC count and
// last-activity time (BK-257).
//
// This exists so the Home widget's numbers are verifiable by API rather than
// only by eye: the route and the Home server component call the SAME
// `listRecentProjects`, so what QA reads here is byte-for-byte what the screen
// renders. What "activity" means, and why it is composed from the entity tables
// instead of `activity_log`, is documented on that function.
//
//   ?limit=<1..20>  optional, default 5 (the widget's page size). Out of range
//                   is rejected — never silently clamped, so a caller asking
//                   for 500 finds out rather than quietly getting 20.
//
// Auth: cookie session or Bearer PAT holding `atc:read`. Not a
// `workspace:admin` operation — this is a member read, so it deliberately does
// NOT call `assertWorkspaceContext` (ADR-0006 binds a PAT to its own workspace
// for admin operations only). But it is not ungated either: every row carries an
// exact per-project ATC count, which is derived ATC data, and the two sibling
// endpoints that read ATC data (`/api/v1/atcs/search`, `/api/v1/atcs/{id}/usage`)
// both require `atc:read`. Without it the narrowest possible token — a CI runner
// scoped to `run:execute` — could enumerate project inventory across every
// workspace its issuing user belongs to. Cookie sessions hold the full
// capability set (`ALL_CAPABILITIES`), so this constrains PATs only.
//
// Non-disclosure: a foreign, nonexistent, or lost-membership workspace id
// collapses into the SAME `200 {"projects": []}` an empty workspace returns.
// Every read runs through the caller's own RLS-scoped client (`getAuth(ctx).db`,
// never `createAdminClient()`), so the isolation is Postgres's, not this
// handler's — a forged path segment selects nothing.

const MAX_LIMIT = 20;

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  const { db } = getAuth(ctx);

  const result = await listRecentProjects(db, { workspaceId, limit });
  // A failed read must never leave here as `{"projects": []}` — that is the
  // answer for a workspace with no projects, and a client cannot tell the two
  // apart afterwards.
  if (!result.ok) {
    throw new ApiError('internal_error', 'The workspace\'s recent projects could not be read.');
  }

  return jsonResponse({
    projects: result.projects.map(project => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      module_count: project.moduleCount,
      atc_count: project.atcCount,
      last_activity_at: project.lastActivityAt,
    })),
  }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function parseLimit(raw: string | null): number {
  if (raw === null) {
    return HOME_RECENT_PROJECTS_LIMIT;
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
  // `/api/v1/workspaces/{id}/recent-projects` -> the segment right after the
  // literal "workspaces" (mirrors the sibling projects/notifications routes).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
