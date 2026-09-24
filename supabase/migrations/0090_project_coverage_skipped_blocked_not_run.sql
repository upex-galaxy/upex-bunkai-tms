-- Migration: 0090 — bunkai_report_project_coverage: skipped and blocked runs
-- are NOT executed coverage (BK-1081, Defect, High; semantics decided on
-- BK-1083 / BK-46 by the AI Product Owner, 2026-09-24)
--
-- THE BUG (0050_project_coverage_report_real_execution_source.sql, live —
-- the live prosrc was verified byte-identical to 0050's body before writing
-- this file): ac_state classified an ATC as "not run" only when its most
-- recent run_atcs.status was 'pending':
--
--   bool_or(coalesce(ars.status, 'pending') = 'pending')
--
-- run_atcs.status is constrained to pending | passed | failed | blocked |
-- skipped (0031_runs.sql). 'skipped' (the step was never exercised: run
-- aborted, finished early, or swept for inactivity — 0036/0037/0067/0075) and
-- 'blocked' (the step could not be exercised) therefore fell through into
-- 'executed', so an AC whose only ATC was never actually run was reported as
-- executed coverage and its module as 'fully_covered'. On staging this hit
-- 130 of the 152 ACs with any run history (QA report, BK-1081).
--
-- THE FIX: "executed" is now an explicit ALLOWLIST of the two statuses that
-- mean the ATC was actually exercised — 'passed' and 'failed' (coverage and
-- health are separate axes, PO decision Q2: a failed ATC still covers its
-- AC). Everything else — no run at all (NULL -> 'pending'), 'pending',
-- 'skipped', 'blocked', and any status a future migration might add — reads
-- as not run. Allowlisting the executed side (rather than denylisting
-- 'pending','skipped','blocked') fails closed: a new run_atcs status can
-- never silently inflate coverage again.
--
-- Point-in-time semantics are unchanged (PO decision Q1): each ATC still
-- resolves to the status of its MOST RECENT run only, so an ATC that passed
-- in an earlier run and was skipped/blocked in its latest run now reads as
-- not run. Accepted on purpose (AI PO decision, option A1, BK-1083). The Q3
-- union rule is unchanged.
--
-- Changed: the two predicate sites in ac_state (has_unrun and the state
-- case). Everything else — signature, SECURITY DEFINER, search_path = '',
-- the step-0 actor bind, project resolution + non-disclosure P0002,
-- bunkai_assert_actor_can_read_workspace, atc_real_status, module_rollup, the
-- jsonb wire contract, VOLATILE — is byte-for-byte 0050. Callers
-- (lib/supabase/rpc.ts, the project + workspace coverage routes,
-- lib/home/coverage.ts, the metrics page) need no change.
--
-- Grants: `create or replace` keeps the existing ACL. Live ACL before this
-- migration: postgres, authenticated, service_role, qa_inspector_rw. It is
-- deliberately NOT granted to qa_inspector_ro: 0086 gives _ro only STABLE /
-- IMMUTABLE DEFINER functions and this one is VOLATILE (unchanged), so no
-- 0086/0088-style re-grant is needed or wanted. The authenticated /
-- service_role re-assert below is the same belt-and-braces as 0050.

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
  atc_real_status as (
    -- Per-ATC real execution status — see header. One row per atc_id: the
    -- status from its most recent run_atcs row, across any run.
    select distinct on (ra.atc_id)
      ra.atc_id,
      ra.status
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
      where ra.atc_id is not null
      order by ra.atc_id, r.started_at desc, ra.id desc
  ),
  ac_state as (
    -- Per-AC coverage state (Q1/Q2/Q3 collapsed into one 3-way case — see
    -- 0048's header comment). Only non-archived ATCs count as coverage, AND
    -- only ATCs belonging to THIS project (`a.project_id = p_project_id`) —
    -- the atc_acceptance_criteria join table has no DB-level constraint tying
    -- an ATC and an AC to the same project, so this predicate is the actual
    -- project-scope enforcement here. "not run" is read from
    -- atc_real_status: anything but passed/failed (0090 header, BK-1081).
    select
      s.ac_id, s.ac_title, s.ac_position,
      s.user_story_id, s.user_story_title, s.module_id,
      count(a.id) as linked_count,
      bool_or(coalesce(ars.status, 'pending') not in ('passed', 'failed')) as has_unrun,
      case
        when count(a.id) = 0 then 'uncovered'
        when bool_or(coalesce(ars.status, 'pending') not in ('passed', 'failed')) then 'not_run'
        else 'executed'
      end as state
      from ac_scope s
      left join public.atc_acceptance_criteria aac on aac.acceptance_criterion_id = s.ac_id
      left join public.atcs a on a.id = aac.atc_id
        and a.archived_at is null
        and a.project_id = p_project_id
      left join atc_real_status ars on ars.atc_id = a.id
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
        -- module_position has no per-project uniqueness constraint, so tie
        -- on module_id for a deterministic order regardless of duplicate
        -- positions.
        ) order by mr.module_position, mr.module_id
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
        -- ac_position is unique only per user_story_id, not per module, so
        -- two ACs from different stories in the same module can tie — add
        -- ac_id as a deterministic final tiebreaker.
        ) order by pm.position, cs.ac_position, cs.ac_id
      ), '[]'::jsonb)
      from ac_state cs
      join proj_modules pm on pm.id = cs.module_id
      where cs.state = 'uncovered'
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Re-assert the 0039-established pattern. `create or replace` keeps the
-- existing ACL, so this is idempotent belt-and-braces, not a change.
revoke execute on function public.bunkai_report_project_coverage(uuid, uuid) from public, anon;
grant execute on function public.bunkai_report_project_coverage(uuid, uuid) to authenticated, service_role;
