import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createClient } from '@lib/supabase/server';

// GET /api/v1/imports/{id} — poll an import job: status (queued | running |
// completed | failed) plus per-run counts and the per-issue errors[]. Member-only
// via the import_jobs SELECT policy; an outsider reads as 404 (RLS hides the row).

const JOB_COLUMNS = 'id, workspace_id, project_id, jql, status, imported_count, created_count, updated_count, skipped_count, errors, started_at, completed_at, created_at';

export const GET = withApiHandler(async (request: NextRequest) => {
  const id = extractId(request);
  if (!isUuid(id)) {
    throw new ApiError('bad_request', 'Import id must be a UUID.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const { data, error } = await supabase
    .from('import_jobs')
    .select(JOB_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Import job not found.');
  }

  return jsonResponse({ import_job: data }, { status: 200 });
});

function extractId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
