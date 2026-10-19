import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { startAttachmentUpload } from '@lib/runs/attachment-upload';
import { AttachmentInitBodySchema, extractAttachmentIds, isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// POST /api/v1/runs/{id}/steps/{stepId}/attachments - start an evidence upload (BK-593).
// Bearer `run:execute` (or a cookie session). Step 1 of 3 (init -> direct PUT to Storage ->
// commit): the SECURITY DEFINER RPC authorizes the caller (member+, Run running), locks the
// Run, checks the quotas and inserts a `pending` row; this handler then signs a Storage upload
// URL for a server-chosen path. The bytes never cross this function (Vercel's 4.5 MB cap).
// `Idempotency-Key` is REQUIRED: a retry with the same key and payload returns the same
// answer and creates no second row. The RPC reads auth.uid(), so it runs through the caller's
// own RLS-scoped client (`db`); the service-role client only signs the Storage URL.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { runId, stepId } = extractAttachmentIds(new URL(request.url).pathname);
  if (!isUuid(runId) || !isUuid(stepId)) {
    throw new ApiError('bad_request', 'Run id and step id must be UUIDs.');
  }

  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = AttachmentInitBodySchema.parse(payload);

  const result = await startAttachmentUpload(
    {
      db,
      admin: createAdminClient(),
      userId: principal.userId,
      idempotency: { begin: beginIdempotentRequest, record: recordIdempotencyResult, discard: discardIdempotencyResult },
    },
    { headers: request.headers, runId, stepId, body },
  );
  return jsonResponse(result.body, { status: result.status });
}, { auth: 'required', requires: ['run:execute'] });
