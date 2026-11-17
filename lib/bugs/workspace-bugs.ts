import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import type { BugsCursor } from '@lib/bugs/list-cursor';
import type { BugAggregates } from '@lib/bugs/list-view';
import type { WorkspaceBugItem, WorkspaceBugsPage } from '@lib/bugs/workspace-bugs-constants';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeBugsCursor } from '@lib/bugs/list-cursor';
import { WORKSPACE_BUGS_PAGE_SIZE } from '@lib/bugs/workspace-bugs-constants';
import { listWorkspaceBugsRpc, resolveActivityActors } from '@lib/supabase/rpc';

// BK-555 — the workspace-wide Bug Reports index, read the SAME way by the API
// route and the `/bugs` page, so what QA reads by API is what the screen
// renders.
//
// Every read here takes the CALLER's client (cookie session, or the PAT's
// impersonated client), never the admin client: the RPC is SECURITY INVOKER
// (0132) and RLS is what keeps another workspace's defects out. A foreign or
// lost-membership workspace id therefore reads as an empty workspace.

type Db = SupabaseClient<Database>;

export interface WorkspaceBugsListParams {
  workspaceId: string
  projectId?: string | null
  statuses?: BugStatus[] | null
  severities?: BugSeverity[] | null
  limit?: number
  cursor?: BugsCursor | null
}

// A failed read is `ok: false`, never an empty page: an empty page is the
// answer for an empty workspace, and the caller must be able to tell the two
// apart (AC-14 vs AC-17).
export type WorkspaceBugsResult = { ok: true, page: WorkspaceBugsPage } | { ok: false };

type RpcRow = Omit<WorkspaceBugItem, 'assignee'>;

interface RpcPayload {
  data: RpcRow[] | null
  aggregates: BugAggregates
  next_cursor: { severity: BugSeverity, created_at: string, id: string } | null
}

// The sidebar badge and the API's `workspace_bug_count`. Same RLS, the same
// workspace predicate and the same archived-module exclusion as the unfiltered
// list (0132), so the count equals the number of defects the unfiltered index
// pages through (AC-02, AC-19). A plain `count(*) where workspace_id` would
// count defects on archived modules. `null` on a failed read: the badge hides
// rather than showing a false 0.
export async function countWorkspaceBugs(db: Db, workspaceId: string): Promise<number | null> {
  const { count, error } = await db
    .from('bugs')
    .select('id, modules!inner(archived_at)', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('modules.archived_at', null);
  return error ? null : (count ?? 0);
}

export async function listWorkspaceBugs(db: Db, params: WorkspaceBugsListParams): Promise<WorkspaceBugsResult> {
  const [list, count] = await Promise.all([
    listWorkspaceBugsRpc(db, {
      workspaceId: params.workspaceId,
      projectId: params.projectId ?? null,
      statuses: params.statuses && params.statuses.length > 0 ? params.statuses : null,
      severities: params.severities && params.severities.length > 0 ? params.severities : null,
      limit: params.limit ?? WORKSPACE_BUGS_PAGE_SIZE,
      cursorSeverity: params.cursor?.severity ?? null,
      cursorCreatedAt: params.cursor?.createdAt ?? null,
      cursorId: params.cursor?.id ?? null,
    }),
    countWorkspaceBugs(db, params.workspaceId),
  ]);

  if (list.error !== null || count === null) {
    return { ok: false };
  }

  const payload = list.data as unknown as RpcPayload;
  const rows = payload.data ?? [];

  // Assignee emails for THIS page only, through the same resolver the Project
  // list uses (ADR-0011). It admits every active member, Viewer included.
  const assigneeIds = [...new Set(rows.map(r => r.assignee_user_id).filter((id): id is string => id !== null))];
  const emailById = new Map<string, string | null>();
  if (assigneeIds.length > 0) {
    const { data: resolved, error } = await resolveActivityActors(db, { workspaceId: params.workspaceId, userIds: assigneeIds });
    if (error) {
      return { ok: false };
    }
    for (const actor of resolved ?? []) {
      emailById.set(actor.user_id, actor.email);
    }
  }

  return {
    ok: true,
    page: {
      data: rows.map(row => ({
        ...row,
        assignee: row.assignee_user_id === null
          ? null
          : { user_id: row.assignee_user_id, email: emailById.get(row.assignee_user_id) ?? null },
      })),
      aggregates: payload.aggregates,
      // The RPC returns the raw keyset position; the wire token is the Project
      // list's opaque codec, unchanged.
      next_cursor: payload.next_cursor === null
        ? null
        : encodeBugsCursor({ severity: payload.next_cursor.severity, createdAt: payload.next_cursor.created_at, id: payload.next_cursor.id }),
      workspace_bug_count: count,
    },
  };
}

// The Project filter's options: every Project of the active workspace, defects
// or not (AI Product Owner ruling Q2 on BK-555), read through the caller's RLS
// and pinned to the workspace, so no other workspace's Project appears (AC-20).
export async function listWorkspaceBugProjects(db: Db, workspaceId: string): Promise<{ id: string, name: string }[] | null> {
  const { data, error } = await db
    .from('projects')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) {
    return null;
  }
  return (data ?? []).map(p => ({ id: p.id, name: p.name }));
}
