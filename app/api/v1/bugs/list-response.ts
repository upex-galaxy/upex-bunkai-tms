import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import type { BugAggregates } from '@lib/bugs/list-view';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { encodeBugsCursor } from '@lib/bugs/list-cursor';
import { listBugs } from '@lib/supabase/rpc';

// BK-41 (Slice 2: API) — dependency-free / DB-parametrized logic for
// GET /api/v1/bugs, split out of `route.ts` so the visibility gate, the
// RPC-error mapping, and the row -> wire-shape mapping are unit-testable
// without mocking `withApiHandler` or a live NextRequest — mirrors
// `app/api/v1/activity/response.ts`'s own isolation pattern (auth-adjacent
// gate + RPC error mapper + DB-parametrized business logic, all pure enough
// to test with a fake `db`).

// ---------------------------------------------------------------------------
// Project visibility + module-in-project checks (Decision 9/10)
// ---------------------------------------------------------------------------

// Decision 9: a caller who cannot see `project_id` (foreign or nonexistent)
// collapses into the SAME 200 `{data: [], aggregates: zeroed}` a genuinely
// empty, visible project would return — never a 403. The ATP outline's
// original ATP-9 ("403, not a fake empty result") predates today's PO+Dev
// ratification (comment 12071) and now conflicts with Decision 3's
// SECURITY INVOKER/RLS shape: `GET /api/v1/activity`'s own route comment
// documents the identical non-disclosure collapse for the same shape, and
// ADR-0012 names `bunkai_list_activity` as this story's worked exemplar.
// `resolveBugsProjectVisibility` answers whether the project is visible to
// the CALLER'S OWN RLS-scoped client — the route uses this to short-circuit
// BEFORE `bunkai_list_bugs` is ever called, so an invisible project never
// reaches the RPC at all. `db` MUST be the caller's own RLS-scoped client
// (`getAuth(ctx).db`), same requirement as `listBugs`.
export async function resolveBugsProjectVisibility(
  db: SupabaseClient<Database>,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  return data !== null;
}

// Decision 10: ONLY called after `resolveBugsProjectVisibility` has already
// confirmed `project_id` is visible — a `module_id` outside that project is
// then safe to disclose (the caller already proved project membership).
// Zero rows -> `validation_failed` (this codebase's DEFAULT_STATUS maps
// `validation_failed` to 422 — the ATP/plan's literal "400 validation_failed"
// wording names the CODE, not the HTTP status; `lib/bugs/list-query.ts`'s
// header note makes the same point for ATP-11/12/13). Mirrors
// `mapBugRpcError`'s `module_outside_project` (45300) reason shape.
export async function assertModuleInProject(
  db: SupabaseClient<Database>,
  params: { projectId: string, moduleId: string },
): Promise<void> {
  const { data, error } = await db
    .from('modules')
    .select('id')
    .eq('id', params.moduleId)
    .eq('project_id', params.projectId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (data === null) {
    throw new ApiError('validation_failed', 'The module must belong to the current project.', {
      details: { reason: 'module_not_in_project' },
    });
  }
}

// ---------------------------------------------------------------------------
// RPC error mapping
// ---------------------------------------------------------------------------

// Maps a `bunkai_list_bugs` RPC error (migration 0051_bugs_list.sql) to the
// house envelope. 45308 (bugs_list_cursor_invalid — a partial, some-but-not-
// all-three, cursor triple) is a backstop this route makes practically
// unreachable: `decodeBugsCursor` (called by the route before the RPC ever
// runs) either supplies ALL three cursor parts or none — mirrors
// `mapActivityRpcError`'s own 45214 backstop comment. Always throws
// (`: never`) so `if (error) mapBugsListRpcError(error)` is exhaustive.
export function mapBugsListRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '45308':
      throw new ApiError('bad_request', 'The cursor is not a valid page token.', {
        details: { reason: 'bugs_list_cursor_invalid' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// ---------------------------------------------------------------------------
// Row / aggregate / page shapes (RPC contract, migration 0051_bugs_list.sql)
// ---------------------------------------------------------------------------

// The `bunkai_list_bugs` RPC's per-row projection (`Returns: Json`, so the
// generated Supabase types carry no row shape). Mirrors `bunkai_bug_json`'s
// own composed shape (`app/api/v1/bugs/route.openapi.ts`'s `BugSchema`) —
// the list RPC's `jsonb_build_object` call (migration 0051) projects the
// exact same fields, so this row passes through to the wire UNCHANGED, same
// as `buildActivityItem`'s `payload` pass-through.
export interface BugsListRpcRow {
  id: string
  workspace_id: string
  project_id: string
  module_id: string
  module: { id: string, name: string, path: string }
  run_id: string | null
  run_step_id: string | null
  atc_id: string | null
  title: string
  severity: string
  status: string
  description: string | null
  steps_to_reproduce: string
  evidence_urls: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

// Reuses `lib/bugs/list-view.ts`'s `BugAggregates` type — ONE shape shared
// between this API layer and the eventual filter-chips/counts panel (Slice
// 3), not two independently-maintained copies.
export const ZERO_BUGS_AGGREGATES: BugAggregates = {
  by_severity: { P1: 0, P2: 0, P3: 0, P4: 0 },
  by_status: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
};

interface BugsListRpcPayload {
  data: BugsListRpcRow[]
  aggregates: BugAggregates
  next_cursor: { severity: string, created_at: string, id: string } | null
}

export interface BugsListPageResponse {
  data: BugsListRpcRow[]
  aggregates: BugAggregates
  next_cursor: string | null
}

// AC-7 / Decision 9's own 200-empty shape, returned directly by the route
// when `resolveBugsProjectVisibility` finds no visible project — never
// derived from a real (zero-row) RPC call, since the RPC is never invoked on
// this path at all.
export function emptyBugsListPage(): BugsListPageResponse {
  return { data: [], aggregates: ZERO_BUGS_AGGREGATES, next_cursor: null };
}

// ---------------------------------------------------------------------------
// DB-parametrized page fetch
// ---------------------------------------------------------------------------

export interface FetchBugsListPageParams {
  projectId: string
  moduleId: string | null
  statuses: BugStatus[] | null
  severities: BugSeverity[] | null
  limit: number
  cursorSeverity: string | null
  cursorCreatedAt: string | null
  cursorId: string | null
}

// `db` MUST be the caller's own RLS-scoped client (`getAuth(ctx).db`) — see
// the extensive comment on `listBugs` in `lib/supabase/rpc.ts` for why.
export async function fetchBugsListPage(
  db: SupabaseClient<Database>,
  params: FetchBugsListPageParams,
): Promise<BugsListPageResponse> {
  const { data, error } = await listBugs(db, {
    projectId: params.projectId,
    moduleId: params.moduleId,
    statuses: params.statuses,
    severities: params.severities,
    limit: params.limit,
    cursorSeverity: params.cursorSeverity,
    cursorCreatedAt: params.cursorCreatedAt,
    cursorId: params.cursorId,
  });
  if (error) {
    mapBugsListRpcError(error);
  }

  const payload = data as unknown as BugsListRpcPayload;

  return {
    data: payload.data,
    aggregates: payload.aggregates,
    next_cursor: payload.next_cursor === null
      ? null
      : encodeBugsCursor({
          severity: payload.next_cursor.severity as BugSeverity,
          createdAt: payload.next_cursor.created_at,
          id: payload.next_cursor.id,
        }),
  };
}
