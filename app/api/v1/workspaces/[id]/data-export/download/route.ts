import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { EXPORT_STORAGE_BUCKET } from '@lib/workspace-export/constants';

// GET /api/v1/workspaces/{id}/data-export/download — stream the ready archive.
// Owner-only, cookie-session-only. Authorization + freshness + the
// export.downloaded audit write all happen atomically inside
// bunkai_resolve_workspace_export_download (0083) — this route never trusts a
// stale check of its own, and never hands out a signed URL.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { db } = getAuth(ctx);
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { data, error } = await db.rpc('bunkai_resolve_workspace_export_download', { p_workspace_id: workspaceId });
  if (error) {
    if (error.code === '42501') {
      throw new ApiError('forbidden', 'Only the workspace Owner can download a data export.');
    }
    if (error.code === '45801') {
      throw new ApiError('not_found', 'No export has been requested for this workspace.', { details: { reason: 'export_none' } });
    }
    if (error.code === '45802') {
      throw new ApiError('not_found', 'The export is not ready yet.', { details: { reason: 'export_not_ready' } });
    }
    if (error.code === '45803') {
      throw new ApiError('not_found', 'The export archive has expired. Request a fresh export.', { details: { reason: 'export_expired' } });
    }
    throw new ApiError('internal_error', error.message);
  }

  const resolved = data as { export_id: string, archive_path: string };
  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from(EXPORT_STORAGE_BUCKET)
    .download(resolved.archive_path);
  if (downloadError || !blob) {
    throw new ApiError('internal_error', downloadError?.message ?? 'Could not read the export archive.');
  }

  const filename = `workspace-export-${workspaceId}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}, { auth: 'cookie-only', why: 'Workspace data export is available to the Owner via a browser session only.' });

function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
