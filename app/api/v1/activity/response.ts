import type { ActivityAction } from '@lib/activity/constants';
import type { Principal } from '@lib/api/principal';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVITY_ALLOWED_ACTIONS } from '@lib/activity/constants';
import { encodeActivityCursor } from '@lib/activity/history-validation';
import { resolveActionLabel } from '@lib/activity/labels';
import { ApiError } from '@lib/api/error-envelope';
import { listActivity, resolveActivityActors } from '@lib/supabase/rpc';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';

// BK-49 (Slice 2: API) — dependency-free / DB-parametrized logic for
// GET /api/v1/activity, split out of `route.ts` so the workspace-resolution
// branches, the RPC-error mapping, and the row→wire-shape projection are
// unit-testable without mocking `withApiHandler` or a live NextRequest —
// mirrors the isolation pattern `workspaces/[id]/membership/response.ts`
// established (auth-adjacent gate + RPC error mapper + DB-parametrized
// business logic, all pure enough to test with a fake `db`).

// ---------------------------------------------------------------------------
// Workspace resolution (API design step 2, implementation-plan.md)
// ---------------------------------------------------------------------------

export interface ResolveActivityWorkspaceIdParams {
  explicitWorkspaceId: string | null
  principal: Pick<Principal, 'via'>
  cookieActiveWorkspaceId: string | null
}

// An explicit `?workspace_id=` always wins. Absent that, a cookie SESSION
// falls back to `resolveActiveWorkspaceId` against the caller's visible
// workspaces. A Bearer/PAT caller (`principal.via === 'bearer'`) has no
// cookie to fall back to, so it must send `workspace_id` explicitly — same
// submit-instant binding `POST /api/v1/tests` already uses, adapted to a
// GET's query string instead of a JSON body. Throws `validation_failed`
// (422) rather than returning null: every caller of this route needs a
// resolved workspace to proceed, there is no legitimate "no workspace" 200.
export async function resolveActivityWorkspaceId(
  db: SupabaseClient<Database>,
  params: ResolveActivityWorkspaceIdParams,
): Promise<string> {
  if (params.explicitWorkspaceId) {
    return params.explicitWorkspaceId;
  }

  if (params.principal.via === 'cookie') {
    const { data: workspaces, error } = await db
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true });
    if (error) {
      throw new ApiError('internal_error', error.message);
    }
    const resolved = resolveActiveWorkspaceId(params.cookieActiveWorkspaceId, (workspaces ?? []).map(w => w.id));
    if (resolved) {
      return resolved;
    }
  }

  throw new ApiError('validation_failed', 'workspace_id is required for token-authenticated calls.');
}

// ---------------------------------------------------------------------------
// RPC error mapping
// ---------------------------------------------------------------------------

