import type { Principal } from '@lib/api/principal';
import { ApiError } from '@lib/api/error-envelope';
import { assertWorkspaceContext } from '@lib/api/principal';
import { throwIfProjectReadOnly } from '@lib/api/project-read-only';
import { parseRepositoryUrl, REPOSITORY_URL_INVALID_MESSAGE } from '@lib/runs/ci-link';
import { loadVisibleProject } from '@lib/tracker-settings/access';

type Db = Principal['db'];

export const REPOSITORY_ADMIN_REQUIRED = 'Only a workspace owner or admin can change the repository URL.';

export interface RepositorySettingsShape {
  repository_url: string | null
  updated_at: string | null
}

export async function readRepositorySettings(db: Db, projectId: string): Promise<RepositorySettingsShape> {
  const { data, error } = await db
    .from('project_repository_settings')
    .select('repository_url, updated_at')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'The repository settings could not be loaded.');
  }
  return { repository_url: data?.repository_url ?? null, updated_at: data?.updated_at ?? null };
}

export async function readRepositoryUrl(db: Db, projectId: string): Promise<string | null> {
  const { data } = await db
    .from('project_repository_settings')
    .select('repository_url')
    .eq('project_id', projectId)
    .maybeSingle();
  return data?.repository_url ?? null;
}

export async function assertCanAdministerRepository(args: { db: Db, principal: Principal, projectId: string }): Promise<{ id: string, workspaceId: string }> {
  const project = await loadVisibleProject(args.db, args.projectId);
  assertWorkspaceContext(args.principal, project.workspaceId);
  const { data, error } = await args.db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', project.workspaceId)
    .eq('user_id', args.principal.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'The workspace role could not be read.');
  }
  if (!data || !['owner', 'admin'].includes(data.role)) {
    throw new ApiError('forbidden', REPOSITORY_ADMIN_REQUIRED, { details: { reason: 'admin_required' } });
  }
  return project;
}

export function parseRepositorySettingsBody(payload: unknown): { repository_url: string | null } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || !('repository_url' in payload)) {
    throw new ApiError('validation_failed', 'repository_url is required (a URL, or null to clear it).', {
      details: { reason: 'repository_url_invalid', field: 'repository_url' },
    });
  }
  const raw = (payload as { repository_url: unknown }).repository_url;
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { repository_url: null };
  }
  if (typeof raw !== 'string') {
    throw new ApiError('validation_failed', 'repository_url must be a string or null.', {
      details: { reason: 'repository_url_invalid', field: 'repository_url' },
    });
  }
  const parsed = parseRepositoryUrl(raw);
  if (!parsed.ok) {
    throw new ApiError('validation_failed', parsed.message, {
      details: { reason: 'repository_url_invalid', field: 'repository_url' },
    });
  }
  return { repository_url: parsed.value };
}

export function mapRepositorySettingsRpcError(error: { code?: string, message: string }): never {
  throwIfProjectReadOnly(error);
  if (error.code === 'P0002') {
    throw new ApiError('not_found', 'Project not found.', { details: { reason: 'not_found' } });
  }
  if (error.code === '42501' && error.message === 'forbidden') {
    throw new ApiError('forbidden', REPOSITORY_ADMIN_REQUIRED, { details: { reason: 'admin_required' } });
  }
  if (error.code === '45241') {
    throw new ApiError('validation_failed', REPOSITORY_URL_INVALID_MESSAGE, {
      details: { reason: 'repository_url_invalid', field: 'repository_url' },
    });
  }
  console.error('bunkai_set_project_repository_url RPC failed', { code: error.code, message: error.message });
  throw new ApiError('internal_error', 'The repository settings could not be saved.');
}
