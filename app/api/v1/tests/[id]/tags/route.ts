import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { readVersionPrecondition } from '@lib/atcs/optimistic-lock';
import { createAdminClient } from '@lib/supabase/admin';
import { getTestExpanded, setTestTags } from '@lib/supabase/rpc';
import { mapTestTagsError } from '@lib/tests/errors';
import { TestTagsBodySchema } from '@lib/tests/validation';

// PUT /api/v1/tests/{id}/tags — replace the WHOLE tag set on a Test (BK-33).
// PUT (not PATCH) because the semantics are "replace the entire set" — assigning
// tags overwrites; an empty array clears all tags. One SECURITY DEFINER RPC
// (`bunkai_set_test_tags`) normalizes (trim, reserved-lowercase, dedupe),
// enforces the write gate, shape rules, and the optimistic lock under FOR
// UPDATE, with no-op detection (unchanged set → no version bump, no event).
// Optimistic locking via `X-If-Match: <version>` (lenient — absent header skips
// the guard; 409 on mismatch, with the live `current_version`). Auth: Bearer
// `atc:write` (or cookie). Returns the composed Test json (now carrying `tags`).

interface TaggedTestShape {
  version: number
  tags: string[]
}

export const PUT = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  if (!isUuid(testId)) {
    throw new ApiError('bad_request', 'Test id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const raw = (await request.text()).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw === '' ? '{}' : raw);
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const body = TestTagsBodySchema.parse(parsed);

  // Optimistic lock. The token rides `X-If-Match` (custom header) so the Vercel
  // edge does not intercept it as an RFC 7232 precondition (BK-96).
  const precondition = readVersionPrecondition(request.headers);
  if (!precondition.ok) {
    throw new ApiError('bad_request', 'X-If-Match must be a decimal integer version.');
  }
  const ifMatch = precondition.version;

  const supabase = createAdminClient();

  const { data, error } = await setTestTags(supabase, {
    actorUserId: principal.userId,
    testId,
    ifMatch,
    tags: body.tags,
  });
  if (error) {
    // On a version conflict, re-read the live Test so the 409 body reflects the
    // TRUE current version + tags (the conflicting writer's), per the AC.
    if (error.code === '45125') {
      const fresh = await getTestExpanded(supabase, { actorUserId: principal.userId, testId });
      const freshTest = fresh.error ? null : (fresh.data as unknown as TaggedTestShape);
      const messageVersion = /version_conflict:(\d+)/.exec(error.message ?? '');
      throw new ApiError('conflict', 'The Test was changed by another request.', {
        details: {
          reason: 'version_conflict',
          ...(freshTest
            ? { current_version: freshTest.version, current_tags: freshTest.tags }
            : (messageVersion ? { current_version: Number(messageVersion[1]) } : {})),
        },
      });
    }
    mapTestTagsError(error);
  }

  return jsonResponse({ test: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

function extractTestId(request: NextRequest): string {
  // Path ends in `/{id}/tags`, so the id is the second-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
