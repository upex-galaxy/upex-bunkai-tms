import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertExportAuthorized } from '@lib/workspace-export/authorize';
import { runWorkspaceExportJob } from '@lib/workspace-export/export-runner';
import { after } from 'next/server';

// POST /api/v1/workspaces/{id}/data-export — enqueue an async export of the
// workspace's data. Returns 202 with the job id; a background worker
// (Vercel after()) assembles the archive and uploads it to Storage. Owner-only,
// cookie-session-only (confirmed on BK-508 — a PAT is rejected outright,
// regardless of scope). At most one active export per workspace (serialized
// -> 409 export_in_progress).
//
// GET polls the latest export for the workspace (null when none was ever
// requested). "Expired" is never a persisted status — the client derives it by
// comparing expires_at to now().

const EXPORT_COLUMNS = 'id, status, archive_bytes, error_message, started_at, completed_at, expires_at, created_at';

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  await assertExportAuthorized({ db, userId: principal.userId, workspaceId });

  const { data, error } = await db
    .from('workspace_exports')
    .insert({ workspace_id: workspaceId, requested_by: principal.userId })
    .select('id, status')
    .single();
  if (error) {
    // The one-active-per-workspace unique index (0083) — lost the enqueue race.
    if (error.code === '23505') {
      throw new ApiError('conflict', 'An export is already being prepared for this workspace.', {
        details: { reason: 'export_in_progress' },
      });
    }
    throw new ApiError('internal_error', error.message);
  }

  // Process in the background after the 202 is flushed (Vercel Fluid Compute).
  after(async () => runWorkspaceExportJob(data.id));

  return jsonResponse({ export_job_id: data.id, status: data.status }, { status: 202 });
}, { auth: 'cookie-only', why: 'Workspace data export is available to the Owner via a browser session only.' });

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  await assertExportAuthorized({ db, userId: principal.userId, workspaceId });

  const { data, error } = await db
    .from('workspace_exports')
    .select(EXPORT_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ export: data ?? null }, { status: 200 });
}, { auth: 'cookie-only', why: 'Workspace data export is available to the Owner via a browser session only.' });

function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
