import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapBugRpcError } from '@lib/bugs/errors';
import { BugStatusTransitionBodySchema } from '@lib/bugs/validation';
import { transitionBugStatus } from '@lib/supabase/rpc';

// POST /api/v1/bugs/{id}/status — advance a bug's status one lifecycle stage
// at a time (open -> in_progress -> resolved -> closed, never backward, never
// skipping a stage) (BK-264 Slice 2). Bearer `atc:write` (or a cookie
// session) — same capability reuse as the sibling /assign route and the
// original POST /api/v1/bugs (Technical Decision 13).
//
// `bunkai_transition_bug_status` (migration 0054_bug_assignment_status.sql)
// carries NO explicit actor parameter — same auth.uid()-direct,
// `authenticated`-only-grant shape as `bunkai_assign_bug`. This route
// therefore calls it through the caller's OWN RLS-scoped client
// (`getAuth(ctx).db`), never `createAdminClient()` — see the sibling
// `[id]/assign/route.ts`'s header comment for the full rationale (same
// migration, same authorization shape).
//
// The non-disclosure boundary from Slice 1 is preserved exactly: P0002 maps
// to a single generic 404 via `mapBugRpcError(error, { notFoundEntity: 'bug'
// })`. The two adjacency-violation codes get their OWN distinct, actionable
// messages (skip vs. backward) rather than being collapsed into one generic
// "invalid transition" — see `lib/bugs/errors.ts`'s 45310/45311 cases.

// Pure/DB-parametrized — same isolation style as `performBugAssign` in the
// sibling /assign route. DB-level adjacency/authorization/audit-log behavior
// is already proven against a real database in Slice 1's
// `lib/bugs/transition-bug-status-isolation.test.ts`.
export async function performBugStatusTransition(
  db: SupabaseClient<Database>,
  args: { bugId: string, newStatus: string },
) {
  const { data, error } = await transitionBugStatus(db, args);
  if (error) {
    mapBugRpcError(error, { notFoundEntity: 'bug' });
  }
  return data;
}

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const bugId = extractBugId(request);
  if (!isUuid(bugId)) {
    throw new ApiError('bad_request', 'Bug id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = BugStatusTransitionBodySchema.parse(payload);

  const bug = await performBugStatusTransition(db, { bugId, newStatus: body.status });

  return jsonResponse({ bug }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The route is /api/v1/bugs/{id}/status — the bug id is the second-to-last
// segment (mirrors runs/[id]/abort/route.ts's own extraction).
function extractBugId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