// Maps a `bunkai_list_activity` / `bunkai_resolve_activity_actors` RPC error
// (migration 0045_activity_stream.sql) to the house envelope. Both codes
// below are backstops the HTTP layer should make practically unreachable:
//   - 45214 (activity_cursor_invalid): this route always supplies both
//     cursor halves or neither — `decodeActivityCursor` rejects a malformed
//     token as a 400 BEFORE the RPC ever runs.
//   - 42501 (not_workspace_member, bunkai_resolve_activity_actors' own
//     co-membership assert): the actor ids batch-resolved on any call are
//     always drawn from rows bunkai_list_activity already returned for THIS
//     workspace, and that RPC's RLS already silently empties a non-member's
//     result set — so there is never a non-empty actor-id batch to resolve
//     for a workspace this caller cannot see.
// Always throws (`: never`) so `if (error) mapActivityRpcError(error)` is
// exhaustive at every call site.
export function mapActivityRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '45214':
      throw new ApiError('bad_request', 'The cursor is not a valid page token.', {
        details: { reason: 'activity_cursor_invalid' },
      });
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace.', {
        details: { reason: 'not_a_member' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// ---------------------------------------------------------------------------
// Row → wire shape (pure)
// ---------------------------------------------------------------------------

// The `bunkai_list_activity` RPC's per-row projection (`Returns: Json`, so
// the generated Supabase types carry no row shape — this interface is the
// hand-typed contract of migration 0045's `jsonb_build_object` call). The
// `payload` here is ALREADY the allowlisted subset the migration's
// `case (action)` positively projects: `run.aborted.reason` is never
// selected there in the first place (Decision 3, Risk R3), so it can never
// be present on this type either.
export interface ActivityRpcRow {
  id: string
  entity_type: string
  entity_id: string | null
  action: string
  actor_user_id: string | null
  created_at: string
  payload: Record<string, unknown>
}

export interface ActivityRpcPayload {
  items: ActivityRpcRow[]
  next_cursor: { created_at: string, id: string } | null
}

export interface ActivityItemResponse {
  id: string
  entity_type: string
  action: string
  action_label: string
  actor: { user_id: string | null, email: string | null }
  item: { label: string, entity_id: string | null }
  payload: Record<string, unknown>
  created_at: string
}

// Item-label derivation (API design § "ActivityItemSchema", payload
// projection table): a per-action payload field where a usable one exists,
// else the generic `"a <entity_type>"` fallback (also the safe answer when
// the specific field is present-but-empty — AC1 1.5's "safe fallback", never
// a crash or an undefined string in the UI).
export function deriveItemLabel(row: Pick<ActivityRpcRow, 'action' | 'entity_type' | 'payload'>): string {
  const fallback = `a ${row.entity_type}`;
  switch (row.action as ActivityAction) {
    case 'module.renamed':
      return nonEmptyString(row.payload.name) ?? fallback;
    case 'module.moved':
      return nonEmptyString(row.payload.new_path) ?? fallback;
    case 'atc.created':
    case 'atc.updated':
    case 'atc.archived':
    case 'atc.restored':
    case 'test.created':
      return nonEmptyString(row.payload.title) ?? fallback;
    case 'module.archived':
    case 'module.restored':
      return nonEmptyString(row.payload.name) ?? fallback;
    // BK-1619 — the Jira site host (migration 0120), never an email or a secret.
    case 'jira_connection.connected':
    case 'jira_connection.changed':
    case 'jira_connection.disconnected':
      return nonEmptyString(row.payload.site_host) ?? 'the Jira connection';
    case 'module.description_updated':
    case 'run.finished':
    case 'run.aborted':
    default:
      return fallback;
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

// BK-264 (Slice 4) — the ONE payload field `bug.assigned` / `bug.reassigned`'s
// action_label needs resolved to an email: the NEW assignee (migration
// 0054's `assignee_user_id`). `bug.unassigned` / `bug.status_changed` never
// need this (their label carries no assignee fragment — see
// `lib/activity/labels.ts`), so this returns null for every other action
// rather than resolving an id nothing will render.
function resolveAssigneeUserId(row: Pick<ActivityRpcRow, 'action' | 'payload'>): string | null {
  if (row.action !== 'bug.assigned' && row.action !== 'bug.reassigned') {
    return null;
  }
  return nonEmptyString(row.payload.assignee_user_id);
}

// BK-572 — `member.removed` names WHO was removed in its item label. The id
// resolves through the same ADR-0011 batch; migration 0114 lets an id resolve
// when it is the target of a `member.removed` row in this workspace, even if
// that teammate never acted here.
function resolveRemovedMemberUserId(row: Pick<ActivityRpcRow, 'action' | 'payload'>): string | null {
  if (row.action !== 'member.removed') {
    return null;
  }
  return nonEmptyString(row.payload.removed_user_id);
}

// Neutral fallback when the removed teammate's email does not resolve (their
// account was deleted): never a raw uuid, never blank.
export const UNRESOLVED_REMOVED_MEMBER_LABEL = 'a former member';

export interface BuildActivityItemParams {
  row: ActivityRpcRow
  actorEmail: string | null
  // The row's assignee email, already resolved by the caller through the
  // SAME ADR-0011 batch as `actorEmail` (see `fetchActivityPage` below) —
  // null for every action that has no assignee to show.
  assigneeEmail: string | null
  // BK-572 — the removed teammate's email for `member.removed`, resolved in
  // the same batch; omitted / null for every other action.
  removedMemberEmail?: string | null
}

// Maps one RPC row + its already-resolved actor/assignee email (or null —
// AC1 1.4/1.5's "a workspace member" UI fallback is a presentation concern,
// not this response shape) into the wire item. `payload` passes through
// UNCHANGED from the RPC row — this function does not re-derive or re-filter
// it; the allowlist projection is owned entirely by migration 0045's SQL
// (single source of truth, not duplicated in TypeScript).
export function buildActivityItem({ row, actorEmail, assigneeEmail, removedMemberEmail = null }: BuildActivityItemParams): ActivityItemResponse {
  const label = row.action === 'member.removed'
    ? (removedMemberEmail ?? UNRESOLVED_REMOVED_MEMBER_LABEL)
    : deriveItemLabel(row);
  return {
    id: row.id,
    entity_type: row.entity_type,
    action: row.action,
    action_label: resolveActionLabel({ action: row.action, payload: row.payload, assigneeEmail }),
    actor: { user_id: row.actor_user_id, email: row.actor_user_id ? actorEmail : null },
    item: { label, entity_id: row.entity_id },
    payload: row.payload,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// DB-parametrized page fetch (API design steps 4-6)
// ---------------------------------------------------------------------------

export interface FetchActivityPageParams {
  workspaceId: string
  limit: number
  cursorCreatedAt: string | null
  cursorId: string | null
}

export interface ActivityPageResponse {
  items: ActivityItemResponse[]
  next_cursor: string | null
}

// `db` MUST be the caller's own RLS-scoped client (`getAuth(ctx).db`) — see
// the extensive comment on `listActivity` in `lib/supabase/rpc.ts` for why
// (Risk R2). Batch-resolves users ONLY for the page's distinct non-null
// `actor_user_id`s PLUS (BK-264, Slice 4) any `bug.assigned` / `bug.reassigned`
// row's `assignee_user_id` — ONE `bunkai_resolve_activity_actors` call
// (ADR-0011) covers both, never a second resolver — and skips it entirely
// when that combined set is empty (API design step 5) — which is also why a
// foreign, RLS-emptied `workspace_id` never reaches the resolver at all: zero
// rows means zero ids to resolve.
export async function fetchActivityPage(
  db: SupabaseClient<Database>,
  params: FetchActivityPageParams,
): Promise<ActivityPageResponse> {
  const { data, error } = await listActivity(db, {
    workspaceId: params.workspaceId,
    limit: params.limit,
    cursorCreatedAt: params.cursorCreatedAt,
    cursorId: params.cursorId,
    actions: ACTIVITY_ALLOWED_ACTIONS,
  });
  if (error) {
    mapActivityRpcError(error);
  }

  const payload = data as unknown as ActivityRpcPayload;
  const rows = payload.items ?? [];

  const actorIds = rows.map(row => row.actor_user_id).filter((id): id is string => id !== null);
  const assigneeIds = rows.map(row => resolveAssigneeUserId(row)).filter((id): id is string => id !== null);
  const removedIds = rows.map(row => resolveRemovedMemberUserId(row)).filter((id): id is string => id !== null);
  const userIds = [...new Set([...actorIds, ...assigneeIds, ...removedIds])];

  const emailById = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: actors, error: actorsError } = await resolveActivityActors(db, {
      workspaceId: params.workspaceId,
      userIds,
    });
    if (actorsError) {
      mapActivityRpcError(actorsError);
    }
    for (const actor of actors ?? []) {
      emailById.set(actor.user_id, actor.email);
    }
  }

  const items = rows.map((row) => {
    const assigneeUserId = resolveAssigneeUserId(row);
    const removedUserId = resolveRemovedMemberUserId(row);
    return buildActivityItem({
      row,
      actorEmail: row.actor_user_id ? (emailById.get(row.actor_user_id) ?? null) : null,
      assigneeEmail: assigneeUserId ? (emailById.get(assigneeUserId) ?? null) : null,
      removedMemberEmail: removedUserId ? (emailById.get(removedUserId) ?? null) : null,
    });
  });

  return {
    items,
    next_cursor: payload.next_cursor === null
      ? null
      : encodeActivityCursor({ createdAt: payload.next_cursor.created_at, id: payload.next_cursor.id }),
  };
}
