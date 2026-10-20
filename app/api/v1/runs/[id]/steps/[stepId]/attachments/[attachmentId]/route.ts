import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { deleteAttachment } from '@lib/runs/attachment-access';
import { extractAttachmentIds, isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// DELETE /api/v1/runs/{id}/steps/{stepId}/attachments/{attachmentId} - remove an evidence image
// (BK-593). Bearer `run:execute` (or a cookie session). Only the person who attached it may
// remove it, only while the Run is `running` (a finished or aborted Run keeps all its evidence);
// the SECURITY DEFINER RPC decides both under the Run row lock, so a removal racing finish or
// abort has exactly one winner. The stored object is deleted on a best-effort basis; the
// cleanup outbox retries it. Answers 204 with no body.
export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { runId, stepId, attachmentId } = extractAttachmentIds(new URL(request.url).pathname);
  if (!isUuid(runId) || !isUuid(stepId) || !isUuid(attachmentId)) {
    throw new ApiError('bad_request', 'Run id, step id and attachment id must be UUIDs.');
  }

  const { principal, db } = getAuth(ctx);
  await deleteAttachment({ db, admin: createAdminClient(), userId: principal.userId }, { runId, stepId, attachmentId });
  return new Response(null, { status: 204 });
}, { auth: 'required', requires: ['run:execute'] });
