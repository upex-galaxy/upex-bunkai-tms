import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import {
  assertCanAdministerRepository,
  mapRepositorySettingsRpcError,
  parseRepositorySettingsBody,
  readRepositorySettings,
} from '@lib/repository-settings/repository-settings';
import { createAdminClient } from '@lib/supabase/admin';
import { setProjectRepositoryUrl } from '@lib/supabase/rpc';
import { assertProjectIdIsUuid, extractProjectId, loadVisibleProject } from '@lib/tracker-settings/access';

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  assertProjectIdIsUuid(projectId);

  const { db } = getAuth(ctx);
  await loadVisibleProject(db, projectId);
  const settings = await readRepositorySettings(db, projectId);

  return jsonResponse({ repository_settings: settings }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const PUT = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  assertProjectIdIsUuid(projectId);

  const { principal, db } = getAuth(ctx);
  await assertCanAdministerRepository({ db, principal, projectId });

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = parseRepositorySettingsBody(payload);

  const { data, error } = await setProjectRepositoryUrl(createAdminClient(), {
    actorUserId: principal.userId,
    projectId,
    repositoryUrl: body.repository_url,
  });
  if (error) {
    mapRepositorySettingsRpcError(error);
  }

  const saved = data as { repository_url: string | null, updated_at: string | null };
  return jsonResponse({
    repository_settings: { repository_url: saved.repository_url, updated_at: saved.updated_at },
  }, { status: 200 });
}, { auth: 'required', requires: ['workspace:admin'] });
