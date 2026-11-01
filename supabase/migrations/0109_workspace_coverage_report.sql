-- Migration: 0109 — bunkai_report_workspace_coverage: the workspace coverage
-- rollup in ONE call (BK-1169, Defect, High)
--
-- THE BUG: GET /api/v1/workspaces/{id}/coverage and the Home "Coverage" card
-- (lib/home/coverage.ts, BK-259) built the workspace figure by calling
-- bunkai_report_project_coverage once per project. A safety valve,
-- HOME_COVERAGE_MAX_PROJECTS = 60, failed the rollup above 60 projects so the
-- landing page never ran an unbounded fan-out. "QA Automation Workspace"
-- holds 1171 projects (staging, 2026-11-01), so it tripped the valve on every
-- request and the route answered 500 internal_error. Raising the number is
-- not a fix: one per-project call costs ~200 ms (each pays its own pass over
-- run_atcs), so 1171 calls at concurrency 4 is about a minute per load.
--
-- THE FIX (decision: "AI Tech Lead — Decision: how the workspace coverage
-- rollup scales past the project ceiling", PR body, BK-1169): the design the
-- BK-259 module header already prescribed for this case. One SECURITY
-- DEFINER function computes the same per-AC states for every project of the
-- workspace in one statement and returns only the kpi counts plus the project
-- count. It does NOT define coverage a second way: every CTE below is
-- bunkai_report_project_coverage's (0108) chain, widened from one project to
-- the workspace's projects, so the result equals the sum of the per-project
-- kpis by construction:
--
--   * proj_modules / ac_scope: the same non-archived Module -> User Story ->
--     AC hierarchy, carrying each AC's project_id.
--   * atc_real_status: 0108's ordering byte-for-byte. It is restricted to the
--     workspace's ATCs, which cannot change the row picked for any ATC (the
--     DISTINCT ON key is atc_id, and every row of one ATC passes or fails the
--     restriction together).
--   * ac_state: the same three-way case; `a.project_id = p_project_id`
--     becomes `a.project_id = s.project_id`, the AC's own project, which is
--     what the per-project call compares against.
--   * module_rollup: the same status ladder; only 'fully_covered' is counted.
--
-- Security: same contract as the per-project report. Step 0 binds the actor
-- (a present-but-different auth.uid() is a spoof and collapses into the
-- not-found answer), then bunkai_assert_actor_can_read_workspace re-checks
-- active membership of a live workspace and raises the non-disclosing P0002.
-- The caller maps P0002 to the empty-workspace answer, as before.
--
-- Additive: a new function only. bunkai_report_project_coverage is untouched
-- and still backs /api/v1/projects/{id}/coverage and the Metrics screen.
-- VOLATILE like its sibling. The 0085 default privilege hands every new
-- function to both QA roles; a volatile SECURITY DEFINER function stays off
-- qa_inspector_ro (0086), so it is revoked explicitly below (0088 mechanism,
-- as in 0091 and 0097). qa_inspector_rw keeps the default grant, as for 0108.

create or replace function public.bunkai_report_workspace_coverage(
  p_actor_user_id uuid,
  p_workspace_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- 0. Actor bind (0108 step 0).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  -- 1. READ membership of a live workspace; raises P0002 otherwise.
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, p_workspace_id);

  with ws_projects as (
    select p.id
      from public.projects p
      where p.workspace_id = p_workspace_id
  ),
  proj_modules as (
    select m.id, m.project_id
      from public.modules m
      join ws_projects wp on wp.id = m.project_id
      where m.archived_at is null
  ),
  ac_scope as (
    select
      ac.id as ac_id,
      pm.id as module_id,
      pm.project_id
      from public.acceptance_criteria ac
      join public.user_stories us on us.id = ac.user_story_id
      join proj_modules pm on pm.id = us.module_id
      where ac.archived_at is null
        and us.archived_at is null
  ),
  atc_real_status as (
    -- 0108's ordering, unchanged, over the workspace's ATCs only.
    select distinct on (ra.atc_id)
      ra.atc_id,
      ra.status
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
      join public.atcs wa on wa.id = ra.atc_id
      join ws_projects wp on wp.id = wa.project_id
      where ra.atc_id is not null
      order by ra.atc_id,
               r.started_at desc,
               case when ra.status in ('passed', 'failed') then 0 else 1 end,
               ra.run_id,
               ra.position
  ),
  ac_state as (
    select
      s.ac_id,
      s.module_id,
      case
        when count(a.id) = 0 then 'uncovered'
        when bool_or(coalesce(ars.status, 'pending') not in ('passed', 'failed')) then 'not_run'
        else 'executed'
      end as state
      from ac_scope s
      left join public.atc_acceptance_criteria aac on aac.acceptance_criterion_id = s.ac_id
      left join public.atcs a on a.id = aac.atc_id
        and a.archived_at is null
        and a.project_id = s.project_id
      left join atc_real_status ars on ars.atc_id = a.id
      group by s.ac_id, s.module_id
  ),
  module_rollup as (
    select
      pm.id as module_id,
      case
        when count(cs.ac_id) = 0 then 'no_acs'
        when count(cs.ac_id) filter (where cs.state = 'uncovered') > 0 then 'uncovered'
        when count(cs.ac_id) filter (where cs.state = 'not_run') > 0 then 'not_run'
        else 'fully_covered'
      end as status
      from proj_modules pm
      left join ac_state cs on cs.module_id = pm.id
      group by pm.id
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
    'project_count', (select count(*) from ws_projects)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_report_workspace_coverage(uuid, uuid) from public, anon;
grant execute on function public.bunkai_report_workspace_coverage(uuid, uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_report_workspace_coverage(uuid, uuid) from qa_inspector_ro;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('anon', 'public.bunkai_report_workspace_coverage(uuid,uuid)', 'EXECUTE');            -- false
--   select has_function_privilege('authenticated', 'public.bunkai_report_workspace_coverage(uuid,uuid)', 'EXECUTE');   -- true
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_report_workspace_coverage(uuid,uuid)', 'EXECUTE'); -- false
