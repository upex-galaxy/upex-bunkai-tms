-- Migration: 0071 — cross-entity workspace search RPC (BK-398)
-- Authored: 2026-08-15
--
-- BK-398 wires the Command Palette (⌘K) to a single union-search RPC spanning
-- six entity types: ATC, Test, Project, Module, Bug, Run. Design is ruled by
-- Jira comment 12406 (AI Tech Lead — data-access design) and 12407 (AI
-- Product Owner — UX contract), both binding on this ticket per Critical
-- Rule #18. This migration does NOT re-derive either ruling; see them for
-- the scored alternatives.
--
-- AUTHORIZATION (ADR-0012 / the standing BK-267 ruling, comment 12316):
-- SECURITY INVOKER, NO actor parameter. The function runs AS the caller, so
-- every one of the six UNION branches re-evaluates its OWN table's existing
-- workspace-member SELECT RLS policy against the caller's real auth.uid().
-- p_workspace_id is a narrowing filter only — never the authorization
-- boundary — and is ineffective at widening the result set: a forged or
-- foreign workspace id simply intersects to zero rows via RLS, the same
-- non-disclosure property `bunkai_list_activity` (0045) already established.
-- The caller MUST invoke this through getAuth(ctx).db — NEVER
-- createAdminClient() — or auth.uid() is NULL and every branch's RLS policy
-- silently empties (fails closed, but defeats the feature; see the route).
--
-- MATCHING: only atcs.tsv exists today (0004_atcs.sql). For the other five
-- entities this migration adds an EXPRESSION GIN index
-- `using gin (to_tsvector('english', <display_column>))` — no new column, no
-- backfill, no trigger, and no pg_trgm (never installed in this schema; the
-- only extension anywhere is pgcrypto). Query construction mirrors
-- 0027_atc_search.sql:79-85 exactly: a single token becomes a prefix tsquery
-- (`tok:*`), multiple tokens become `plainto_tsquery` (AND semantics).
--
-- RANKING: ts_rank with the same 7-day exponential recency decay as 0027,
-- then a recency column DESC, then display name ASC, then id ASC (final
-- total-order tiebreak — duplicate names are an explicit AC edge case and
-- without an id tiebreak the same query could return different orders on
-- different runs). DEVIATION from the literal "then updated_at DESC" text in
-- comment 12406: `projects` and `modules` carry no `updated_at` column
-- (verified against 0002_projects_modules.sql this session) — their recency
-- tiebreak uses `created_at`, the only recency column either table has.
--
-- TESTS have no project_id (workspace-scoped only, BK-27 Decision 9,
-- 0024_tests.sql) — a Test's chain can reference ATCs from more than one
-- Project, so there is no single authoritative project for one. The
-- `/projects/{slug}/tests/{testId}` destination route already treats its
-- `projectSlug` segment as DECORATIVE back-link context, not an FK
-- (`lib/tests/load-test-detail.ts`: "projectSlug is the route's display /
-- back-link context ... not by project"). This migration derives a
-- representative project for display + the route segment from the Test's
-- FIRST chained ATC (test_steps.position = 1, which always exists — a Test
-- cannot be created with an empty chain and steps are insert-only/RESTRICT).
--
-- CAP: 5 rows per entity group, decided in SQL via p_limit (clamped to a
-- hard ceiling of 5 regardless of what the caller requests — comment 12407's
-- correction (c) removed the earlier self-ratified 20-total cap; there is no
-- independent total cap, so the natural ceiling across six groups is 30).
--
-- FAILURE PATHS: every branch of an unknown/foreign workspace, a below-
-- threshold or unparseable query, or a workspace the caller cannot see
-- collapses into an empty result — HTTP 200 with `[]`, never 403/404 (rule
-- 9 of the binding constraints).
--
-- NOTE: `create index ... concurrently` cannot run inside a Supabase
-- migration transaction. The five plain index builds below briefly lock
-- writes on their tables — accepted, these tables are small in this
-- workspace's current data volume (ruling's own note).

-- =============================================================================
-- 1. Expression GIN indexes (tests, projects, modules, bugs, runs)
-- =============================================================================

create index if not exists tests_title_tsv_gin_idx
  on public.tests using gin (to_tsvector('english', title));

create index if not exists projects_name_tsv_gin_idx
  on public.projects using gin (to_tsvector('english', name));

create index if not exists modules_name_tsv_gin_idx
  on public.modules using gin (to_tsvector('english', name));

create index if not exists bugs_title_tsv_gin_idx
  on public.bugs using gin (to_tsvector('english', title));

create index if not exists runs_test_title_tsv_gin_idx
  on public.runs using gin (to_tsvector('english', test_title));

-- =============================================================================
-- 2. bunkai_search_workspace
-- =============================================================================

drop function if exists public.bunkai_search_workspace(text, uuid, int);

