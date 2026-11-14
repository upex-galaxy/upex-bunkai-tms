import type { WorkspaceRunItem, WorkspaceRunMode, WorkspaceRunOutcome, WorkspaceRunsPage } from '@lib/runs/workspace-runs-constants';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeRunCursor } from '@lib/runs/history-validation';
import { WORKSPACE_RUNS_PAGE_SIZE } from '@lib/runs/workspace-runs-constants';
import { listWorkspaceRunsRpc } from '@lib/supabase/rpc';

// BK-513 — the workspace-wide Runs index, read the SAME way by the API route
// and the `/runs` page, so what QA reads by API is what the screen renders.
//
// Every read here takes the CALLER's client (cookie session, or the PAT's
// impersonated client), never the admin client: the RPC is SECURITY INVOKER
// (0127) and RLS is what keeps another workspace's Runs out. A foreign or
// lost-membership workspace id therefore reads as an empty workspace.

type Db = SupabaseClient<Database>;

export interface WorkspaceRunsListParams {
  workspaceId: string
  projectId?: string | null
  status?: WorkspaceRunOutcome[] | null
  environment?: string | null
  mode?: WorkspaceRunMode | null
  limit?: number
  cursor?: { startedAt: string, id: string } | null
}

// A failed read is `ok: false`, never an empty page: an empty page is the
// answer for an empty workspace, and the caller must be able to tell the two
// apart.
export type WorkspaceRunsResult = { ok: true, page: WorkspaceRunsPage } | { ok: false };

interface RpcPayload {
  items: WorkspaceRunItem[] | null
  next_cursor: { started_at: string, id: string } | null
}

// The sidebar badge and the API's `workspace_run_count`. Same table, same RLS
// and the same workspace predicate as the unfiltered list, so the count equals
// the number of Runs the unfiltered index pages through (AC-02). `null` on a
// failed read: the badge hides rather than showing a false 0.
export async function countWorkspaceRuns(db: Db, workspaceId: string): Promise<number | null> {
  const { count, error } = await db
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  return error ? null : (count ?? 0);
}

export async function listWorkspaceRuns(db: Db, params: WorkspaceRunsListParams): Promise<WorkspaceRunsResult> {
  const [list, count] = await Promise.all([
    listWorkspaceRunsRpc(db, {
      workspaceId: params.workspaceId,
      projectId: params.projectId ?? null,
      status: params.status && params.status.length > 0 ? params.status : null,
      environmentName: params.environment ?? null,
      mode: params.mode ?? null,
      limit: params.limit ?? WORKSPACE_RUNS_PAGE_SIZE,
      cursorStartedAt: params.cursor?.startedAt ?? null,
      cursorId: params.cursor?.id ?? null,
    }),
    countWorkspaceRuns(db, params.workspaceId),
  ]);

  if (list.error !== null || count === null) {
    return { ok: false };
  }

  const payload = list.data as unknown as RpcPayload;
  return {
    ok: true,
    page: {
      items: payload.items ?? [],
      // The RPC returns the raw keyset position; the wire token is opaque and
      // is BK-37's codec, unchanged.
      next_cursor: payload.next_cursor === null
        ? null
        : encodeRunCursor({ startedAt: payload.next_cursor.started_at, id: payload.next_cursor.id }),
      workspace_run_count: count,
    },
  };
}

export interface WorkspaceRunFilterOptions {
  projects: { id: string, name: string }[]
  environments: string[]
}

// The filter options: the active workspace's Projects and the distinct names of
// their environments. Both read through the caller's RLS, pinned to the active
// workspace, so no option from another workspace can appear (AC-19).
export async function listWorkspaceRunFilterOptions(db: Db, workspaceId: string): Promise<WorkspaceRunFilterOptions | null> {
  const [projects, environments] = await Promise.all([
    db
      .from('projects')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
    db
      .from('project_environments')
      .select('name, projects!inner(workspace_id)')
      .eq('projects.workspace_id', workspaceId),
  ]);

  if (projects.error !== null || environments.error !== null) {
    return null;
  }

  return {
    projects: (projects.data ?? []).map(p => ({ id: p.id, name: p.name })),
    environments: distinctEnvironmentNames((environments.data ?? []).map(e => e.name)),
  };
}

// Environments are defined per Project and the filter matches by name,
// case-insensitively, so "Staging" in one Project and "staging" in another are
// one option. The first spelling seen is kept; options sort alphabetically.
export function distinctEnvironmentNames(names: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === '') { continue; }
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, trimmed);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}
