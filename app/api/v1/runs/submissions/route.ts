import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { executeRunSubmission } from '@lib/runs/submit-automated-run';

// POST /api/v1/runs/submissions — an automated executor reports a finished Run
// with per-step results in one call (BK-222). Bearer `run:execute` only; the
// token is the executor identity. The SECURITY DEFINER RPC holds the rulebook
// (verdict/step/environment checks, the per-workspace 24h `idempotency_key`
// window, the chain snapshot with the submitted statuses, the audit). The
// optional `idempotency_key` is a DOMAIN key in the body (ADR-0026): the shared
// `Idempotency-Key` header guard of ADR-0002 is deliberately NOT used here.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  const { status, body } = await executeRunSubmission(principal, payload);
  return jsonResponse(body, { status });
}, { auth: 'required', requires: ['run:execute'] });
