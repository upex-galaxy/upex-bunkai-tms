-- Migration: 0027 — ATC full-text search RPC (BK-20)
-- Authored: 2026-06-20
--
-- BK-20 ships project-scoped full-text search + autocomplete over ATCs,
-- matching on title and tags (both already flattened into `atcs.tsv` by the
-- 0004 trigger), ranked by relevance with a recency tie-break, optionally
-- narrowed by a Module subtree and/or layer. Consumers: GET /api/v1/atcs/search
-- (PAT or cookie) and the Projects toolbar inline filter.
--
-- This migration is ADDITIVE — a single read-only SECURITY DEFINER function. It
-- does NOT touch the `atcs.tsv` column, the `atcs_tsv_gin_idx` GIN index, or the
-- refresh trigger from 0004. The query uses the SAME `'english'` regconfig the
-- index was built with so it stays index-compatible (see BK-20 plan, Risk R1).
--
-- AuthZ + isolation (mirrors the 0004 atcs SELECT policy, but for an EXPLICIT
-- actor because PAT callers carry no auth.uid()): the result set is restricted
-- to ATCs whose project belongs to a workspace where p_actor_user_id is an
-- `active` member. Any caller-supplied workspace scope is intentionally ignored;
-- scope derives only from the actor's memberships (BK-20 AC S6.2). A read
-- accepts ANY active role (viewers included), unlike the write-asserts in 0021.
--
-- Project scope (product decision): the search is narrowed to a SINGLE project,
-- not workspace-wide. The caller passes p_project_id (required) and results are
-- filtered to that project. This is ADDITIVE to the tenant isolation above — the
-- workspace_members join still enforces that the actor can only see ATCs in
-- workspaces they actively belong to, so a p_project_id the actor cannot reach
-- (foreign workspace, or non-existent) yields zero rows, never a leak.
--
-- Module subtree (BK-20 AC3): `modules.path` is a materialized slash-separated
-- path (0002). The descendant set of p_module_id is exactly that module plus
-- every module whose path is prefixed by `<path>/` in the same project — a
-- LIKE-prefix match, no recursive CTE needed. A non-existent module_id yields an
-- empty subtree and therefore an empty result (never a 404).
--
-- Ranking (BK-20 AC4): ts_rank(tsv, query) multiplied by a 7-day exponential
-- recency decay on updated_at. Equal relevance → the more recently updated ATC
-- ranks first.

-- This migration is unpushed; the prior in-flight signature (without
-- p_project_id) was never released, but drop it defensively so re-applying this
-- file against a dev DB that already has the old overload leaves exactly one
-- function, not two overloads resolved by argument count.
drop function if exists public.bunkai_search_atcs(uuid, text, uuid, text, int);

create or replace function public.bunkai_search_atcs(
  p_actor_user_id uuid,
  p_query         text,
  p_project_id    uuid,
  p_module_id     uuid    default null,
  p_layer         text    default null,
  p_limit         int     default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query        tsquery;
  v_module_path  text;
  v_module_proj  uuid;
  v_limit        int;
  v_result       jsonb;
begin
  -- Defensive clamp (the route validates 1..50 via zod, but the RPC is a public
  -- contract: keep it self-consistent if called directly).
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  -- Build the tsquery with the SAME regconfig as the index (0004 = 'english').
  -- Single token → prefix-aware autocomplete (`tok:*`); multi-word → plainto
  -- (AND semantics, no prefix). A blank/whitespace query produces a NULL
  -- tsquery, which matches nothing — but the route already rejects empty input
  -- with 400 before reaching here (BK-20 AC5).
  if p_query is null or btrim(p_query) = '' then
    return '[]'::jsonb;
  end if;

  if array_length(regexp_split_to_array(btrim(p_query), '\s+'), 1) = 1 then
    -- to_tsquery requires a sanitized lexeme; strip tsquery operator chars so
    -- raw user input can never form a malformed query, then append `:*`.
    v_query := to_tsquery('english', regexp_replace(btrim(p_query), '[:&|!()<>*]', '', 'g') || ':*');
  else
    v_query := plainto_tsquery('english', p_query);
  end if;

  if v_query is null then
    return '[]'::jsonb;
  end if;

  -- Resolve the module subtree filter (when provided) to a path prefix. A
  -- non-existent / cross-workspace module_id leaves v_module_path null → the
  -- predicate below excludes everything → empty result (BK-20 AC3.2).
  if p_module_id is not null then
    select m.path, m.project_id
      into v_module_path, v_module_proj
      from public.modules m
      where m.id = p_module_id and m.archived_at is null;
  end if;

  select coalesce(jsonb_agg(row_json order by rank desc, updated_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id', a.id,
        'slug', a.slug,
        'title', a.title,
        'layer', a.layer,
        'status', a.status,
        'module_path', m.path
      ) as row_json,
      ts_rank(a.tsv, v_query)
        * exp(-greatest(0, extract(epoch from (now() - a.updated_at))) / 604800.0) as rank,
      a.updated_at
    from public.atcs a
    join public.modules m on m.id = a.module_id
    join public.projects p on p.id = a.project_id
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where a.archived_at is null
      and a.tsv @@ v_query
      and a.project_id = p_project_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- Module subtree: the module itself or any descendant in the same project.
      and (
        p_module_id is null
        or (
          v_module_path is not null
          and m.project_id = v_module_proj
          and (m.path = v_module_path or m.path like v_module_path || '/%')
        )
      )
      -- Optional layer narrow (BK-20 SG4).
      and (p_layer is null or a.layer = p_layer)
    order by rank desc, a.updated_at desc
    limit v_limit
  ) ranked;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_search_atcs(uuid, text, uuid, uuid, text, int) from public, anon;
grant execute on function public.bunkai_search_atcs(uuid, text, uuid, uuid, text, int) to authenticated, service_role;
