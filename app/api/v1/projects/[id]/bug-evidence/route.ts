import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { BugEvidenceInitBodySchema, extractBugEvidenceIds, startBugEvidenceUpload } from '@lib/bugs/evidence-upload';
import { isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// POST /api/v1/projects/{id}/bug-evidence - start an image upload for a defect that is being
// filed (BK-594). Bearer `atc:write` (filing a defect is `atc:write`; a standalone defect has
// no Run, so `run:execute` would be the wrong gate). Step 1 of 3 (init -> direct PUT to
// Storage -> commit), the BK-593 shape: the SECURITY DEFINER RPC authorizes (member+), caps the
// draft (10 items, 50 MiB) and inserts a `pending` row owned by the caller; this handler signs
// a Storage upload URL for a server-chosen path. `Idempotency-Key` is REQUIRED. The RPC reads
// auth.uid(), so it runs through the caller's own RLS-scoped client (`db`).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { projectId } = extractBugEvidenceIds(new URL(request.url).pathname);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = BugEvidenceInitBodySchema.parse(payload);

  const result = await startBugEvidenceUpload(
    {
      db,
      admin: createAdminClient(),
      userId: principal.userId,
      idempotency: { begin: beginIdempotentRequest, record: recordIdempotencyResult, discard: discardIdempotencyResult },
    },
    { headers: request.headers, projectId, body },
  );
  return jsonResponse(result.body, { status: result.status });
}, { auth: 'required', requires: ['atc:write'] });
