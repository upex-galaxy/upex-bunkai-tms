import type { Principal } from '@lib/api/principal';
import type { SearchEntityType } from '@lib/notifications/entity-routes';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { buildEntityHref } from '@lib/notifications/entity-routes';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';

// BK-398 (Slice 2: API) — dependency-free / DB-parametrized logic for
// GET /api/v1/search, split out of `route.ts` so workspace resolution and
// the row -> wire-shape projection are unit-testable without mocking
// `withApiHandler` or a live NextRequest (mirrors `app/api/v1/activity/response.ts`).

// ---------------------------------------------------------------------------
// Workspace resolution
// ---------------------------------------------------------------------------

// Jira comment 12406 (AI Tech Lead ruling): "No workspace path segment and
// no workspace query parameter — the client is never the authority on
// scope." So, unlike `resolveActivityWorkspaceId`, this NEVER accepts an
// explicit override from the query string. A cookie session resolves
// through the SAME `resolveActiveWorkspaceId` single source of truth the
// app shell / `/projects` / `/api/v1/me` all share. A Bearer/PAT caller has
// no cookie, but its scope was already fixed server-side when the token was
// issued (`principal.workspaceId`, ADR-0006) — that is not client-supplied
// per request, so using it here does not reopen the "client as authority"
// gap the ruling closes off.
export interface ResolveSearchWorkspaceIdParams {
  principal: Pick<Principal, 'via' | 'workspaceId'>
  cookieActiveWorkspaceId: string | null
}

export async function resolveSearchWorkspaceId(
  db: SupabaseClient<Database>,
  params: ResolveSearchWorkspaceIdParams,
): Promise<string> {
  if (params.principal.via === 'bearer') {
    if (params.principal.workspaceId) {
      return params.principal.workspaceId;
    }
    throw new ApiError('validation_failed', 'This token is not scoped to a workspace; it cannot search.');
  }

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
  throw new ApiError('validation_failed', 'No active workspace to search.');
}

// ---------------------------------------------------------------------------
// RPC error mapping
// ---------------------------------------------------------------------------

// `bunkai_search_workspace` never raises for a bad/foreign workspace or an
// unparseable query — every one of those collapses into an empty `[]`
// inside the function itself (comment 12406, authoring question 5: "Does
// the failure path disclose existence? No path discloses"). This mapper
// exists only for genuinely unexpected Postgres errors.
export function mapSearchRpcError(error: { code?: string, message: string }): never {
  throw new ApiError('internal_error', error.message);
}

// ---------------------------------------------------------------------------
// Row -> wire shape (pure)
// ---------------------------------------------------------------------------

// The RPC's per-row projection (`Returns: Json`, so the generated Supabase
// types carry no row shape — hand-typed contract of migration 0071's
// `jsonb_build_object` calls).
export interface SearchRpcRow {
  entity_type: SearchEntityType
  id: string
  name: string
  project_id: string
  project_slug: string
  project_name: string
}

export interface SearchResultItem {
  entity_type: SearchEntityType
  id: string
  name: string
  project_id: string
  project_slug: string
  project_name: string
  href: string
}

export interface SearchPageResponse {
  data: SearchResultItem[]
  truncated: boolean
}

// The RPC's own per-group cap (migration 0071's hard ceiling — see its
// header comment). A group's row count hitting this exactly is the signal
// a client uses to render a non-interactive "+ more" hint per group; the
// top-level `truncated` boolean here is true when ANY group hit it.
export const SEARCH_GROUP_CAP = 5;

export function buildSearchResultItem(row: SearchRpcRow): SearchResultItem {
  return {
    ...row,
    href: buildEntityHref(row.entity_type, { projectSlug: row.project_slug, entityId: row.id }),
  };
}

export function fetchSearchPage(
  rows: SearchRpcRow[],
): SearchPageResponse {
  const data = rows.map(buildSearchResultItem);

  const countByType = new Map<SearchEntityType, number>();
  for (const row of rows) {
    countByType.set(row.entity_type, (countByType.get(row.entity_type) ?? 0) + 1);
  }
  const truncated = [...countByType.values()].some(count => count >= SEARCH_GROUP_CAP);

  return { data, truncated };
}
