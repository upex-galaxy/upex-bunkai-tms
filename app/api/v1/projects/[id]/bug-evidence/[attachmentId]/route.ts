import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { discardOwnBugEvidence, extractBugEvidenceIds } from '@lib/bugs/evidence-upload';
import { isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// DELETE /api/v1/projects/{id}/bug-evidence/{attachmentId} - discard an image upload that was
// never filed (BK-594). Bearer `atc:write`. Only the uploader, and never once a defect claimed
// it: evidence on a filed defect is frozen (409). The stored object is deleted on a best
// effort basis; the cleanup outbox retries it. Answers 204 with no body.
export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { projectId, attachmentId } = extractBugEvidenceIds(new URL(request.url).pathname);
  if (!isUuid(projectId) || !isUuid(attachmentId)) {
    throw new ApiError('bad_request', 'Project id and attachment id must be UUIDs.');
  }

  const { principal, db } = getAuth(ctx);
  await discardOwnBugEvidence({ db, admin: createAdminClient(), userId: principal.userId }, { projectId, attachmentId });
  return new Response(null, { status: 204 });
}, { auth: 'required', requires: ['atc:write'] });
