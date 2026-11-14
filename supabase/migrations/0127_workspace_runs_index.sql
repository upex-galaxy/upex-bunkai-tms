-- 0127_workspace_runs_index.sql — BK-513: the workspace-wide Runs index.
--
-- WHAT
-- ----
-- One read function, `bunkai_list_workspace_runs`, and one index. The function
-- returns one page of a workspace's Runs, newest first, keyset paginated on
-- (started_at desc, id desc), with each Run's passed / failed / blocked step
-- counts. Filters AND-compose: one Project, outcomes (passed / failed), an
-- environment NAME matched case-insensitively across Projects, and an
-- execution mode (manual = executor `human`, automated = `agent` / `ci`).
--
-- WHY A FUNCTION, AND WHY SECURITY INVOKER (ADR-0012)
-- ---------------------------------------------------
-- The step counts are the reason this is not a plain PostgREST read: counting
-- them through a `run_steps` row scan fails the whole page once 50 Runs hold
-- more steps than the scan ceiling, and a page that fails on a busy workspace
-- breaks "every Run is reachable". Here they are aggregated in SQL, for the
-- returned page only.
--
-- ADR-0012's first question is whether the identity parameter can be deleted
-- instead of guarded. It can: there is no `p_actor_user_id`. The function is
-- SECURITY INVOKER, so every table read runs under the CALLER's RLS
-- (`runs_select_workspace_member`, `run_atcs_*`, `run_steps_*` in 0031,
-- `projects` in 0002, `project_environments` in 0031). A forged or foreign
-- `p_workspace_id` selects nothing. `p_workspace_id` is a scope, not an
-- authorization: it pins every row to the active workspace, so a caller who
-- belongs to two workspaces never sees the other one's Runs here.
--
-- It writes nothing (`stable`). The 0085 default privileges grant it to the QA
-- inspector roles, which is safe for an INVOKER function: it runs with the
-- caller's own table grants, so `qa_inspector_ro` reads only what it can
-- already SELECT.
--
-- THE INDEX
-- ---------
-- `runs_workspace_id_idx` (0031) sorts by nothing, and the 0060 index is
-- partial on `status = 'running'`. The unfiltered page read and the sidebar's
-- `count(*) where workspace_id = $1` both lead with `workspace_id` and order by
-- (started_at desc, id desc), which this btree walks directly.
--
-- Additive only, re-runnable: `create index if not exists`, `create or replace
-- function`, grants re-asserted.

create index if not exists runs_workspace_id_started_at_id_idx
  on public.runs (workspace_id, started_at desc, id desc);

create or replace function public.bunkai_list_workspace_runs(
  p_workspace_id      uuid,
  p_project_id        uuid default null,
  p_status            text[] default null,
  p_environment_name  text default null,
  p_mode              text default null,
  p_limit             int default 50,
  p_cursor_started_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit       int;
  v_items       jsonb;
  v_fetched     int;
  v_last        jsonb;
  v_next_cursor jsonb;
begin
  -- Page size: clamp into 1..50, never unbounded. The API refuses an
  -- out-of-range limit before it gets here; the clamp is for direct callers.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  with page as (
    select r.id, r.project_id, r.test_id, r.test_title, r.environment_id,
           r.executor_mode, r.status, r.started_at, r.finished_at
      from public.runs r
      where r.workspace_id = p_workspace_id
        and (p_project_id is null or r.project_id = p_project_id)
        and (p_status is null or r.status = any(p_status))
        and (
          p_environment_name is null
          or exists (
            select 1
              from public.project_environments pe
              where pe.id = r.environment_id
                and lower(pe.name) = lower(p_environment_name)
          )
        )
        and (
          p_mode is null
          or (p_mode = 'manual' and r.executor_mode = 'human')
          or (p_mode = 'automated' and r.executor_mode <> 'human')
        )
        and (
          p_cursor_started_at is null
          or p_cursor_id is null
          or (r.started_at, r.id) < (p_cursor_started_at, p_cursor_id)
        )
      order by r.started_at desc, r.id desc
      -- One probe row past the page tells whether another page exists.
      limit v_limit + 1
  ),
  kept as (
    select * from page order by started_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'project_id', k.project_id,
                 'project_slug', p.slug,
                 'project_name', p.name,
                 'test_id', k.test_id,
                 'test_title', k.test_title,
                 'environment_name', pe.name,
                 'executor_mode', k.executor_mode,
                 'status', k.status,
                 'started_at', k.started_at,
                 'finished_at', k.finished_at,
                 'passed_steps', coalesce(s.passed, 0),
                 'failed_steps', coalesce(s.failed, 0),
                 'blocked_steps', coalesce(s.blocked, 0)
               ) order by k.started_at desc, k.id desc)
        from kept k
        left join public.projects p on p.id = k.project_id
        left join public.project_environments pe on pe.id = k.environment_id
        -- Step counts for THIS page only. Pending and skipped steps are not
        -- counted (BK-513 AC-05, PO ruling of 2026-11-12).
        left join lateral (
          select count(*) filter (where rs.status = 'passed')  as passed,
                 count(*) filter (where rs.status = 'failed')  as failed,
                 count(*) filter (where rs.status = 'blocked') as blocked
            from public.run_atcs ra
            join public.run_steps rs on rs.run_atc_id = ra.id
            where ra.run_id = k.id
        ) s on true
    ), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- next_cursor: NULL when the probe row was absent (no further page).
  -- Otherwise the (started_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'started_at', v_last -> 'started_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'next_cursor', v_next_cursor
  );
end;
$$;

revoke execute on function public.bunkai_list_workspace_runs(
  uuid, uuid, text[], text, text, int, timestamptz, uuid
) from public, anon;
grant execute on function public.bunkai_list_workspace_runs(
  uuid, uuid, text[], text, text, int, timestamptz, uuid
) to authenticated, service_role;
