-- 0100_run_report_mode_totals.sql — BK-225: execution mode in the project
-- Run report.
--
-- ADDITIVE, same signature as 0041 (create or replace, grants re-asserted).
-- Mode is derived from executor_mode (human = Manual; agent/ci = Automated),
-- so no schema change; the Mode filter is a UI preset over the existing
-- p_executor_mode filter. What the RPC gains:
--   * totals.manual / totals.automated — passed+failed runs per mode over the
--     whole filtered set (Manual + Automated = Passed + Failed)
--   * scope.has_runs / scope.has_automated — filter-invariant project context
--     the UI needs to pick the right empty state
-- Everything else (actor bind, membership re-check, keyset paging) is the
-- 0041 body verbatim.

create or replace function public.bunkai_report_project_runs(
  p_actor_user_id     uuid,
  p_project_id        uuid,
  p_date_from         date default null,
  p_date_to           date default null,
  p_module_id         uuid default null,
  p_status            text[] default null,
  p_executor_mode     text[] default null,
  p_limit             int default 50,
  p_cursor_started_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_limit        int;
  v_items        jsonb;
  v_fetched      int;
  v_totals       jsonb;
  v_scope        jsonb;
  v_next_cursor  jsonb;
  v_last         jsonb;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which
  --    the parameter IS the identity; a present-but-different uid is a spoof
  --    and collapses into the missing-Project answer (non-disclosure).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Project, then re-check READ membership. Both failures
  --    raise the identical P0002 (non-disclosure).
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  -- 3-5. filtered (whole filtered set, unpaged) -> page (keyset slice) ->
  --      kept (trim the limit+1 probe row) -> items/totals in one query.
  with filtered as (
    select r.id, r.test_id, r.test_title, r.module_id, r.environment_id,
           r.executor_mode, r.status, r.started_at, r.finished_at
      from public.runs r
      where
        -- Primary project-boundary gate (BK-38-ATC-07 / SEC-1). The
        -- runs_select_workspace_member RLS policy (0031_runs.sql) only gates
        -- at the WORKSPACE boundary — a member of the same workspace could,
        -- via direct table access, see Runs from ANOTHER project in that
        -- workspace. THIS predicate is the actual project-scope enforcement
        -- for this report; RLS is defense-in-depth on the raw table only.
        -- Mirrors bunkai_list_test_runs's own non-disclosure reasoning
        -- (0038_run_history.sql).
        r.project_id = p_project_id
        -- Date range: UTC calendar day, both bounds inclusive (Technical
        -- Decision D3 — no projects.timezone column exists to interpret
        -- against).
        and (p_date_from is null or r.started_at::date >= p_date_from)
        and (p_date_to is null or r.started_at::date <= p_date_to)
        and (p_module_id is null or r.module_id = p_module_id)
        and (p_status is null or r.status = any(p_status))
        and (p_executor_mode is null or r.executor_mode = any(p_executor_mode))
  ),
  page as (
    select * from filtered
      where (
        p_cursor_started_at is null
        or p_cursor_id is null
        or (started_at, id) < (p_cursor_started_at, p_cursor_id)
      )
      order by started_at desc, id desc
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
                 'test_id', k.test_id,
                 'test_title', k.test_title,
                 'module_id', k.module_id,
                 'module_name', (
                   select m.name from public.modules m where m.id = k.module_id
                 ),
                 'environment_id', k.environment_id,
                 'environment_name', (
                   select pe.name from public.project_environments pe where pe.id = k.environment_id
                 ),
                 'executor_mode', k.executor_mode,
                 'status', k.status,
                 'started_at', k.started_at,
                 'finished_at', k.finished_at
               ) order by k.started_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page),
    -- Technical Decision D2: totals are passed/failed counts over the WHOLE
    -- `filtered` set (every row that matches the active filters, unpaged) —
    -- NOT all-time / filter-invariant like bunkai_list_test_runs's totals.
    -- Same CTE as the rows above, not a second query, by construction.
    -- BK-225: totals are still passed/failed over the WHOLE filtered set, now
    -- ALSO split per execution mode (manual = executor human, automated =
    -- agent/ci) from the SAME filtered CTE, so Manual + Automated = Passed +
    -- Failed by construction. running / aborted runs are not counted.
    (
      select jsonb_build_object(
               'passed', count(*) filter (where status = 'passed'),
               'failed', count(*) filter (where status = 'failed'),
               'manual', count(*) filter (where executor_mode = 'human'),
               'automated', count(*) filter (where executor_mode <> 'human')
             )
        from filtered
        where status in ('passed', 'failed')
    ),
    -- BK-225: project-level context for the empty states, deliberately
    -- filter-invariant (every Run of the Project): does the Project have any
    -- Run at all, and any automated one.
    (
      select jsonb_build_object(
               'has_runs', count(*) > 0,
               'has_automated', coalesce(bool_or(executor_mode <> 'human'), false)
             )
        from public.runs
        where project_id = p_project_id
    )
    into v_items, v_fetched, v_totals, v_scope;

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
    'totals', v_totals,
    'scope', v_scope,
    'next_cursor', v_next_cursor
  );
end;
$$;

revoke execute on function public.bunkai_report_project_runs(
  uuid, uuid, date, date, uuid, text[], text[], int, timestamptz, uuid
) from public, anon;
grant execute on function public.bunkai_report_project_runs(
  uuid, uuid, date, date, uuid, text[], text[], int, timestamptz, uuid
) to authenticated, service_role;
