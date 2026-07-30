-- 0038_run_history.sql — BK-37: A Test's past Runs, filterable by outcome
--
-- Builds on the Runs foundation (0031_runs.sql, BK-34) and the Test read path
-- (0025_test_read.sql, BK-32). ADDITIVE only — no table, column, policy, or data
-- change beyond one new index.
--
-- Adds:
--   * runs_test_id_status_started_at_idx — covering index for the filtered,
--     keyset-paged history query
--   * bunkai_list_test_runs              — membership-gated, keyset-paged read
--
-- Conventions mirror bunkai_get_test_expanded / bunkai_get_run_expanded (the
-- read siblings): explicit-actor contract (route handlers run on the admin
-- client, so auth.uid() is NULL and the RLS SELECT policies return zero rows
-- there), read-level membership re-check in-band via
-- bunkai_assert_actor_can_read_workspace (ANY active role — viewers included),
-- schema-qualified body (search_path = ''), and the 0031/0036/0037 grant/revoke
-- pattern.
--
-- Non-disclosure (INV-3): a missing Test, a foreign-workspace Test, and a
-- non-member actor ALL collapse into the same P0002 raise — never 42501 — so a
-- caller cannot distinguish "exists but forbidden" from "does not exist". The
-- HTTP layer maps that to one identical 404.
--
-- Custom SQLSTATE codes allocated for the run domain (class 45xxx, 452xx block;
-- 45203 stays RESERVED for token_expired per 0031_runs.sql; 45204/45205 belong to
-- 0036_run_abort.sql, 45206/45207 to 0037_run_finish.sql, 45210/45211 to
-- 0032_project_environments_crud.sql):
--   45208  run_outcome_invalid      (outcome filter not in passed/failed/aborted)

-- ============================================================================
-- 1. runs_test_id_status_started_at_idx — the history access path
-- ============================================================================
--
-- The existing runs_test_id_started_at_idx (0031_runs.sql) covers the unfiltered
-- ordering but not the status predicate, and carries no `id` tie-break column.
-- This index matches the query verbatim: equality on (test_id, status) then the
-- (started_at desc, id desc) sort that the keyset tuple predicate seeks into. It
-- serves the filtered path directly and the unfiltered path as a skip-scan over
-- the three terminal statuses.

create index if not exists runs_test_id_status_started_at_idx
  on public.runs (test_id, status, started_at desc, id desc);

-- ============================================================================
-- 2. bunkai_list_test_runs — keyset-paged Run history for one Test
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior):
--   1. Resolve the Test -> workspace_id. Missing Test -> P0002. Then the
--      read-membership re-check, which raises the SAME P0002 (non-disclosure).
--   2. Outcome backstop: a non-null p_outcome must be one of the three terminal
--      statuses, else run_outcome_invalid (45208). The Zod layer at the HTTP edge
--      is the primary guard; this protects direct / PAT callers. 'running' is
--      deliberately NOT accepted — an in-progress Run is not an outcome.
--   3. Clamp p_limit into 1..50 (50 is the PO-confirmed page size). A NULL /
--      out-of-range limit is clamped rather than rejected: the HTTP edge already
--      rejects out-of-range values with a 422, so this is the direct-caller
--      backstop and must never return an unbounded page.
--   4. Page the terminal Runs newest-first. Only 'passed'/'failed'/'aborted' are
--      ever visible or counted — a 'running' Run never appears in history and is
--      never a "past run" (PO decision, BK-37 business rules).
--
-- Pagination is KEYSET on (started_at desc, id desc), not offset: Runs are
-- append-heavy, so an offset page would skip or duplicate rows whenever a Run
-- lands mid-scroll. The tuple predicate (started_at, id) < (cursor) is exact
-- even with identical started_at values, which is also the PO-confirmed
-- tie-break (id as the secondary sort key). Both cursor components must be
-- supplied together; either one NULL means "first page".
--
-- The page is fetched at limit+1 rows purely to learn whether another page
-- exists; only `limit` rows are returned. next_cursor is NULL when there is no
-- further page, otherwise the (started_at, id) of the LAST returned row, as a
-- jsonb object. The wire format is opaque (base64) — that encoding belongs to
-- the TypeScript layer (lib/runs/history-validation.ts), not to SQL.
--
-- totals counts ALL terminal Runs of the Test and is deliberately INDEPENDENT of
-- both p_outcome and pagination: the header reads "all-time, filter-invariant"
-- (plan D-B). BK-38's project-wide totals are filter-reactive — a deliberate
-- asymmetry; the two screens answer different questions.

create or replace function public.bunkai_list_test_runs(
  p_actor_user_id     uuid,
  p_test_id           uuid,
  p_outcome           text default null,
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
  -- 1. Resolve the Test, then re-check READ membership. Both failures raise the
  --    identical P0002 (INV-3 non-disclosure).
  select workspace_id into v_workspace_id
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. Outcome filter backstop (Zod is the primary guard at the HTTP edge).
  if p_outcome is not null and p_outcome not in ('passed', 'failed', 'aborted') then
    raise exception 'run_outcome_invalid' using errcode = '45208';
  end if;

  -- 3. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  -- 4. One keyset page (limit+1 probe) + the kept slice, composed to jsonb.
  with page as (
    select r.id, r.status, r.environment_id, r.executor_mode, r.started_at, r.finished_at
      from public.runs r
      where r.test_id = p_test_id
        and r.status in ('passed', 'failed', 'aborted')
        and (p_outcome is null or r.status = p_outcome)
        and (
          p_cursor_started_at is null
          or p_cursor_id is null
          or (r.started_at, r.id) < (p_cursor_started_at, p_cursor_id)
        )
      order by r.started_at desc, r.id desc
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
                 'status', k.status,
                 'environment_id', k.environment_id,
                 'environment_name', (
                   select pe.name from public.project_environments pe where pe.id = k.environment_id
                 ),
                 'executor_mode', k.executor_mode,
                 'started_at', k.started_at,
                 'finished_at', k.finished_at
               ) order by k.started_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- next_cursor: NULL when the probe row was absent (no further page). Otherwise
  -- the (started_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'started_at', v_last -> 'started_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  -- All-time outcome totals — filter-invariant and pagination-invariant. The
  -- three keys are always present (0 when that outcome never occurred).
  select jsonb_build_object('passed', 0, 'failed', 0, 'aborted', 0)
         || coalesce(jsonb_object_agg(g.status, g.n), '{}'::jsonb)
    into v_totals
    from (
      select r.status, count(*) as n
        from public.runs r
        where r.test_id = p_test_id
          and r.status in ('passed', 'failed', 'aborted')
        group by r.status
    ) g;

  return jsonb_build_object(
    'items', v_items,
    'totals', v_totals,
    'next_cursor', v_next_cursor
  );
end;
$$;

revoke execute on function public.bunkai_list_test_runs(uuid, uuid, text, int, timestamptz, uuid) from public, anon;
grant execute on function public.bunkai_list_test_runs(uuid, uuid, text, int, timestamptz, uuid) to authenticated, service_role;
