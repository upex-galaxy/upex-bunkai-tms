-- 0094_plan_progress.sql — BK-204: track a Test Plan's progress from run outcomes
--
-- ADDITIVE only: three functions, no table, no column, no index, no policy. Progress
-- is a read-only projection of the run history the product already keeps.
--
--   * bunkai_plan_progress_rows   — internal helper: one row per member test, with the
--                                   test's latest run outcome. Holds the WHOLE rulebook.
--   * bunkai_plans_progress       — counts and percentage for a set of plans (the plans
--                                   list mini bar).
--   * bunkai_plan_progress        — the same summary for ONE plan plus one entry per
--                                   member test (the plan detail strip and the table's
--                                   "Latest outcome" / "Last run" columns).
--
-- Decisions followed (Jira BK-204, "Shift-Left Refinement — Ratified Answers" of
-- 2026-10-18, and the AI Tech Lead decision posted on the ticket):
--   R1  passed% = floor(passed / member_count * 100). Integer division of non-negative
--       numbers floors, so no float is involved. 100 only when every member passed.
--   R2  Plan-agnostic window: a member test's latest run counts whenever the test
--       joined the plan (runs belong to tests, not plans).
--   R3  Latest run = the run with the greatest (started_at, id) of the test. A run that
--       is still running IS the latest run: the test is `in_progress` until it ends.
--   R4  Outcome vocabulary: passed, failed, aborted (as run.status), in_progress (a
--       running run) and not_run (no run). Every executor counts alike.
--   R5  One entry point per view, one rulebook: the single-plan function is the batch
--       function plus the per-test list, so the detail and the list cannot disagree.
--   R6  The latest run per member is a lateral lookup that walks the existing
--       runs_test_id_started_at_idx (test_id, started_at desc): no new index, no N+1
--       from the application (one RPC per view). Budget: 200 members per plan.
--
-- Security posture (ADR-0012: delete the identity parameter instead of guarding it):
--   * Every function is SECURITY INVOKER and takes NO identity or scope parameter.
--     test_plans, test_plan_tests and runs already carry workspace-member SELECT
--     policies, so RLS is the only authorization and there is nothing to spoof.
--   * The service_role key carries BYPASSRLS, so an INVOKER function called with the
--     admin client would read every workspace. The two public functions therefore
--     refuse a caller with no auth.uid() with the same P0002 as a missing plan. The
--     internal helper is not executable by service_role or anon at all.
--
-- Failure contract: a missing plan, a plan in another workspace, a non-member, a
-- soft-deleted workspace and a caller without a session all raise the single
-- P0002 'test_plan_not_found' (single-plan function). The batch function never
-- discloses: it simply leaves out the plans the caller cannot see. No new custom
-- SQLSTATE is allocated.
--
-- Return shape of bunkai_plans_progress (jsonb array, ordered by plan_id):
--   [{ plan_id, member_count, passed_pct, counts: { passed, failed, aborted,
--      in_progress, not_run } }]
--   passed_pct is null when member_count = 0 (the empty progress state); a plan with
--   members and no runs is 0, not null.
-- bunkai_plan_progress returns that same object plus
--   tests: [{ test_id, outcome, run_id, started_at }]   (membership order)
--   run_id and started_at are null for a never-run test.

-- ============================================================================
-- 1. bunkai_plan_progress_rows — the rulebook (internal helper)
-- ============================================================================

create or replace function public.bunkai_plan_progress_rows(p_plan_ids uuid[])
returns table (
  plan_id    uuid,
  test_id    uuid,
  added_at   timestamptz,
  outcome    text,
  run_id     uuid,
  started_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.test_plan_id,
    m.test_id,
    m.created_at,
    case
      when lr.id is null then 'not_run'
      when lr.status = 'running' then 'in_progress'
      else lr.status
    end,
    lr.id,
    lr.started_at
  from public.test_plan_tests m
  left join lateral (
    select r.id, r.status, r.started_at
    from public.runs r
    where r.test_id = m.test_id
    order by r.started_at desc, r.id desc
    limit 1
  ) lr on true
  where m.test_plan_id = any (p_plan_ids);
$$;

-- Executable by the role the user's RLS-scoped client uses. NOT by service_role or
-- anon: called directly with the admin client it would read every workspace.
revoke execute on function public.bunkai_plan_progress_rows(uuid[]) from public, anon, service_role;
grant execute on function public.bunkai_plan_progress_rows(uuid[]) to authenticated;

-- ============================================================================
-- 2. bunkai_plans_progress — counts and percentage for a set of plans
-- ============================================================================

create or replace function public.bunkai_plans_progress(p_plan_ids uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- A caller with no session (service role, anon) gets nothing.
  if auth.uid() is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'plan_id', tp.id,
        'member_count', coalesce(a.total, 0),
        'passed_pct', case
          when coalesce(a.total, 0) = 0 then null
          else ((a.passed * 100) / a.total)::int
        end,
        'counts', jsonb_build_object(
          'passed', coalesce(a.passed, 0),
          'failed', coalesce(a.failed, 0),
          'aborted', coalesce(a.aborted, 0),
          'in_progress', coalesce(a.in_progress, 0),
          'not_run', coalesce(a.not_run, 0)
        )
      )
      order by tp.id
    )
    from public.test_plans tp
    left join (
      select
        rw.plan_id,
        count(*) as total,
        count(*) filter (where rw.outcome = 'passed') as passed,
        count(*) filter (where rw.outcome = 'failed') as failed,
        count(*) filter (where rw.outcome = 'aborted') as aborted,
        count(*) filter (where rw.outcome = 'in_progress') as in_progress,
        count(*) filter (where rw.outcome = 'not_run') as not_run
      from public.bunkai_plan_progress_rows(p_plan_ids) rw
      group by rw.plan_id
    ) a on a.plan_id = tp.id
    where tp.id = any (p_plan_ids)
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.bunkai_plans_progress(uuid[]) from public, anon;
grant execute on function public.bunkai_plans_progress(uuid[]) to authenticated, service_role;

-- ============================================================================
-- 3. bunkai_plan_progress — one plan, with the per-test list
-- ============================================================================

create or replace function public.bunkai_plan_progress(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- The summary comes from the batch function, so the counts and the percentage have
  -- exactly one implementation. A plan RLS hides yields no element.
  v_summary := public.bunkai_plans_progress(array[p_plan_id]) -> 0;
  if v_summary is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  return v_summary || jsonb_build_object(
    'tests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'test_id', rw.test_id,
          'outcome', rw.outcome,
          'run_id', rw.run_id,
          'started_at', rw.started_at
        )
        order by rw.added_at, rw.test_id
      )
      from public.bunkai_plan_progress_rows(array[p_plan_id]) rw
    ), '[]'::jsonb)
  );
end;
$$;

-- anon can never execute it; authenticated is the role the user's RLS-scoped client
-- uses; service_role may execute but is refused by the auth.uid() guard above.
revoke execute on function public.bunkai_plan_progress(uuid) from public, anon;
grant execute on function public.bunkai_plan_progress(uuid) to authenticated, service_role;