create or replace function public.bunkai_search_workspace(
  p_query         text,
  p_workspace_id  uuid,
  p_limit         int default 5
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query  tsquery;
  v_limit  int;
begin
  -- Defensive clamp — the route validates 2..20 via zod, but the RPC is a
  -- public contract: stay self-consistent if called directly. The PER-GROUP
  -- ceiling is 5 regardless of what the caller asks for (comment 12407
  -- correction (c) — no independent total cap, but the per-group cap is not
  -- caller-adjustable upward).
  v_limit := least(greatest(coalesce(p_limit, 5), 1), 5);

  if p_query is null or btrim(p_query) = '' then
    return '[]'::jsonb;
  end if;

  if array_length(regexp_split_to_array(btrim(p_query), '\s+'), 1) = 1 then
    v_query := to_tsquery('english', regexp_replace(btrim(p_query), '[:&|!()<>*]', '', 'g') || ':*');
  else
    v_query := plainto_tsquery('english', p_query);
  end if;

  if v_query is null then
    return '[]'::jsonb;
  end if;

  -- group_order pins the canonical, fixed rendering order (ATCs, Tests,
  -- Projects, Modules, Bugs, Runs — comment 12407 correction (c)). UNION ALL
  -- does not itself guarantee the outer aggregate preserves branch order, so
  -- jsonb_agg below orders explicitly by this column rather than relying on
  -- incidental ordering.
  return coalesce(
    (
      select jsonb_agg(row_json order by group_order)
      from (
        -- ---------------------------------------------------------------
        -- ATCs
        -- ---------------------------------------------------------------
        (
          select 1 as group_order, jsonb_build_object(
            'entity_type', 'atc',
            'id', a.id,
            'name', a.title,
            'project_id', a.project_id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.atcs a
          join public.projects p on p.id = a.project_id
          where a.archived_at is null
            and a.tsv @@ v_query
            and p.workspace_id = p_workspace_id
          order by
            ts_rank(a.tsv, v_query) * exp(-greatest(0, extract(epoch from (now() - a.updated_at))) / 604800.0) desc,
            a.updated_at desc,
            a.title asc,
            a.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Tests (workspace-scoped; representative project = first chained ATC)
        -- ---------------------------------------------------------------
        (
          select 2 as group_order, jsonb_build_object(
            'entity_type', 'test',
            'id', t.id,
            'name', t.title,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.tests t
          join public.test_steps ts on ts.test_id = t.id and ts.position = 1
          join public.atcs a on a.id = ts.atc_id
          join public.projects p on p.id = a.project_id
          where to_tsvector('english', t.title) @@ v_query
            and t.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', t.title), v_query) * exp(-greatest(0, extract(epoch from (now() - t.updated_at))) / 604800.0) desc,
            t.updated_at desc,
            t.title asc,
            t.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Projects
        -- ---------------------------------------------------------------
        (
          select 3 as group_order, jsonb_build_object(
            'entity_type', 'project',
            'id', p.id,
            'name', p.name,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.projects p
          where to_tsvector('english', p.name) @@ v_query
            and p.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', p.name), v_query) desc,
            p.created_at desc,
            p.name asc,
            p.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Modules
        -- ---------------------------------------------------------------
        (
          select 4 as group_order, jsonb_build_object(
            'entity_type', 'module',
            'id', m.id,
            'name', m.name,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.modules m
          join public.projects p on p.id = m.project_id
          where m.archived_at is null
            and to_tsvector('english', m.name) @@ v_query
            and p.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', m.name), v_query) desc,
            m.created_at desc,
            m.name asc,
            m.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Bugs
        -- ---------------------------------------------------------------
        (
          select 5 as group_order, jsonb_build_object(
            'entity_type', 'bug',
            'id', b.id,
            'name', b.title,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.bugs b
          join public.projects p on p.id = b.project_id
          where to_tsvector('english', b.title) @@ v_query
            and b.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', b.title), v_query) * exp(-greatest(0, extract(epoch from (now() - b.updated_at))) / 604800.0) desc,
            b.updated_at desc,
            b.title asc,
            b.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Runs
        -- ---------------------------------------------------------------
        (
          select 6 as group_order, jsonb_build_object(
            'entity_type', 'run',
            'id', r.id,
            'name', r.test_title,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.runs r
          join public.projects p on p.id = r.project_id
          where to_tsvector('english', r.test_title) @@ v_query
            and r.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', r.test_title), v_query) * exp(-greatest(0, extract(epoch from (now() - r.updated_at))) / 604800.0) desc,
            r.updated_at desc,
            r.test_title asc,
            r.id asc
          limit v_limit
        )
      ) grouped
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.bunkai_search_workspace(text, uuid, int) from public, anon;
grant execute on function public.bunkai_search_workspace(text, uuid, int) to authenticated, service_role;
