import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { readVersionPrecondition } from '@lib/atcs/optimistic-lock';
import { createAdminClient } from '@lib/supabase/admin';
import { getTestExpanded, reorderTestSteps } from '@lib/supabase/rpc';
import { mapTestReorderError, mapTestRpcError } from '@lib/tests/errors';
import { chainDiff, reorderStructuralError, TestReorderBodySchema } from '@lib/tests/validation';

// PATCH /api/v1/tests/{id}/reorder — reorder the ATC chain inside a Test (BK-28).
// The body is the COMPLETE new order as `step_ids` (test_steps.id), a permutation
// of the Test's existing steps — never a diff, never atc_ids (a chain may repeat
// an atc_id, so step_id is the only stable handle). One SECURITY DEFINER RPC
// (`bunkai_reorder_test_steps`) enforces the write gate, set equality, optimistic
// lock, no-op detection, and the atomic position rewrite + `test.reordered`
// event. Optimistic locking via `X-If-Match: <version>` (lenient — absent header
// skips the guard; 409 on mismatch). Auth: Bearer `atc:write` (or cookie).

interface ReorderTestShape {
  version: number
  atcs: { step_id: string, id: string }[]
}

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
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
  const body = TestReorderBodySchema.parse(parsed);

  // Structural rules surface as the domain `chain_invalid` (422), not the generic
  // validation_failed: empty chain or duplicate step references.
  const structural = reorderStructuralError(body.step_ids);
  if (structural) {
    throw new ApiError('chain_invalid', structural === 'empty'
      ? 'The chain must include at least one ATC.'
      : 'The chain must not contain duplicate references.', {
      details: { reason: 'chain_invalid', kind: structural },
    });
  }

  // Optimistic lock. The token rides `X-If-Match` (custom header) so the Vercel
  // edge does not intercept it as an RFC 7232 precondition (BK-96).
  const precondition = readVersionPrecondition(request.headers);
  if (!precondition.ok) {
    throw new ApiError('bad_request', 'X-If-Match must be a decimal integer version.');
  }
  const ifMatch = precondition.version;

  const supabase = createAdminClient();

  // Fetch the current chain (read-membership gated; P0002 → 404) to compute the
  // friendly missing/extra detail for a 422 chain_mismatch before mutating.
  const current = await getTestExpanded(supabase, { actorUserId: principal.userId, testId });
  if (current.error) {
    mapTestRpcError(current.error);
  }
  const currentTest = current.data as unknown as ReorderTestShape;
  const currentStepIds = currentTest.atcs.map(atc => atc.step_id);

  const diff = chainDiff(currentStepIds, body.step_ids);
  if (diff.missing.length > 0 || diff.extra.length > 0) {
    throw new ApiError('chain_mismatch', 'The submitted chain does not match the Test\'s ATCs.', {
      details: { reason: 'chain_mismatch', missing: diff.missing, extra: diff.extra },
    });
  }

  const { data, error } = await reorderTestSteps(supabase, {
    actorUserId: principal.userId,
    testId,
    ifMatch,
    stepIds: body.step_ids,
  });
  if (error) {
    // On a version conflict, re-read the live chain so the 409 body reflects the
    // TRUE current order (the conflicting writer's), per the AC.
    if (error.code === '45125') {
      const fresh = await getTestExpanded(supabase, { actorUserId: principal.userId, testId });
      const freshTest = fresh.error ? null : (fresh.data as unknown as ReorderTestShape);
      // The RPC embeds the live version in the message (`version_conflict:<n>`);
      // use it as a fallback for current_version when the re-fetch itself fails.
      const messageVersion = /version_conflict:(\d+)/.exec(error.message ?? '');
      throw new ApiError('conflict', 'The Test was reordered by another request.', {
        details: {
          reason: 'version_conflict',
          ...(freshTest
            ? { current_version: freshTest.version, current_chain: freshTest.atcs.map(atc => atc.id) }
            : (messageVersion ? { current_version: Number(messageVersion[1]) } : {})),
        },
      });
    }
    mapTestReorderError(error);
  }

  return jsonResponse({ test: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

function extractTestId(request: NextRequest): string {
  // Path ends in `/{id}/reorder`, so the id is the second-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
