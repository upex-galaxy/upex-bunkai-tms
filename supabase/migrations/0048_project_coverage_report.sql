-- 0048_project_coverage_report.sql — BK-46: surface untested ACs and modules
-- with a "not run" filter
--
-- Adds:
--   * bunkai_report_project_coverage — membership-gated, whole-project
--     coverage rollup (no pagination — see Technical Decision below)
--
-- Conventions mirror bunkai_report_project_runs (0041_run_project_report.sql):
-- explicit-actor contract, actor-bind guard raised FIRST (0. below), the
-- SAME project_not_found / P0002 for both "does not exist" and "exists but
-- caller cannot read it" (non-disclosure), read-level membership re-check via
-- bunkai_assert_actor_can_read_workspace (ANY active role, viewers included —
-- PO decision Q5: this is a read-only reporting view, same access level as
-- bunkai_report_project_runs and the Tests/ATC read endpoints, not a
-- privileged QA-only screen), schema-qualified body (search_path = ''), and
-- the established grant/revoke pattern.
--
-- Coverage-state model (PO decisions Q1/Q2/Q3, recorded on the BK-46 Jira
-- ticket, comments 2026-06-27 by Carlos Alberto Chiavassa):
--   Q1 — "not run" = atcs.status = 'unrun' (current point-in-time value, not
--        execution history — no history table is consulted).
--   Q2 — "fully covered" = every AC in the module has at least one linked ATC
--        AND that ATC's status != 'unrun'. A module whose ACs are linked only
--        to unrun ATCs is NOT fully covered.
--   Q3 — union rule: an AC with N linked ATCs appears in the "not run" filter
--        if AT LEAST ONE linked ATC is 'unrun' — one executed ATC does not
--        clear pending coverage from the others.
-- These three collapse into ONE 3-way, mutually exclusive per-AC state
-- (see the ac_state CTE): uncovered (zero linked non-archived ATCs) / not_run
-- (>=1 linked ATC, at least one 'unrun') / executed (>=1 linked ATC, none
-- 'unrun'). Archived ATCs never count as coverage (atcs.archived_at is null
-- filter throughout) — matches this codebase's universal soft-delete
-- convention (0014/0016/0017), and closes the ATP's own "SCHEMA GAP (future)"
-- note: atcs.archived_at already exists live (used since 0021/0027-0029), the
-- gap it warned about is already here, not hypothetical.
--
-- Technical Decision: no pagination, no query params. A project's module/AC
-- coverage rollup is small and bounded (unlike the Runs report, which is
-- append-heavy and genuinely unbounded) — one full-payload read, matching the
-- mockup's own client-side-only filtering (no server round-trip per filter
-- change).

create or replace function public.bunkai_report_project_coverage(
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
  --    bunkai_report_project_runs exactly.
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  with proj_modules as (
    -- Every non-archived Module of this Project. This is the project-scope
    -- boundary for the whole report (mirrors bunkai_report_project_runs's own
    -- `r.project_id = p_project_id` reasoning: RLS gates at the workspace
    -- boundary only, this predicate is the actual project-scope enforcement).
    select m.id, m.name, m.position
      from public.modules m
      where m.project_id = p_project_id
        and m.archived_at is null
  ),
  ac_scope as (
    -- Every non-archived AC belonging to a non-archived User Story inside a
    -- non-archived Module of this Project. AC/User-Story/Module hierarchy is
    -- the authoritative scope — NOT atcs.module_id/user_story_id (an ATC's
    -- own denormalized columns are its authoring context, not proof it covers
    -- a given AC's module).
    select
      ac.id as ac_id,
      ac.title as ac_title,
      ac.position as ac_position,
      us.id as user_story_id,
      us.title as user_story_title,
      pm.id as module_id
      from public.acceptance_criteria ac
      join public.user_stories us on us.id = ac.user_story_id
      join proj_modules pm on pm.id = us.module_id
      where ac.archived_at is null
        and us.archived_at is null
  ),
  ac_state as (
    -- Per-AC coverage state (Q1/Q2/Q3 collapsed into one 3-way case — see
    -- header comment). Only non-archived ATCs count as coverage.
    select
      s.ac_id, s.ac_title, s.ac_position,
      s.user_story_id, s.user_story_title, s.module_id,
      count(a.id) as linked_count,
      bool_or(a.status = 'unrun') as has_unrun,
      case
        when count(a.id) = 0 then 'uncovered'
        when bool_or(a.status = 'unrun') then 'not_run'
        else 'executed'
      end as state
      from ac_scope s
      left join public.atc_acceptance_criteria aac on aac.acceptance_criterion_id = s.ac_id
      left join public.atcs a on a.id = aac.atc_id and a.archived_at is null
      group by s.ac_id, s.ac_title, s.ac_position, s.user_story_id, s.user_story_title, s.module_id
  ),
  module_rollup as (
    -- Right join proj_modules so a Module with ZERO ACs still gets a row
    -- (ATP Group 5 #1 — "module with no user stories" must not error).
    select
      pm.id as module_id,
      pm.name as module_name,
      pm.position as module_position,
      count(cs.ac_id) as ac_total,
      count(cs.ac_id) filter (where cs.state = 'uncovered') as ac_uncovered,
      count(cs.ac_id) filter (where cs.state = 'not_run') as ac_not_run,
      count(cs.ac_id) filter (where cs.state = 'executed') as ac_executed,
      case
        when count(cs.ac_id) = 0 then 'no_acs'
        when count(cs.ac_id) filter (where cs.state = 'uncovered') > 0 then 'uncovered'
        when count(cs.ac_id) filter (where cs.state = 'not_run') > 0 then 'not_run'
        else 'fully_covered'
      end as status
      from proj_modules pm
      left join ac_state cs on cs.module_id = pm.id
      group by pm.id, pm.name, pm.position
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'ac_total', count(*),
        'ac_bound', count(*) filter (where state <> 'uncovered'),
        'ac_executed', count(*) filter (where state = 'executed'),
        'modules_total', (select count(*) from module_rollup),
        'modules_fully_covered', (select count(*) from module_rollup where status = 'fully_covered')
      )
      from ac_state
    ),
    'modules', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'module_id', mr.module_id,
          'module_name', mr.module_name,
          'ac_total', mr.ac_total,
          'ac_uncovered', mr.ac_uncovered,
          'ac_not_run', mr.ac_not_run,
          'ac_executed', mr.ac_executed,
          'status', mr.status
        ) order by mr.module_position
      ), '[]'::jsonb)
      from module_rollup mr
    ),
    'no_coverage', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'ac_id', cs.ac_id,
          'ac_title', cs.ac_title,
          'user_story_id', cs.user_story_id,
          'user_story_title', cs.user_story_title,
          'module_id', cs.module_id,
          'module_name', pm.name
        ) order by pm.position, cs.ac_position
      ), '[]'::jsonb)
      from ac_state cs
      join proj_modules pm on pm.id = cs.module_id
      where cs.state = 'uncovered'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_report_project_coverage(uuid, uuid) from public, anon;
grant execute on function public.bunkai_report_project_coverage(uuid, uuid) to authenticated, service_role;
