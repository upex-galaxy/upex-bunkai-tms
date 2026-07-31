-- 0041_run_project_report.sql — BK-38: filter a Project's Runs with pass/fail
-- totals
--
-- Builds on the Runs foundation (0031_runs.sql, BK-34), the module snapshot
-- this domain just gained (0040_run_module_snapshot.sql, BK-38) and the
-- keyset-pagination mechanism BK-37 proved out (0038_run_history.sql,
-- 0039_run_history_actor_guard.sql). ADDITIVE only.
--
-- Adds:
--   * runs_project_id_status_started_at_idx — covering index for the filtered,
--     keyset-paged project report query
--   * bunkai_report_project_runs            — membership-gated, filtered,
--     keyset-paged, totals-bearing read
--
-- Conventions mirror bunkai_list_test_runs (0038/0039_run_history*.sql):
-- explicit-actor contract (route handlers run on the admin client, so
-- auth.uid() is NULL and the RLS SELECT policies return zero rows there),
-- read-level membership re-check in-band via bunkai_assert_actor_can_read_workspace
-- (ANY active role — viewers included), schema-qualified body
-- (search_path = ''), the 0031/.../0039 grant/revoke pattern, and a jsonb
-- {items, totals, next_cursor} return shape. The wire cursor format is opaque
-- (base64url) and belongs to the TypeScript layer
-- (lib/runs/history-validation.ts, reused unchanged) — not to SQL.
--
-- Unlike bunkai_list_test_runs, this RPC bakes the actor-bind guard in from
-- day one (BK-37 had to retrofit it in 0039 after a review finding — an
-- unguarded explicit-actor SECURITY DEFINER RPC lets any signed-in user pass
-- another user's uuid and read through their membership). No follow-up
-- migration is needed here.
--
-- It ALSO deliberately DOES NOT copy bunkai_list_test_runs's "totals are
-- all-time and filter-invariant" convention (Technical Decision D2 in the
-- BK-38 implementation plan). Business Rule #3 requires the OPPOSITE here:
-- "Pass and fail totals always reflect the currently applied filters, not the
-- whole Project." totals below are computed from the SAME filtered CTE that
-- produces the rows — see the `filtered` CTE and its comment.
--
-- No new custom SQLSTATE codes are allocated by this migration — the
-- not-found path reuses the established 'project_not_found' / P0002
-- convention (0021_atc_create_update.sql) and the membership re-check reuses
-- the existing bunkai_assert_actor_can_read_workspace helper (0025_test_read.sql).

-- ============================================================================
-- 1. runs_project_id_status_started_at_idx — the project-report access path
-- ============================================================================
-- Mirrors 0038's runs_test_id_status_started_at_idx exactly, swapped to
-- project_id: equality on (project_id, status) then the (started_at desc,
-- id desc) sort the keyset tuple predicate seeks into.

create index if not exists runs_project_id_status_started_at_idx
  on public.runs (project_id, status, started_at desc, id desc);

-- ============================================================================
-- 2. bunkai_report_project_runs — filtered, keyset-paged project Run report
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior), same shape as
-- bunkai_list_test_runs (0039):
--   0. Actor bind. NULL auth.uid() = service-role / admin client, for which
--      the parameter IS the identity; a present-but-different uid is a spoof
--      and collapses into the missing-Project answer (non-disclosure).
--   1. Resolve the Project -> workspace_id. Missing/foreign Project ->
--      project_not_found (P0002). Then the read-membership re-check (ANY
--      active role, viewers included), which raises the SAME P0002 — a caller
--      must never be able to tell "exists but forbidden" from "does not
--      exist".
--   2. Clamp p_limit into 1..50 (50 is the established page size — matches
--      bunkai_list_test_runs). A NULL / out-of-range limit is clamped rather
--      than rejected: the HTTP edge already rejects out-of-range values with
--      a 422, so this is the direct-caller backstop and must never return an
--      unbounded page.
--   3. Build `filtered`: every Run of the Project (BK-38-ATC-07's primary
--      enforcement — see the CTE's own comment) with every optional filter
--      AND-composed (date range, module, status, executor). This is the
--      WHOLE filtered set, unpaged — both the totals AND the page are derived
--      from it, which is what keeps Technical Decision D2 correct by
--      construction rather than by convention.
--   4. Page `filtered` newest-first with the keyset tuple predicate, fetched
--      at limit+1 to learn whether another page exists.
--   5. Totals: passed/failed counts over the WHOLE `filtered` set (not just
--      the returned page) — Business Rule #3.
--
-- Pagination is KEYSET on (started_at desc, id desc), not offset, for the
-- same reason as bunkai_list_test_runs: Runs are append-heavy, so an offset
-- page would skip or duplicate rows whenever a Run lands mid-scroll. Both
-- cursor components must be supplied together; either one NULL means "first
-- page" (mirrors 0038's mechanism exactly).
--
-- Unlike bunkai_list_test_runs, rows here are NOT restricted to terminal
-- statuses — this is a live project-wide report, and a currently-`running`
-- Run is a legitimate row (it simply cannot be the TARGET of a status filter;
-- REPORT_STATUS_VALUES = passed/failed/aborted is enforced at the Zod layer,
-- Technical Decision D4). `status = ANY(p_status)` is applied as-is here; the
-- direct-caller backstop for that enum lives at the HTTP edge, matching this
-- RPC's stated scope (BK-38 DB-2 task).

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
    (
      select jsonb_build_object('passed', 0, 'failed', 0)
             || coalesce(jsonb_object_agg(g.status, g.n), '{}'::jsonb)
        from (
          select status, count(*) as n
            from filtered
            where status in ('passed', 'failed')
            group by status
        ) g
    )
    into v_items, v_fetched, v_totals;

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
