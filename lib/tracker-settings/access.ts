import type { Principal } from '@lib/api/principal';
import { ApiError } from '@lib/api/error-envelope';
import { assertWorkspaceContext } from '@lib/api/principal';
import { DEFAULT_ISSUE_TYPE, TRACKER_SETTINGS_MESSAGES } from './validation';

// BK-371 — the gates and the public shape shared by the three tracker-settings
// routes. Everything here reads through the CALLER's client (`principal.db`), so
// row-level security decides what the caller may see; nothing here touches the
// admin client.

type Db = Principal['db'];

export interface TrackerSettingsShape {
  destination_project_key: string | null
  issue_type_name: string
  enabled: boolean
  configured: boolean
  updated_at: string | null
}

export interface StoredTrackerSettings {
  destination_project_key: string
  issue_type_name: string
  enabled: boolean
  updated_at: string
}

// A Project nobody configured: sync off, no destination (AC-6, AC-9).
export const DEFAULT_TRACKER_SETTINGS: TrackerSettingsShape = {
  destination_project_key: null,
  issue_type_name: DEFAULT_ISSUE_TYPE,
  enabled: false,
  configured: false,
  updated_at: null,
};

export function toTrackerSettingsShape(row: StoredTrackerSettings | null): TrackerSettingsShape {
  if (row === null) {
    return { ...DEFAULT_TRACKER_SETTINGS };
  }
  return {
    destination_project_key: row.destination_project_key,
    issue_type_name: row.issue_type_name,
    enabled: row.enabled,
    configured: true,
    updated_at: row.updated_at,
  };
}

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// `.../projects/{id}/tracker-settings[/check]` -> the id segment after `projects`.
export function extractProjectId(request: Request): string {
  const segments = new URL(request.url).pathname.split('/');
  const index = segments.lastIndexOf('projects');
  return index >= 0 ? (segments[index + 1] ?? '') : '';
}

export function assertProjectIdIsUuid(projectId: string): void {
  if (!UUID_PATTERN.test(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }
}

// The Project as the caller sees it. A Project the caller cannot see (another
// workspace, soft-deleted workspace, no such id) is the SAME 404.
export async function loadVisibleProject(db: Db, projectId: string): Promise<{ id: string, workspaceId: string }> {
  const { data, error } = await db
    .from('projects')
    .select('id, workspace_id')
    .eq('id', projectId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'The project could not be loaded.');
  }
  if (!data) {
    throw new ApiError('not_found', 'Project not found.', { details: { reason: 'not_found' } });
  }
  return { id: data.id, workspaceId: data.workspace_id };
}

// Admin gate for the write and the check. ORDER MATTERS: it runs before any Jira
// call and before the admin client is built, so a non-admin can neither probe the
// shared Jira site nor reach the RPC. The role is read LIVE, never from the
// token or the page (a demoted admin with a stale page is refused, AC-4.5).
export async function assertCanAdministerTracker(args: { db: Db, principal: Principal, projectId: string }): Promise<{ id: string, workspaceId: string }> {
  const project = await loadVisibleProject(args.db, args.projectId);

  // A workspace-scoped PAT may only act on its own workspace (ADR-0006).
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
    throw new ApiError('forbidden', TRACKER_SETTINGS_MESSAGES.admin_required, {
      details: { reason: 'admin_required' },
    });
  }
  return project;
}

export async function readTrackerSettings(db: Db, projectId: string): Promise<StoredTrackerSettings | null> {
  const { data, error } = await db
    .from('project_tracker_settings')
    .select('destination_project_key, issue_type_name, enabled, updated_at')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'The tracker settings could not be loaded.');
  }
  return data;
}
