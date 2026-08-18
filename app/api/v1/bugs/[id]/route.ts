import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { throwBugNotFound } from '@lib/bugs/errors';
import { getBugJson } from '@lib/supabase/rpc';

// GET /api/v1/bugs/{id} — a single defect's full composed record (BK-337).
// Read auth only, no scope requirement — mirrors the report/traceability
// routes: any active workspace role, viewers included, may read (E-4 ratifies
// this as an assertion of shipped behavior, not new behavior — `bugs_select_
// workspace_member`, 0046_bugs.sql, already grants SELECT to any member).
//
// `bunkai_bug_json` (0046, widened by 0070_bug_detail_composer.sql) is
// `language sql stable`, no `security definer` — it runs as the caller
// (INVOKER), so this calls it through the caller's OWN RLS-scoped client
// (`getAuth(ctx).db`), never `createAdminClient()`. It returns `null` — not
// an exception — both when the bug does not exist AND when RLS hides it from
// this caller (Scenario E-1's non-disclosure boundary, the same shape `lib/
// bugs/errors.ts`'s P0002/'bug' case already gives the sibling /assign and
// /status routes): both collapse into the SAME `throwBugNotFound()` 404.
//
// A malformed (non-UUID) id is rejected as 400 by the `isUuid` guard below,
// computed from the string alone with no DB round trip — matches every
// sibling route (`[id]/status/route.ts:58-61`, `[id]/assign/route.ts`)
// (Scenario E-2).
// Pure/DB-parametrized — split out so it is directly unit-testable with a
// fake `db` that mocks `.rpc()`, mirroring the sibling `/assign` and
// `/status` routes' `performBugAssign`/`performBugStatusTransition`. The
// composer's own RLS-scoping behavior is proven against a real database in
// `lib/bugs/detail-isolation.test.ts`, not here.
export async function performBugDetailRead(db: SupabaseClient<Database>, bugId: string) {
  const { data, error } = await getBugJson(db, bugId);
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throwBugNotFound();
  }
  return data;
}

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const bugId = extractBugId(request);
  if (!isUuid(bugId)) {
    throw new ApiError('bad_request', 'Bug id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const bug = await performBugDetailRead(db, bugId);

  return jsonResponse({ bug }, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-499 pending — reporting reads.',
});

// The route is /api/v1/bugs/{id} — the bug id is the last segment.
function extractBugId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
