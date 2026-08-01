-- 0049_recovery_cycle_report.sql — BK-47: compute per-user-story cycle time
-- (first failing run -> first subsequent all-passing run) from run/run_atcs
-- history only. No Bugs-domain read (Decision 1, ratified via Jira comment
-- "Scope resolution — run-data only, before Stage 1", 2026-08-01).
--
-- Adds:
--   * bunkai_report_project_recovery_cycles — membership-gated, whole-project,
--     unpaged read (mirrors bunkai_report_project_coverage/_runs — see below)
--
-- Conventions mirror bunkai_report_project_coverage (0048_project_coverage_report.sql)
-- and bunkai_report_project_runs (0041_run_project_report.sql): explicit-actor
-- contract, actor-bind guard raised FIRST (0. below), the SAME project_not_found
-- / P0002 for both "does not exist" and "exists but caller cannot read it"
-- (non-disclosure), read-level membership re-check via
-- bunkai_assert_actor_can_read_workspace (ANY active role, viewers included —
-- same access tier as the sibling Runs/Coverage reports on this screen),
-- schema-qualified body (search_path = ''), and the established grant/revoke
-- pattern.
--
-- SECURITY POSTURE (Decision 2 in the BK-47 implementation plan, independently
-- re-verified against the live schema before writing this function — this
-- run's own standing lesson from BK-49/BK-40: a SECURITY DEFINER RPC taking a
-- caller-supplied scope id is not an authorization control unless the
-- CALLER's own relationship to that exact scope is asserted AND the
-- disclosed rows are re-scoped to it in every CTE, not just gated once):
--
--   Chosen: SECURITY DEFINER + explicit p_actor_user_id, matching
--   bunkai_report_project_runs/_coverage — NOT bunkai_list_activity's
--   SECURITY INVOKER + RLS-only pattern.
--
--   Why NOT INVOKER (re-derived by reading the RLS policies directly, not
--   taken on the plan's word — see runs_select_workspace_member in
--   0031_runs.sql and the *_select_workspace_member policies in
--   0003_authoring.sql/0005_rls_helpers.sql): every SELECT policy on
--   runs/atcs/user_stories/modules gates at the WORKSPACE boundary only
--   (bunkai_is_workspace_member(workspace_id)); none of them know about
--   project_id. Within one workspace, RLS grants a member read access to
--   EVERY project's runs/atcs/user_stories equally — "project" is not an
--   RLS-visible boundary anywhere in this schema, only a filter predicate.
--   An INVOKER version of this RPC would therefore need the IDENTICAL
--   explicit `project_id = p_project_id` predicates in every CTE to be
--   correct; RLS buys zero extra isolation here beyond the workspace
--   boundary, which bunkai_assert_actor_can_read_workspace already gates
--   regardless of DEFINER/INVOKER.
--
--   The actually decisive reason DEFINER is REQUIRED (not just "equally
--   valid, pick one"): this report's API route calls createAdminClient()
--   (service-role) — the same calling convention as
--   bunkai_report_project_runs/_coverage (0041/0048's own header comments:
--   "route handlers run on the admin client, so auth.uid() is NULL and the
--   RLS SELECT policies return zero rows there"). The service-role client
--   bypasses RLS entirely regardless of whether the RPC is DEFINER or
--   INVOKER, so on THIS call path RLS provides zero protection either way —
--   every explicit project_id/actor check inside the function body is 100%
--   of the enforcement. INVOKER would not add safety here (the admin-client
--   call path bypasses RLS identically under either security mode) and would
--   only diverge from this report family's established convention for no
--   benefit. bunkai_list_activity's INVOKER choice is correct for ITS route,
--   which calls through principal.db (ADR-0001 Path B's RLS-scoped client,
--   never the admin client) — a genuinely different calling convention this
--   RPC does not share.
--
--   Every CTE below that touches atcs/user_stories/modules/runs re-asserts
--   project_id = p_project_id explicitly (never trusts a denormalized column
--   alone) — the disclosed rows are scoped to the exact project the
--   membership assert checked, closing the "assert one resource, disclose a
--   differently-scoped result" bug class found live twice this run
--   (bunkai_resolve_activity_actors / 0047, bunkai_create_bug / 0046) and
--   fixed once already in this exact report family
--   (bunkai_report_project_coverage's own scope-leak fix, applied hours
--   before this migration).
--
-- SCHEMA JOIN PATH (confirmed directly against 0002/0003/0004/0031 before
-- writing this — not assumed from the story's prose): a user story does not
-- execute runs directly. atcs -(user_story_id)-> user_stories is a direct,
-- mandatory FK (0004) — no need to traverse acceptance_criteria/
-- atc_acceptance_criteria the way the Coverage RPC does for ITS AC-level
-- rollup. atcs attach to a Run's timeline via run_atcs.atc_id -> atcs.id
-- (0031, "provenance only", nullable on delete set null — a run_atcs row
-- whose atc was since deleted is naturally excluded by the inner join below,
-- since it can no longer be attributed to any story). runs carries
-- project_id directly (0031). user_stories reach the project via
-- module_id -> modules.project_id (0002/0003).
--
-- ROLLUP FORMULA (the Database Design section's step-4 numbered item was cut
-- off in the synced plan text before the actual formula — pinned down here
-- from the ACs/business-rules directly, singular-cycle reading: "the clock",
-- "the first failing run", not a per-regression-episode series, consistent
-- with out-of-scope's exclusion of flakiness scoring):
--   first_fail_at  = MIN(finished_at) over this story's 'red' data points.
--   first_green_at = MIN(finished_at) over this story's 'green' data points
--                    that occur AFTER first_fail_at (a pre-existing pass from
--                    before the story ever failed does not count as a
--                    recovery).
--   state = 'no_cycle'    when first_fail_at is null (AC3)
--           'recovered'   when first_fail_at and first_green_at are both set
--                         (AC1)
--           'in_progress' when first_fail_at is set but no qualifying green
--                         followed it yet (AC2)
-- A story is included in `items` whenever at least one candidate run touches
-- it (any run_atcs row whose atc resolves to that story), matching the
-- plan's own "one row per story with >=1 qualifying data point — 'stories
-- with run history'" framing read literally: "qualifying data point" =
-- "a candidate run touched this story", not "produced a clean verdict". A
-- story is OMITTED from `items` only when ZERO candidate runs ever touched
-- it (no run history at all) — a story touched only by ambiguous/partial
-- runs (see below) still gets a row, with state 'no_cycle' (no red verdict
-- was ever recorded for it either).
--
-- VERDICT PER (run, story) — one detail the plan's 3-way enumeration didn't
-- literally cover: a run touching a story via a MIX of 'passed' and
-- 'skipped'/'pending' run_atcs (no 'failed'/'blocked') is treated as
-- excluded/ambiguous, not green — asserting "green" for a partially-skipped
-- run would be a false-positive recovery signal (some of the story's
-- coverage was never actually re-verified in that run). 'red' is checked
-- first and wins over everything else (bool_or failed/blocked); only when
-- nothing failed/blocked does "every touching row is 'passed'" (bool_and)
-- qualify as green; anything else (a partial mix) contributes no verdict.
--
-- Terminal-only candidate runs (Decision 4): 'running'/'aborted' never
-- contribute a red/green data point. finished_at (not started_at) is the
-- event timestamp used throughout — it is guaranteed non-null for every
-- candidate row (bunkai_finish_run/0037 always sets it on the passed/failed
-- transition) and represents the moment the verdict was actually recorded,
-- the more defensible reading for a "time to green" metric than the run's
-- start time.
--
-- SOFT DELETE (not named in the plan's Database Design section — found by
-- reading the schema directly, not assumed): modules/user_stories/
-- acceptance_criteria/atcs all carry `archived_at` (0014_module_soft_delete.sql).
-- proj_user_stories excludes archived Modules/Stories, matching every sibling
-- report's convention (bunkai_report_project_coverage). Archived ATCs are
-- deliberately NOT excluded from the run-history join — a Run's recorded
-- verdict is immutable historical evidence, independent of later archiving
-- the ATC artifact itself (see proj_user_stories' own comment below).
--
-- No new custom SQLSTATE — reuses the established project_not_found / P0002
-- convention. No new index: EXPLAINed directly against live data before
-- shipping (see PR description) — the existing
-- runs_project_id_status_started_at_idx (0041) already serves the
-- project_id+status equality predicate on `runs`, and run_atcs_run_id_idx
-- (0031) / atcs_user_story_id_idx (0004) already cover the remaining joins:
-- a small, bounded, unpaged report, same shape as Coverage.

create or replace function public.bunkai_report_project_recovery_cycles(
  p_actor_user_id uuid,
  p_project_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_result       jsonb;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which
  --    the parameter IS the identity; a present-but-different uid is a spoof
  --    and collapses into the missing-Project answer (non-disclosure).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Project, then re-check READ membership. Both failures
  --    raise the identical P0002 (non-disclosure) — mirrors
  --    bunkai_report_project_coverage/_runs exactly.
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  with proj_user_stories as (
    -- Every non-archived User Story anchored to a non-archived Module of
    -- THIS Project. module_id -> modules.project_id is the actual
    -- project-scope boundary for the story/module projection (mirrors
    -- bunkai_report_project_coverage's proj_modules CTE reasoning — RLS on
    -- user_stories/modules only gates the workspace boundary, this predicate
    -- is the real enforcement). `archived_at is null` on both sides: not
    -- named in the plan's Database Design section, but modules/user_stories/
    -- acceptance_criteria/atcs all carry the same soft-delete column
    -- (0014_module_soft_delete.sql) and every sibling report on this screen
    -- (bunkai_report_project_coverage) already excludes archived rows from
    -- its projection — an archived Story is content-lifecycle-hidden from
    -- every other active view and must not resurface here. Archived ATCs are
    -- deliberately NOT filtered out of the run-history join below: a Run's
    -- recorded verdict is immutable historical evidence of what actually
    -- happened, unaffected by later archiving the ATC artifact itself.
    select us.id as user_story_id, us.title, us.external_id,
           m.id as module_id, m.path as module_path
      from public.user_stories us
      join public.modules m on m.id = us.module_id
      where m.project_id = p_project_id
        and us.archived_at is null
        and m.archived_at is null
  ),
  candidate_runs as (
    -- Terminal runs of THIS Project only (Decision 4: 'running'/'aborted'
    -- excluded). `r.project_id = p_project_id` is the actual project-scope
    -- enforcement — runs_select_workspace_member (0031) only gates the
    -- workspace boundary, same reasoning as 0041/0048's identical predicate.
    select r.id, r.finished_at
      from public.runs r
      where r.project_id = p_project_id
        and r.status in ('passed', 'failed')
  ),
  run_story_verdict as (
    -- Per-(run, user_story) verdict. `a.project_id = p_project_id`
    -- re-asserted explicitly even though a Run's own touched ATCs are
    -- same-project by construction (bunkai_create_run snapshots a
    -- single-project chain, 0031) — never trust a denormalized column alone
    -- for a scope boundary (mirrors 0048's ac_state CTE reasoning verbatim).
    select
      cr.id as run_id,
      cr.finished_at,
      pus.user_story_id,
      bool_or(ra.status in ('failed', 'blocked')) as any_failed,
      bool_and(ra.status = 'passed') as all_passed
      from candidate_runs cr
      join public.run_atcs ra on ra.run_id = cr.id
      join public.atcs a on a.id = ra.atc_id and a.project_id = p_project_id
      join proj_user_stories pus on pus.user_story_id = a.user_story_id
      group by cr.id, cr.finished_at, pus.user_story_id
  ),
  story_events as (
    -- Collapse each (run, story) pair to one verdict; a partial mix (neither
    -- a clean all-pass nor an any-fail signal) contributes no verdict at all
    -- (see header comment).
    select
      user_story_id,
      finished_at,
      case
        when any_failed then 'red'
        when all_passed then 'green'
        else null
      end as verdict
      from run_story_verdict
  ),
  story_first_fail as (
    select user_story_id, min(finished_at) as first_fail_at
      from story_events
      where verdict = 'red'
      group by user_story_id
  ),
  story_first_green_after_fail as (
    select se.user_story_id, min(se.finished_at) as first_green_at
      from story_events se
      join story_first_fail sf on sf.user_story_id = se.user_story_id
      where se.verdict = 'green'
        and se.finished_at > sf.first_fail_at
      group by se.user_story_id
  ),
  story_rollup as (
    -- Base population: every story with >=1 candidate run touching it at
    -- all (run_story_verdict), regardless of whether that run produced a
    -- red/green/ambiguous verdict — matches the plan's literal "stories with
    -- run history" framing (see header comment).
    select
      touched.user_story_id,
      sf.first_fail_at,
      sfg.first_green_at,
      case
        when sf.first_fail_at is null then 'no_cycle'
        when sfg.first_green_at is not null then 'recovered'
        else 'in_progress'
      end as state
      from (select distinct user_story_id from run_story_verdict) touched
      left join story_first_fail sf on sf.user_story_id = touched.user_story_id
      left join story_first_green_after_fail sfg on sfg.user_story_id = touched.user_story_id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_story_id', pus.user_story_id,
          'title', pus.title,
          'external_id', pus.external_id,
          'module_id', pus.module_id,
          'module_path', pus.module_path,
          'first_fail_at', sr.first_fail_at,
          'first_green_at', sr.first_green_at,
          'state', sr.state
        -- Deterministic default order: by module, then story title, then id
        -- (tiebreaker for duplicate titles) — the UI's own sort/columns
        -- rendering is a later slice's concern, not this RPC's.
        ) order by pus.module_path, pus.title, pus.user_story_id
      )
      from story_rollup sr
      join proj_user_stories pus on pus.user_story_id = sr.user_story_id
    ), '[]'::jsonb),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_report_project_recovery_cycles(uuid, uuid) from public, anon;
grant execute on function public.bunkai_report_project_recovery_cycles(uuid, uuid) to authenticated, service_role;
