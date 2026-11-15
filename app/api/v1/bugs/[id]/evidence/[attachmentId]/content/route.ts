import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { extractBugEvidenceIds, resolveBugEvidenceContentUrl } from '@lib/bugs/evidence-upload';
import { isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// GET /api/v1/bugs/{id}/evidence/{attachmentId}/content - open an image filed as defect
// evidence (BK-594). Bearer `atc:read` (or a cookie session); every member of the owning
// Workspace, viewers included. Access is checked with the CALLER's RLS-scoped client (a claimed
// row of this defect in one of their live Workspaces); only then does the service role mint a
// signed URL valid for 60 seconds. 302 to that URL, never proxied, never cached, never logged.
// Missing, foreign, unclaimed and soft-deleted-Workspace evidence are the same 404.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { bugId, attachmentId } = extractBugEvidenceIds(new URL(request.url).pathname);
  if (!isUuid(bugId) || !isUuid(attachmentId)) {
    throw new ApiError('bad_request', 'Bug id and attachment id must be UUIDs.');
  }

  const { db } = getAuth(ctx);
  const location = await resolveBugEvidenceContentUrl({ db, admin: createAdminClient() }, { bugId, attachmentId });
  return new Response(null, {
    status: 302,
    headers: {
      'Location': location,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}, { auth: 'required', requires: ['atc:read'] });
