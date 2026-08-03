import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapBugRpcError } from '@lib/bugs/errors';
import { BugAssignBodySchema } from '@lib/bugs/validation';
import { assignBug } from '@lib/supabase/rpc';

// POST /api/v1/bugs/{id}/assign — assign, reassign, or unassign a bug
// (BK-264 Slice 2). Bearer `atc:write` (or a cookie session) — reuses the
// existing capability rather than inventing a new `bug:*` scope, same call
// `POST /api/v1/bugs` already made (Technical Decision 13, app/api/v1/bugs/
// route.ts's own header).
//
// `bunkai_assign_bug` (migration 0054_bug_assignment_status.sql) carries NO
// explicit actor parameter — it reads auth.uid() directly and is GRANTED TO
// `authenticated` ONLY (no `service_role` grant, by design — see the
// migration's own header). This route therefore calls it through the
// caller's OWN RLS-scoped client (`getAuth(ctx).db`), never
// `createAdminClient()` — an admin/service-role client has no authenticated
// auth.uid() and holds no EXECUTE grant on this function at all, so it would
// never work correctly here (same client-choice rule `bunkai_list_bugs`
// already established for this domain — see `listBugs`'s own comment in
// `lib/supabase/rpc.ts`).
//
// The non-disclosure boundary from Slice 1 is preserved exactly: P0002 (a
// missing bug OR a bug in a workspace the caller isn't even a member of)
// maps to a single generic 404 via `mapBugRpcError(error, { notFoundEntity:
// 'bug' })` — never a distinct "not a member" message that would leak
// workspace-membership existence to a non-member.

// Pure/DB-parametrized — the RPC call + error mapping, split out so it is
// directly unit-testable with a fake `db` (mocking `.rpc()`), mirroring
// `app/api/v1/bugs/route.ts`'s own extracted-pure-helper style. No live
// NextRequest/ctx harness exists in this repo (see that file's own
// route.test.ts header) — the DB-level authorization/adjacency proof already
// happened against a real database in Slice 1
// (`lib/bugs/assign-bug-isolation.test.ts`).
export async function performBugAssign(
  db: SupabaseClient<Database>,
  args: { bugId: string, assigneeUserId: string | null },
) {
  const { data, error } = await assignBug(db, args);
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
  const body = BugAssignBodySchema.parse(payload);

  const bug = await performBugAssign(db, { bugId, assigneeUserId: body.assignee_user_id });

  return jsonResponse({ bug }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The route is /api/v1/bugs/{id}/assign — the bug id is the second-to-last
// segment (mirrors runs/[id]/abort/route.ts's own extraction).
function extractBugId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
