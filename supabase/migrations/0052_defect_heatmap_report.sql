-- 0052_defect_heatmap_report.sql — BK-42: per-module defect heatmap (count +
-- week-over-week trend) for a chosen window (7d/30d/90d, default 30d).
--
-- Adds:
--   * bunkai_report_project_defect_heatmap — membership-gated, whole-project,
--     unpaged read (mirrors bunkai_report_project_recovery_cycles /
--     bunkai_report_project_coverage, 0049/0048_project_coverage_report.sql).
--
-- Ratified 2026-08-01 (Jira BK-42 comment "PO + Dev Ratification — explicit
-- live authorization, 2026-08-01", delegated live by Ely, project owner):
--   * No materialized view / stats substrate — a live, unpaginated,
--     project-scoped aggregate RPC, same shape/cost class as the Coverage and
--     Recovery-cycle reports on this same Metrics/Bugs surface (small,
--     bounded, indexed on project_id — bugs_project_id_created_at_idx,
--     0046_bugs.sql).
--   * Module = the existing first-class Module tree entity; each cell is one
--     ACTIVE (non-archived) module; a parent's defect_count is its own bugs
--     PLUS every descendant module's bugs (subtree rollup via path-prefix
--     match, same LIKE-prefix technique as bunkai_list_bugs/0051), and the
--     child module keeps its own separate, non-collapsed cell. Descendant
--     bugs are counted even when the descendant module has since been
--     archived — a filed defect is immutable historical evidence, unaffected
--     by later archiving the module artifact itself (same reasoning already
--     applied to archived ATCs in 0049's run-history join).
--   * Week-over-week trend is a FIXED 7-day UTC bucket vs. the immediately
--     preceding 7-day UTC bucket — a rolling trailing window anchored to
--     `now()`, independent of the selected window (AC-4/AC-5/AC-6,
--     business-rules.md). This RPC returns the two raw bucket counts only
--     (`current_week_count`, `previous_week_count`); trend_direction/
--     trend_pct derivation (including the zero-baseline non-infinite-percent
--     boundary from the AC boundary scenario) is computed in
--     lib/metrics/defect-heatmap.ts, not here — mirrors 0049's own
--     "RPC returns raw, TS derives" split (Decision 3 there).
--   * Fixed windows only: '7d' | '30d' | '90d'. Default '30d' is handled by
--     the API route/Zod layer, NOT this RPC (p_window is required here). An
--     unsupported window raises a backstop error (Zod is the primary guard,
--     same "RPC backstop" convention as bug_severity_invalid/0046) — a
--     custom SQLSTATE below, mapped by the route to `bad_request` (400),
--     per AC-11's literal wording for THIS specific error (unlike its 403,
--     which is rejected below).
--   * AC-11's literal "403" for unauthorized project access is REJECTED per
--     the same ratification comment: every sibling aggregate-report RPC on
--     this codebase collapses "missing project" and "exists but caller is
--     not a member" into the IDENTICAL 404 (P0002, non-disclosure) — a
--     distinct 403 would itself leak the project's existence. This RPC
--     follows that established convention, not AC-11's literal wording for
--     the auth case (lib/metrics/errors.ts maps P0002 -> `not_found`/404,
--     same as reportProjectRecoveryCycles/reportProjectCoverage).
--
-- SECURITY POSTURE (ADR-0012): SECURITY DEFINER + explicit p_actor_user_id,
-- matching bunkai_report_project_coverage/_recovery_cycles/_runs — NOT
-- bunkai_list_bugs's SECURITY INVOKER pattern. This report's API route calls
-- createAdminClient() (service-role), the same calling convention as its
-- three siblings — RLS provides zero protection on that call path regardless
-- of DEFINER/INVOKER, so the explicit actor-bind guard (step 0) plus the
-- explicit `project_id = p_project_id` / path-prefix re-assertion in every
-- CTE below is 100% of the enforcement (mirrors 0049's header reasoning
-- verbatim — same call path, same conclusion).
--
-- No new index: bugs_project_id_created_at_idx (0046_bugs.sql) already
-- covers the project_id + created_at range predicate this RPC filters on;
-- modules_project_id_idx (0002_projects_modules.sql) covers the
-- active-module scan. Same "small, bounded, unpaged" cost class as
-- Coverage/Recovery-cycle (ratification Decision 7) — not a Dev-start
-- blocker.
--
-- Custom SQLSTATE: reuses project_not_found / P0002 (established convention)
-- for the auth/non-disclosure path. A malformed p_window value raises
-- 45308 defect_heatmap_invalid_window (RPC backstop only — the API route's
-- own validation is the primary guard, same convention as
-- bug_severity_invalid/0046).
--
-- Applied to the shared Supabase project 2026-08-02 (owner-approved, per the
-- `autonomous_delivery.migrations: confirm` gate) — see the escalation log
-- entry filed alongside this migration for the review trail. Live definition
-- diffed against this file post-apply; no drift. Grants verified
-- (`authenticated`/`service_role` only, no `anon`/`public`).

