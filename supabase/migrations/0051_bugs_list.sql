-- Migration: 0051 — TMS-Defect List read RPC (BK-41 Slice 1: DB)
-- Authored: 2026-08-01
--
-- NOTE ON NUMBERING: highest allocated so far is 0050
-- (0050_project_coverage_report_real_execution_source.sql), confirmed against
-- the local migrations directory AND the live project's migration ledger
-- (mcp__supabase__list_migrations, project fmbpikzpkafptqximhxn) at Stage 2
-- start — 0051 is genuinely free right now.
--
-- Filtered, paginated, aggregate-bearing read RPC over the `bugs` table
-- BK-40 already shipped (0046_bugs.sql). No schema/RLS change to `bugs`
-- itself — additive index + one new RPC only. `bunkai_list_project_bugs`
-- (0046) is left in place, untouched, per this story's own Decision 14 — its
-- header already predicted this replacement ("BK-41 replaces this RPC with
-- proper keyset pagination + filters").
--
-- Adds:
--   * bugs_project_id_severity_created_at_id_idx — the keyset-seek index the
--     new severity-primary sort needs (0046's own bugs_project_id_created_at_idx
--     lacks the severity-first ordering this query's seek predicate requires).
--   * bunkai_list_bugs — SECURITY INVOKER (the clause is simply omitted —
--     plpgsql defaults to INVOKER), no actor parameter.
--
-- Why SECURITY INVOKER, not SECURITY DEFINER + p_actor_user_id (ratified
-- Decision 3, Jira comment 12071, BK-41 PO+Dev Ratification 2026-08-01):
--   * bugs_select_workspace_member (0046_bugs.sql, "any active workspace
--     member") already does exactly the scoping this function needs — there
--     is no privilege gap for a DEFINER function to bridge.
--   * A DEFINER function taking a caller-supplied identity/scope parameter
--     is precisely the class ADR-0012 tracks as a cross-cutting invariant:
--     an actor bind AND separate result scoping, both required, both proven
--     by a DB-integration test, both easy to get half-right (ADR-0012's own
--     audit found exactly that pattern live on this project once already,
--     BK-49's bunkai_resolve_activity_actors, and pre-merge once more on
--     BK-40's own bunkai_create_bug). Deleting the identity parameter — and
--     letting the caller's own session drive RLS instead — removes the class
--     by construction rather than asking a reviewer to catch a missing
--     guard. ADR-0012's own words: "a function that cannot be told who the
--     caller is cannot be lied to."
--   * There is therefore NO `auth.uid() <> p_actor_user_id` check anywhere in
--     this file, and no p_actor_user_id parameter to check it against. This
--     function's authorization IS `bugs_select_workspace_member` evaluating
--     against the CALLING role's own auth.uid() on every call path (cookie
--     SSR session or PAT-minted user JWT) — the same load-bearing property
--     bunkai_list_activity (0045_activity_stream.sql) documents for itself,
--     which this migration follows line-for-line.
--
-- Module subtree (Decision 7, mirrors bunkai_search_atcs, 0027_atc_search.sql,
-- verbatim technique): modules.path is a materialized slash-separated path
-- (0002_projects_modules.sql). The descendant set of p_module_id is that
-- module plus every module whose path is prefixed by `<path>/` in the SAME
-- project — a LIKE-prefix match, no recursive CTE. A p_module_id outside
-- p_project_id (or nonexistent) resolves v_module_path to NULL, which the
-- predicate below turns into zero rows, never a disclosed error — the
-- route's own two-step check (Decision 9/10: confirm project visible, THEN
-- disclose module_not_in_project) is the primary, disclosed gate; this RPC's
-- own behavior here is defense in depth, matching bunkai_search_atcs' own
-- non-disclosure fallback for the identical shape.
--
-- Archived modules (Decision 12): bugs whose OWN module is archived are
-- excluded UNCONDITIONALLY — not only when the caller filters by an archived
-- module — so "no defects match" reads the same regardless of which module a
-- caller picks. This does NOT prune an archived module's non-archived
-- descendants out of a subtree query; only bugs filed directly against an
-- archived module are hidden. `include_archived=true` stays out of v1
-- (Decision 12's own follow-up note).
--
-- Filters (Decision 6): p_statuses/p_severities are OR-within-field (array
-- membership via `= any(...)`), AND-across-fields (both predicates applied
-- together). NULL means "no filter on this field" for either array — the
-- n=1 single-value case (AC-3/AC-4/AC-5) is just a one-element array.
--
-- Sort (Decision 5, sourced from the frozen mockup's own
-- `filteredBugs().sort((a,b) => a.sev.localeCompare(b.sev) || a.age - b.age)`):
-- severity ascending (P1..P4 — a plain text comparison already sorts
-- correctly since 'P1' < 'P2' < 'P3' < 'P4' lexicographically, no
-- rank-mapping CASE needed), then created_at desc, then id desc as the final
-- tie-break. Fixed, not user-configurable in v1.
--
-- Aggregates (AC-6/ATP-7, Risk 2): by_severity/by_status are computed over
-- the FULL filtered set (project/module-subtree/archived/status/severity
-- predicates — everything except the cursor and limit) in the SAME query as
-- the page, via the `filtered` CTE referenced a second time — never derived
-- client-side or from only the returned page.
--
-- Cursor (Decision 11): a bugs-local 3-field keyset (severity, created_at,
-- id), passed as three separate parameters — NOT lib/pagination/keyset-
-- cursor.ts's 2-field {timestamp,id} codec, which cannot carry the extra
-- severity-primary sort key without changing its two existing consumers'
-- (Runs, Activity) signature. The opaque-token / malformed-cursor-is-400
-- WIRE contract (lib/pagination/keyset-cursor.ts) is satisfied one layer up,
-- in lib/bugs/list-cursor.ts (Slice 2, not part of this migration) — this
-- RPC only ever sees the already-decoded three parts. All-three-null = first
-- page; a PARTIAL cursor (some but not all three supplied) is rejected
-- rather than silently degraded to page 1, mirroring bunkai_list_activity's
-- own activity_cursor_invalid (45214) shape with a new bugs-domain code.
--
-- Because the sort mixes directions per column (severity ASC, created_at
-- DESC, id DESC), the seek predicate cannot use a single row-comparison
-- operator (`(a,b,c) < (x,y,z)`) — it is written out as the explicit
-- three-branch OR a mixed-direction keyset requires:
--   severity > cursor_severity
--   OR (severity = cursor_severity AND created_at < cursor_created_at)
--   OR (severity = cursor_severity AND created_at = cursor_created_at AND id < cursor_id)
--
-- Custom SQLSTATE (bugs domain, class 45xxx, 453xx block — highest allocated
-- so far is 45307, 0046_bugs.sql):
--   45308  bugs_list_cursor_invalid  (some but not all three cursor parts supplied)

-- ============================================================================
-- 1. bugs_project_id_severity_created_at_id_idx — the keyset access path
-- ============================================================================
--
-- 0046's bugs_project_id_created_at_idx covers project_id + recency but
-- carries no severity column, which the severity-primary sort/seek needs to
-- stay index-compatible. Additive: the existing index stays, both are cheap
-- on this table's expected cardinality.

create index if not exists bugs_project_id_severity_created_at_id_idx
  on public.bugs (project_id, severity, created_at desc, id desc);

-- ============================================================================
-- 2. bunkai_list_bugs — filtered, paginated, aggregate-bearing list
-- ============================================================================

create or replace function public.bunkai_list_bugs(
  p_project_id        uuid,
  p_module_id         uuid default null,
  p_statuses          text[] default null,
  p_severities        text[] default null,
  p_limit             int default 30,
  p_cursor_severity   text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit        int;
  v_module_path  text;
  v_cursor_parts int;
  v_items        jsonb;
  v_fetched      int;
  v_aggregates   jsonb;
  v_next_cursor  jsonb;
  v_last         jsonb;
begin
  -- 1. Page size: clamp into 1..50, never unbounded (mirrors bunkai_list_activity;
  --    Decision 4's wire contract, honored here at the decoded-params layer).
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  -- 2. Cursor backstop: the keyset position is a TRIPLE. Zero supplied = first
  --    page; anything other than exactly zero or exactly three is not a
  --    position — raise rather than silently degrade to the first page
  --    (mirrors 0045's activity_cursor_invalid, 45214).
  v_cursor_parts := (case when p_cursor_severity is not null then 1 else 0 end)
    + (case when p_cursor_created_at is not null then 1 else 0 end)
    + (case when p_cursor_id is not null then 1 else 0 end);
  if v_cursor_parts not in (0, 3) then
    raise exception 'bugs_list_cursor_invalid' using errcode = '45308';
  end if;

  -- 3. Resolve the module subtree filter (when provided) to a path prefix,
  --    scoped to THIS project — a p_module_id belonging to another project
  --    (or that does not exist) leaves v_module_path null, which the
  --    predicate below turns into zero rows rather than a disclosed error.
  --    Not filtered on archived_at here on purpose — an archived ANCESTOR
  --    must not prune its still-active descendants out of the subtree; the
  --    per-row archived exclusion below (Decision 12) is scoped to each
  --    bug's OWN module only.
  if p_module_id is not null then
    select m.path into v_module_path
      from public.modules m
      where m.id = p_module_id and m.project_id = p_project_id;
  end if;

  -- 4-6. Full filtered set (no limit, no cursor) -> one keyset page (limit+1
  --      probe) -> aggregates computed over the FULL filtered set, all in one
  --      query so the aggregates and the page can never drift apart.
  with filtered as (
    select b.id, b.workspace_id, b.project_id, b.module_id, b.run_id,
           b.run_step_id, b.atc_id, b.title, b.severity, b.status,
           b.description, b.steps_to_reproduce, b.evidence_urls,
           b.created_by, b.created_at, b.updated_at,
           m.id as module_row_id, m.name as module_name, m.path as module_path
      from public.bugs b
      join public.modules m on m.id = b.module_id
      where b.project_id = p_project_id
        and m.archived_at is null
        and (
          p_module_id is null
          or (
            v_module_path is not null
            and (m.path = v_module_path or m.path like v_module_path || '/%')
          )
        )
        and (p_statuses is null or b.status = any(p_statuses))
        and (p_severities is null or b.severity = any(p_severities))
  ),
  page as (
    select *
      from filtered
      where (
        v_cursor_parts = 0
        or severity > p_cursor_severity
        or (severity = p_cursor_severity and created_at < p_cursor_created_at)
        or (severity = p_cursor_severity and created_at = p_cursor_created_at and id < p_cursor_id)
      )
      order by severity asc, created_at desc, id desc
      limit v_limit + 1
  ),
  kept as (
    select * from page order by severity asc, created_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'workspace_id', k.workspace_id,
                 'project_id', k.project_id,
                 'module_id', k.module_id,
                 'module', jsonb_build_object('id', k.module_row_id, 'name', k.module_name, 'path', k.module_path),
                 'run_id', k.run_id,
                 'run_step_id', k.run_step_id,
                 'atc_id', k.atc_id,
                 'title', k.title,
                 'severity', k.severity,
                 'status', k.status,
                 'description', k.description,
                 'steps_to_reproduce', k.steps_to_reproduce,
                 'evidence_urls', to_jsonb(k.evidence_urls),
                 'created_by', k.created_by,
                 'created_at', k.created_at,
                 'updated_at', k.updated_at
               ) order by k.severity asc, k.created_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page),
    (select jsonb_build_object(
       'by_severity', jsonb_build_object(
         'P1', count(*) filter (where severity = 'P1'),
         'P2', count(*) filter (where severity = 'P2'),
         'P3', count(*) filter (where severity = 'P3'),
         'P4', count(*) filter (where severity = 'P4')
       ),
       'by_status', jsonb_build_object(
         'open', count(*) filter (where status = 'open'),
         'in_progress', count(*) filter (where status = 'in_progress'),
         'resolved', count(*) filter (where status = 'resolved'),
         'closed', count(*) filter (where status = 'closed')
       )
     ) from filtered)
    into v_items, v_fetched, v_aggregates;

  -- 7. next_cursor: NULL when the probe row was absent (no further page).
  --    Otherwise the (severity, created_at, id) of the LAST row actually
  --    returned (mirrors 0045's own probe-based next_cursor shape).
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'severity', v_last -> 'severity',
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object('data', v_items, 'aggregates', v_aggregates, 'next_cursor', v_next_cursor);
end;
$$;

revoke execute on function public.bunkai_list_bugs(uuid, uuid, text[], text[], int, text, timestamptz, uuid) from public, anon;
grant execute on function public.bunkai_list_bugs(uuid, uuid, text[], text[], int, text, timestamptz, uuid) to authenticated, service_role;
