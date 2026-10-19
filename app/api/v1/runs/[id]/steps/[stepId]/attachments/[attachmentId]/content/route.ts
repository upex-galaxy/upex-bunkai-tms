import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { resolveAttachmentContentUrl } from '@lib/runs/attachment-access';
import { extractAttachmentIds, isUuid } from '@lib/runs/attachment-validation';
import { createAdminClient } from '@lib/supabase/admin';

// GET /api/v1/runs/{id}/steps/{stepId}/attachments/{attachmentId}/content - open an evidence image
// (BK-593). Bearer `atc:read` (or a cookie session). There is no anonymous read path: access is
// checked with the CALLER's RLS-scoped client (a committed row of one of their workspaces), and
// only then does the service role mint a signed URL valid for 60 seconds. The answer is a 302 to
// that URL (the image can be up to 10 MiB, over the 4.5 MB Vercel response cap, so the bytes are
// never proxied). A missing, foreign or still-pending attachment is the same 404. The URL is a
// bearer secret: it is never logged here and the response is never cached.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { runId, stepId, attachmentId } = extractAttachmentIds(new URL(request.url).pathname);
  if (!isUuid(runId) || !isUuid(stepId) || !isUuid(attachmentId)) {
    throw new ApiError('bad_request', 'Run id, step id and attachment id must be UUIDs.');
  }

  const { principal, db } = getAuth(ctx);
  const location = await resolveAttachmentContentUrl(
    { db, admin: createAdminClient(), userId: principal.userId },
    { runId, stepId, attachmentId },
  );
  return new Response(null, {
    status: 302,
    headers: {
      'Location': location,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}, { auth: 'required', requires: ['atc:read'] });
