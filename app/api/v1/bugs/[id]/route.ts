import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapBugRpcError, throwBugNotFound } from '@lib/bugs/errors';
import { assertBugTokenWorkspace } from '@lib/bugs/token-workspace';
import { BugCorrectionBodySchema } from '@lib/bugs/validation';
import { correctBug, getBugJson } from '@lib/supabase/rpc';

// GET /api/v1/bugs/{id} — a single defect's full composed record (BK-337).
// Read auth requiring `atc:read` (BK-499) — mirrors the report/traceability
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
}, { auth: 'required', requires: ['atc:read'] });

// BK-1835 — PATCH /api/v1/bugs/{id}: correct a filed defect's title,
// severity, description and reproduction steps. Bearer `atc:write` (or a
// cookie session), the same capability as the sibling /assign and /status
// routes. `bunkai_correct_bug` (migration 0129) has no actor parameter and is
// granted to `authenticated` only, so it runs through the caller's OWN client.
//
// A stale save (45314) is answered with 409 and the CURRENT defect in
// `details.current`, read under the caller's own RLS right after the refusal,
// so the form can show what changed (AI Product Owner P8). Every other RPC
// error maps through `mapBugRpcError` (404 non-member or missing, 403 Viewer,
// 422 title/severity backstops).
export interface BugCorrectionArgs {
  bugId: string
  expectedVersion: number
  title?: string
  severity?: string
  description?: string
  stepsToReproduce?: string
}

export async function performBugCorrection(db: SupabaseClient<Database>, args: BugCorrectionArgs) {
  const { data, error } = await correctBug(db, args);
  if (error) {
    if (error.code === '45314') {
      const { data: current } = await getBugJson(db, args.bugId);
      throw new ApiError('conflict', 'This defect changed since you opened it. Review the current version before saving again.', {
        details: { reason: 'bug_changed', current: current ?? null },
      });
    }
    if (error.code === '42501') {
      throw new ApiError('forbidden', 'Correcting a defect requires the member role or higher.', {
        details: { reason: 'forbidden_role' },
      });
    }
    mapBugRpcError(error, { notFoundEntity: 'bug' });
  }
  return data as unknown as { bug: unknown, changed: boolean };
}

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const bugId = extractBugId(request);
  if (!isUuid(bugId)) {
    throw new ApiError('bad_request', 'Bug id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = BugCorrectionBodySchema.parse(payload);
  await assertBugTokenWorkspace(principal, bugId);

  const result = await performBugCorrection(db, {
    bugId,
    expectedVersion: body.expected_version,
    title: body.title,
    severity: body.severity,
    description: body.description,
    stepsToReproduce: body.steps_to_reproduce,
  });

  return jsonResponse({ bug: result.bug, changed: result.changed }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The route is /api/v1/bugs/{id} — the bug id is the last segment.
function extractBugId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