create or replace function public.bunkai_report_project_defect_heatmap(
  p_actor_user_id uuid,
  p_project_id    uuid,
  p_window        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id        uuid;
  v_window_days         int;
  v_window_start        timestamptz;
  v_current_week_start  timestamptz;
  v_previous_week_start timestamptz;
  v_result              jsonb;
begin
  -- 0. Actor bind (ADR-0012). NULL auth.uid() = service-role / admin client,
  --    for which the parameter IS the identity; a present-but-different uid
  --    is a spoof and collapses into the missing-Project answer
  --    (non-disclosure) — mirrors 0049's step 0 verbatim.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Project, then re-check READ membership. Both failures
  --    raise the identical P0002 (non-disclosure) — mirrors
  --    bunkai_report_project_coverage/_recovery_cycles exactly. AC-11's
  --    literal "403" is deliberately not implemented (see header).
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. Validate the window (RPC backstop; the API route's own validation is
  --    the primary guard, same "RPC backstop" convention as
  --    bug_severity_invalid/0046).
  v_window_days := case p_window
    when '7d' then 7
    when '30d' then 30
    when '90d' then 90
    else null
  end;
  if v_window_days is null then
    raise exception 'defect_heatmap_invalid_window' using errcode = '45308';
  end if;

  v_window_start := now() - (v_window_days || ' days')::interval;
  v_current_week_start := now() - interval '7 days';
  v_previous_week_start := now() - interval '14 days';

  with active_modules as (
    -- One cell per ACTIVE module (archived modules excluded from the
    -- heatmap by default — same active-module default as bunkai_list_bugs's
    -- module filter, 0051_bugs_list.sql).
    select m.id, m.name, m.path
      from public.modules m
      where m.project_id = p_project_id
        and m.archived_at is null
  ),
  subtree_bugs as (
    -- Every bug whose OWN module is `am` or a descendant of `am` (path-prefix
    -- match — same LIKE-prefix technique as bunkai_list_bugs's module filter,
    -- 0051_bugs_list.sql). `bm.project_id = p_project_id` re-asserted
    -- explicitly even though a bug's module is same-project by construction
    -- (bunkai_create_bug's own cross-project guard, 0046_bugs.sql) — never
    -- trust a denormalized column alone for a scope boundary (mirrors 0049's
    -- run_story_verdict CTE reasoning verbatim). Descendant bugs count even
    -- when the descendant module is itself archived (see header) — no
    -- archived_at filter on `bm`.
    select am.id as module_id, b.id as bug_id, b.created_at
      from active_modules am
      join public.modules bm
        on bm.project_id = p_project_id
        and (bm.path = am.path or bm.path like am.path || '/%')
      join public.bugs b
        on b.module_id = bm.id
        and b.project_id = p_project_id
  ),
  counts as (
    select
      module_id,
      count(*) filter (where created_at >= v_window_start) as defect_count,
      count(*) filter (where created_at >= v_current_week_start) as current_week_count,
      count(*) filter (
        where created_at >= v_previous_week_start and created_at < v_current_week_start
      ) as previous_week_count
      from subtree_bugs
      group by module_id
  )
  select jsonb_build_object(
    'window', p_window,
    'generated_at', now(),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'module_id', am.id,
          'module_name', am.name,
          'module_path', am.path,
          'defect_count', coalesce(c.defect_count, 0),
          'current_week_count', coalesce(c.current_week_count, 0),
          'previous_week_count', coalesce(c.previous_week_count, 0)
        )
        order by am.path, am.id
      )
      from active_modules am
      left join counts c on c.module_id = am.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_report_project_defect_heatmap(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_report_project_defect_heatmap(uuid, uuid, text) to authenticated, service_role;
