-- 0069_story_traceability_module.sql — BK-48: expose module identity per ATC
-- row in bunkai_report_story_traceability's chain output.
--
-- Gap: the module filter (AC2, "exact-match on `data-module`") needs a
-- machine-stable module identifier + a display label per ATC row, but
-- 0068_story_traceability_report.sql never selected it — the `live_atc` CTE
-- already JOINs public.modules (to filter out archived modules) but only
-- projects a.id/a.slug/a.title/a.layer, discarding the module row itself.
--
-- Fix: additive only. `live_atc`/`pair` now also carry `module_id`/
-- `module_name`, threaded into the final jsonb as a nested `module: {id,
-- name}` object per ATC — same shape convention as `createBug`/
-- `listProjectBugs`'s nested module object (lib/supabase/rpc.ts) and
-- `bunkai_report_project_coverage`'s `module_id`/`module_name` pair
-- (0048_project_coverage_report.sql). No new table read, no new
-- authorization surface: `modules` was already joined and already scoped by
-- the same `v_project_id` + archived-ancestor guard `live_atc` enforces for
-- every other column. CREATE OR REPLACE is idempotent; every other clause
-- (actor bind, scoping, in-flight `state` derivation, defect-scoping join)
-- is byte-identical to 0068 — see that file's header for the full
-- ADR-0012 six-question gate answers, which are unchanged here.
--
-- AI Tech Lead decision (BK-48, Jira comment): the real schema has no
-- `MOD-XXX` code column (only modules.id/name/path) — the mockup's
-- `data-module="MOD-001"` is fixture-only. The filter's machine value is
-- `module.id` (UUID); `module.name` is the display label. Scored against
-- inventing a code column (schema change, no precedent, poor reversibility)
-- and filtering on `module.path` (no precedent rendering raw paths to
-- users) — `module_id`/`module_name` wins on precedent + reversibility.
-- Recorded as master-design-plan.md §5 divergence D30. No ADR: purely
-- additive, zero authorization-surface change, fully reversible (drop two
-- jsonb keys).

create or replace function public.bunkai_report_story_traceability(
  p_actor_user_id  uuid,
  p_user_story_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_result       jsonb;
begin
  -- 0. Actor bind, step 0, before any table read. Unchanged from 0068.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve scope through module_id, re-check READ membership. Unchanged.
  select m.project_id, p.workspace_id into v_project_id, v_workspace_id
    from public.user_stories us
    join public.modules  m on m.id = us.module_id
    join public.projects p on p.id = m.project_id
   where us.id = p_user_story_id;
  if v_workspace_id is null then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. ONE statement, ONE snapshot (EC12, unchanged from 0068).
  with archived_anc as (
    select path from public.modules
     where project_id = v_project_id and archived_at is not null
  ),
  live_atc as (
    -- Now also selects the module identity (m.id, m.name) — the ONLY change
    -- to this CTE's projection. `modules` was already joined for the
    -- archived-module/archived-ancestor exclusion below; this just keeps two
    -- more of its already-fetched columns.
    select a.id, a.slug, a.title, a.layer, m.id as module_id, m.name as module_name
      from public.atcs a
      join public.modules m on m.id = a.module_id
     where a.project_id = v_project_id
       and a.archived_at is null
       and m.archived_at is null
       and not exists (
         select 1 from archived_anc anc
          where m.path like anc.path || '/%'
       )
  ),
  crit as (
    select ac.id, ac.title, ac.position
      from public.acceptance_criteria ac
     where ac.user_story_id = p_user_story_id
       and ac.archived_at is null
  ),
  pair as (
    -- Carries module_id/module_name through alongside the pre-existing
    -- slug/title/layer passthrough. Same load-bearing scope guard as 0068
    -- (joining against `live_atc`, never raw `atcs`).
    select c.id as ac_id, la.id as atc_id, la.slug, la.title, la.layer,
           la.module_id, la.module_name
      from crit c
      join public.atc_acceptance_criteria j on j.acceptance_criterion_id = c.id
      join live_atc la on la.id = j.atc_id
  ),
  latest_run as (
    select distinct on (ra.atc_id)
           ra.atc_id,
           r.id as run_id,
           r.status as run_status,
           ra.status as atc_status,
           r.started_at,
           r.finished_at,
           r.test_id as run_test_id,
           r.test_title as run_test_title,
           case
             when r.status  = 'running' then 'in_flight'
             when r.status  = 'aborted' then 'aborted'
             when ra.status = 'pending' then 'in_flight'
             else ra.status
           end as state
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
     where ra.atc_id in (select atc_id from pair)
       and r.project_id = v_project_id
     order by ra.atc_id, r.started_at desc, r.id desc
  ),
  chain_test as (
    select distinct on (ts.atc_id) ts.atc_id, ts.test_id, t.title as test_title
      from public.test_steps ts
      join public.tests t on t.id = ts.test_id
     where ts.atc_id in (select atc_id from pair)
     order by ts.atc_id, ts.test_id
  ),
  chain_bug as (
    select b.id, b.title, b.severity, b.status, b.created_at,
           b.run_id, b.run_step_id, b.atc_id
      from public.bugs b
     where b.project_id = v_project_id
       and b.atc_id in (select atc_id from pair)
  )
  select jsonb_build_object(
    'story', (
      select jsonb_build_object(
        'id', us.id, 'title', us.title,
        'status', us.status, 'archived_at', us.archived_at
      )
        from public.user_stories us
       where us.id = p_user_story_id
    ),
    'criteria', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'atcs', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', pr.atc_id,
                'slug', pr.slug,
                'title', pr.title,
                'layer', pr.layer,
                'module', jsonb_build_object('id', pr.module_id, 'name', pr.module_name),
                'test', coalesce(
                  (select jsonb_build_object('id', lr.run_test_id, 'title', lr.run_test_title)
                     from latest_run lr
                    where lr.atc_id = pr.atc_id and lr.run_test_id is not null),
                  (select jsonb_build_object('id', ct.test_id, 'title', ct.test_title)
                     from chain_test ct
                    where ct.atc_id = pr.atc_id)
                ),
                'latest_run', (
                  select jsonb_build_object(
                    'run_id', lr.run_id,
                    'run_status', lr.run_status,
                    'atc_status', lr.atc_status,
                    'started_at', lr.started_at,
                    'finished_at', lr.finished_at,
                    'state', lr.state
                  )
                    from latest_run lr
                   where lr.atc_id = pr.atc_id
                ),
                'defects', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', cb.id, 'title', cb.title, 'severity', cb.severity,
                      'status', cb.status, 'created_at', cb.created_at,
                      'run_id', cb.run_id, 'run_step_id', cb.run_step_id
                    )
                    order by cb.created_at desc
                  )
                    from chain_bug cb
                   where cb.atc_id = pr.atc_id
                ), '[]'::jsonb)
              )
              order by pr.slug
            )
              from pair pr
             where pr.ac_id = c.id
          ), '[]'::jsonb)
        )
        order by c.position
      )
        from crit c
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_report_story_traceability(uuid, uuid) from public, anon;
grant  execute on function public.bunkai_report_story_traceability(uuid, uuid) to authenticated, service_role;
