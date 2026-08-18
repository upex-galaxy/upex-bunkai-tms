import type { NextRequest } from 'next/server';
import type { SearchRpcRow } from './response';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { parseSearchParams } from '@lib/search/validation';
import { searchWorkspace } from '@lib/supabase/rpc';
import { cookies } from 'next/headers';
import { fetchSearchPage, mapSearchRpcError, resolveSearchWorkspaceId } from './response';

// GET /api/v1/search — cross-entity Command Palette search (BK-398), spanning
// ATCs, Tests, Projects, Modules, Bugs, Runs. Design ruled by Jira comments
// 12406 (AI Tech Lead) and 12407 (AI Product Owner), both binding.
//
//   ?q=<text>      required, >= 2 chars after trim (422 below threshold —
//                  the CLIENT never sends a request that short in the first
//                  place, AC-06 6.2, this is a defensive backstop).
//   ?limit=<1..20> optional, default 20 — a per-request ceiling; the RPC's
//                  own per-group cap of 5 always applies regardless.
//
// NO workspace path segment, NO workspace query parameter — the client is
// never the authority on scope (comment 12406). Scope is resolved
// server-side: a cookie session via `resolveActiveWorkspaceId` (the same
// single source of truth `/api/v1/activity` and `/api/v1/me` share), a
// Bearer/PAT caller via its own pre-scoped `principal.workspaceId`.
//
// Auth: cookie session or Bearer PAT (`atc:read`), identically — verified
// this session that `getAuth(ctx).db` is RLS-scoped for PAT principals too
// (ADR-0001 Path B impersonation, `lib/api/principal.ts`'s
// `impersonatingClient`), so there is no bespoke PAT 403 branch here.
//
// `db` — the CALLER's own RLS-scoped client from getAuth(ctx) — NEVER
// createAdminClient(). `bunkai_search_workspace` is SECURITY INVOKER
// (migration 0071_workspace_search.sql): it runs under the CALLING role, so
// every branch's workspace-member RLS policy evaluates against THIS
// request's own auth.uid(). An admin/service-role client has no
// authenticated auth.uid() — using one here would silently empty every
// result (RLS fails closed) rather than leak anything, but would also just
// break the feature outright.
//
// Every failure path (unknown/foreign/inaccessible workspace, no matches)
// collapses into the SAME 200 `{ data: [], truncated: false }` — this route
// never answers 403/404 for scope reasons (comment 12406, rule 9).

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const query = parseSearchParams(request.nextUrl.searchParams);

  const cookieStore = await cookies();
  const cookieActiveWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const workspaceId = await resolveSearchWorkspaceId(db, {
    principal,
    cookieActiveWorkspaceId,
  });

  const { data, error } = await searchWorkspace(db, {
    query: query.q,
    workspaceId,
    limit: query.limit,
  });
  if (error) {
    mapSearchRpcError(error);
  }

  const rows = (data ?? []) as unknown as SearchRpcRow[];
  const page = fetchSearchPage(rows);

  return jsonResponse(page, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });
