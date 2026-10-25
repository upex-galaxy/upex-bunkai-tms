-- 0099_run_history_flakiness.sql — BK-554: per-Test flakiness signal on Run history
--
-- ADDITIVE and read-only. Amends bunkai_list_test_runs (0039_run_history_actor_guard.sql)
-- via `create or replace`: same signature, same grants, same auth contract
-- (actor bind, INV-3 non-disclosure, read-membership gate); the only change is one
-- new jsonb key, `flakiness`, in the returned object. Reversible by re-applying
-- 0039's definition. Precedent: BK-48 / D30 (two jsonb keys added to an existing
-- report RPC). No table, column, index or policy change; nothing is stored.
--
-- `flakiness` = { sample, flips, aborted_skipped } — raw counts only. The rule
-- constants (window 10, minimum 5, bands at one third) are ruled by the AI Product
-- Owner on BK-554 and applied in lib/runs/flakiness.ts. Served by the existing
-- runs_test_id_status_started_at_idx (0038).

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
  v_flakiness    jsonb;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which the
  --    parameter IS the identity; a present-but-different uid is a spoof and
  --    collapses into the missing-Test answer (INV-3).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

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

  -- 2b. Cursor backstop: the keyset position is a PAIR. Exactly one half is not
  --     a position — raise rather than silently degrade to the first page.
  if (p_cursor_started_at is null) <> (p_cursor_id is null) then
    raise exception 'run_cursor_invalid' using errcode = '45209';
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

  -- BK-554 — flakiness inputs, computed on read, filter- and pagination-
  -- invariant (like totals). The sample is the 10 most recent Passed/Failed Runs
  -- in the SAME (started_at desc, id desc) order the list pages by; a flip is a
  -- consecutive pair (in that order) with different statuses. Aborted Runs are
  -- skipped, not a break. `aborted_skipped` counts Aborted Runs inside the span
  -- the sample covers (newest terminal Run down to the oldest sampled verdict);
  -- with no verdict Runs at all it is every Aborted Run. Band, rate and the
  -- below-minimum rule are derived in lib/runs/flakiness.ts from these counts.
  with sample as (
    select r.status, r.started_at, r.id,
           lead(r.status) over (order by r.started_at desc, r.id desc) as older_status
      from (
        select r2.status, r2.started_at, r2.id
          from public.runs r2
          where r2.test_id = p_test_id
            and r2.status in ('passed', 'failed')
          order by r2.started_at desc, r2.id desc
          limit 10
      ) r
  ),
  oldest as (
    select s.started_at, s.id from sample s order by s.started_at asc, s.id asc limit 1
  )
  select jsonb_build_object(
           'sample', (select count(*) from sample),
           'flips', (select count(*) from sample s where s.older_status is not null and s.older_status <> s.status),
           'aborted_skipped', (
             select count(*)
               from public.runs a
               where a.test_id = p_test_id
                 and a.status = 'aborted'
                 and (
                   not exists (select 1 from oldest)
                   or (a.started_at, a.id) >= (select o.started_at, o.id from oldest o)
                 )
           )
         )
    into v_flakiness;

  return jsonb_build_object(
    'items', v_items,
    'totals', v_totals,
    'next_cursor', v_next_cursor,
    'flakiness', v_flakiness
  );
end;
$$;

-- Re-assert the 0031/0036/0037 grant/revoke pattern. `create or replace` keeps
-- the existing ACL, so this is idempotent belt-and-braces, not a change.
revoke execute on function public.bunkai_list_test_runs(uuid, uuid, text, int, timestamptz, uuid) from public, anon;
grant execute on function public.bunkai_list_test_runs(uuid, uuid, text, int, timestamptz, uuid) to authenticated, service_role;
