import type { RunComparison } from '@lib/runs/compare-view';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { logRequest } from '@lib/api/logging';
import { COMPARE_LOAD_ERROR, parseRunComparison } from '@lib/runs/compare-view';
import { mapRunRpcError } from '@lib/runs/errors';
import { compareRun } from '@lib/supabase/rpc';

// BK-442 — the DB-parametrized core of GET /api/v1/runs/{id}/compare, split out of
// `route.ts` so the error mapping and the payload check are unit-testable without
// mocking `withApiHandler` or a live NextRequest (the `activity/response.ts`
// convention).

export interface CompareLogContext {
  requestId: string
  method: string
  path: string
}

// Fixed client text for every failure that is not a "not found". The database's own
// message can name tables, functions and columns, so it goes to the server log with
// its SQLSTATE and never to the caller.
export const COMPARE_FAILURE_MESSAGE = COMPARE_LOAD_ERROR;

export function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

// The Run id is the segment BEFORE `compare` in `/api/v1/runs/{id}/compare`.
export function extractCompareRunId(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

// Reads the comparison on the CALLER's own RLS-scoped client (`db` from
// `getAuth(ctx)`). `bunkai_compare_run` is SECURITY INVOKER with no identity
// parameter, so RLS is its only authorization; it also refuses a caller with no
// `auth.uid()` (the admin client) with the same P0002 as a missing Run.
//
//   * P0002 (missing, foreign, non-member, soft-deleted workspace, no session)
//     -> the one 404 `GET /runs/{id}` gives, via the shared Run error mapper.
//   * any other database error -> logged server-side as `{code, message}` and
//     answered with fixed text. An unmapped error is never echoed to the client.
//   * a payload that is not one of the four documented states is a failed load.
export async function fetchRunComparison(
  db: SupabaseClient<Database>,
  runId: string,
  log: CompareLogContext,
): Promise<RunComparison> {
  const { data, error } = await compareRun(db, { runId });

  if (error) {
    if (error.code === 'P0002') {
      mapRunRpcError(error);
    }
    logRequest('error', {
      request_id: log.requestId,
      method: log.method,
      path: log.path,
      error_code: error.code,
      message: error.message,
    });
    throw new ApiError('internal_error', COMPARE_FAILURE_MESSAGE);
  }

  const comparison = parseRunComparison(data);
  if (comparison === null) {
    logRequest('error', {
      request_id: log.requestId,
      method: log.method,
      path: log.path,
      error_code: 'compare_payload_invalid',
      message: 'bunkai_compare_run returned a payload that is not one of the four documented states.',
    });
    throw new ApiError('internal_error', COMPARE_FAILURE_MESSAGE);
  }
  return comparison;
}
