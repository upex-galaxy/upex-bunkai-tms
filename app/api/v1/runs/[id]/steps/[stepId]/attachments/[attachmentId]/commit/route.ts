import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { finishAttachmentUpload } from '@lib/runs/attachment-upload';
import { extractAttachmentIds, isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// POST /api/v1/runs/{id}/steps/{stepId}/attachments/{attachmentId}/commit - finish an evidence
// upload (BK-593). Bearer `run:execute` (or a cookie session). Step 3 of 3: reads what actually
// arrived in Storage (size from the object's metadata, type from its first 64 KiB), refuses
// anything that is not the declared, still PNG/JPEG/WebP image (and discards it), then the
// SECURITY DEFINER commit RPC locks the Run again and flips the row from pending to committed.
// Nothing is visible before this call succeeds, and nothing commits after the Run closed.
// Always safe to retry: an already committed attachment answers with the same body.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { runId, stepId, attachmentId } = extractAttachmentIds(new URL(request.url).pathname);
  if (!isUuid(runId) || !isUuid(stepId) || !isUuid(attachmentId)) {
    throw new ApiError('bad_request', 'Run id, step id and attachment id must be UUIDs.');
  }

  const { principal, db } = getAuth(ctx);
  const result = await finishAttachmentUpload(
    { db, admin: createAdminClient(), userId: principal.userId },
    { runId, stepId, attachmentId },
  );
  return jsonResponse(result.body, { status: result.status });
}, { auth: 'required', requires: ['run:execute'] });
