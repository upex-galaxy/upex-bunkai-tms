import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { listRunAttachments } from '@lib/runs/attachment-access';
import { extractAttachmentIds, isUuid } from '@lib/runs/attachment-validation';

// GET /api/v1/runs/{id}/attachments - every committed evidence image of a Run, oldest first, for
// all its steps (BK-593). Bearer `atc:read` (or a cookie session). A plain RLS read through the
// caller's own client: workspace members of any role see committed rows, nobody sees a pending
// one. Metadata only: no storage path and no URL (open an image through its /content route).
// `bunkai_run_json` is deliberately untouched, so abort, finish, mark and compare never change.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { runId } = extractAttachmentIds(new URL(request.url).pathname);
  if (!isUuid(runId)) {
    throw new ApiError('bad_request', 'Run id must be a UUID.');
  }

  const { db } = getAuth(ctx);
  return jsonResponse(await listRunAttachments(db, runId));
}, { auth: 'required', requires: ['atc:read'] });
