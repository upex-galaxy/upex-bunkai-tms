import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { extractBugEvidenceIds, finishBugEvidenceUpload } from '@lib/bugs/evidence-upload';
import { isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// POST /api/v1/projects/{id}/bug-evidence/{attachmentId}/commit - finish a defect evidence
// upload (BK-594). Bearer `atc:write`. Step 3 of 3: reads what actually arrived in Storage
// (size from metadata, type from the first 64 KiB), refuses and discards anything that is not
// the declared, still PNG/JPEG/WebP image, then the commit RPC flips the row from pending to
// committed. The upload stays invisible to everybody until a filing claims it. Safe to retry.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { projectId, attachmentId } = extractBugEvidenceIds(new URL(request.url).pathname);
  if (!isUuid(projectId) || !isUuid(attachmentId)) {
    throw new ApiError('bad_request', 'Project id and attachment id must be UUIDs.');
  }

  const { principal, db } = getAuth(ctx);
  const result = await finishBugEvidenceUpload(
    { db, admin: createAdminClient(), userId: principal.userId },
    { projectId, attachmentId },
  );
  return jsonResponse(result.body, { status: result.status });
}, { auth: 'required', requires: ['atc:write'] });
