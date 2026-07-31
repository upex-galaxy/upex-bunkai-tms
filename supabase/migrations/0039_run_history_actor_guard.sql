-- 0039_run_history_actor_guard.sql — BK-37 follow-up: bind the explicit actor to
-- the caller's JWT, and reject a half-supplied cursor.
--
-- Amends bunkai_list_test_runs (0038_run_history.sql) via `create or replace`.
-- 0038 is NOT edited: it is already applied to the shared Supabase project and
-- pushed, and this repo's migrations are append-only for exactly that reason —
-- rewriting an applied file makes the local history diverge from what the
-- database actually ran. Everything below is behavior-preserving for both
-- existing callers; only illegitimate inputs change outcome.
--
-- ---------------------------------------------------------------------------
-- Guard 1 — actor spoofing (the reason this migration exists)
-- ---------------------------------------------------------------------------
-- The function is SECURITY DEFINER with `grant execute to authenticated`, and it
-- takes p_actor_user_id as its identity. 0038 trusted that parameter without
-- checking it against the caller's own JWT. Because the Supabase anon key ships
-- to the browser (NEXT_PUBLIC_*), ANY signed-in user can call the RPC straight
-- through PostgREST and pass somebody else's uuid — the in-band membership
-- re-check then answers for THAT user, disclosing the run history of every Test
-- that user can see. The explicit-actor contract is a convenience for the admin
-- client, never an authorization primitive.
--
-- The bind:
--   * auth.uid() IS NULL   → service-role / admin client (the API route, whose
--                            JWT carries no sub) → unchanged, the parameter is
--                            the only identity available.
--   * auth.uid() = actor   → cookie client (the server page) → unchanged.
--   * auth.uid() <> actor  → a spoof attempt → raise.
--
-- It raises the SAME P0002 as a missing Test, deliberately: INV-3 non-disclosure
-- says a caller must never be able to tell "exists but forbidden" from "does not
-- exist", and a distinct code here would turn the RPC into an oracle for which
-- (actor, test) pairs are real. The HTTP layer maps it to the same 404.
--
-- KNOWN, TRACKED SEPARATELY: bunkai_get_test_expanded (0025_test_read.sql) and
-- bunkai_get_run_expanded (0031_runs.sql) carry the identical hole — same
-- SECURITY DEFINER + explicit-actor + authenticated-grant shape. They are NOT
-- touched here because each needs its own regression pass over its own callers;
-- this migration stays scoped to the function BK-37 introduced.
--
-- ---------------------------------------------------------------------------
-- Guard 2 — half-supplied cursor
-- ---------------------------------------------------------------------------
-- The keyset position is the PAIR (started_at, id); one half alone is not a
-- position. 0038's WHERE clause treats either half being NULL as "first page",
-- so a caller that supplies only one silently gets page 1 back — the one
-- degradation path in a function where every other backstop either raises
-- (outcome) or clamps (limit). It is also indistinguishable from a working
-- request, so a paging bug reads as an infinite first page rather than an error.
--
-- Both NULL stays the first page: that is the documented entry call, and the
-- existing `or`-guards in the WHERE clause remain its implementation.
--
-- Custom SQLSTATE allocated here (class 45xxx, 452xx run block; 45203 RESERVED
-- for token_expired per 0031, 45204/45205 in 0036, 45206/45207 in 0037, 45208 in
-- 0038, 45210/45211 in 0032):
--   45209  run_cursor_invalid       (exactly one cursor half supplied)

-- ============================================================================
-- bunkai_list_test_runs — keyset-paged Run history for one Test (amended)
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior):
--   0. Bind the explicit actor to the caller's JWT when there is one. A mismatch
--      raises the SAME P0002 as a missing Test (non-disclosure).
--   1. Resolve the Test -> workspace_id. Missing Test -> P0002. Then the
--      read-membership re-check, which raises the SAME P0002 (non-disclosure).
--   2. Outcome backstop: a non-null p_outcome must be one of the three terminal
--      statuses, else run_outcome_invalid (45208). Cursor backstop: the two
--      cursor halves must be supplied together or not at all, else
--      run_cursor_invalid (45209). The Zod layer at the HTTP edge is the primary
--      guard for both; these protect direct / PAT callers. 'running' is
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
-- supplied together; both NULL means "first page".
--
-- The page is fetched at limit+1 rows purely to learn whether another page
-- exists; only `limit` rows are returned. next_cursor is NULL when there is no
-- further page, otherwise the (started_at, id) of the LAST returned row, as a
-- jsonb object. The wire format is opaque (base64url) — that encoding belongs to
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

  return jsonb_build_object(
    'items', v_items,
    'totals', v_totals,
    'next_cursor', v_next_cursor
  );
end;
$$;

-- Re-assert the 0031/0036/0037 grant/revoke pattern. `create or replace` keeps
-- the existing ACL, so this is idempotent belt-and-braces, not a change.
revoke execute on function public.bunkai_list_test_runs(uuid, uuid, text, int, timestamptz, uuid) from public, anon;
grant execute on function public.bunkai_list_test_runs(uuid, uuid, text, int, timestamptz, uuid) to authenticated, service_role;
