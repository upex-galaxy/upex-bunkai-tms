-- 0095_plan_close.sql — BK-207: close a Test Plan with an outcome summary (and reopen it)
--
-- ADDITIVE only: five nullable columns and one CHECK on test_plans, two functions. No
-- table, no index, no policy, no data rewrite. Every existing row is 'open' (nothing
-- shipped before this migration can close a plan), so the new columns start NULL.
--
--   * bunkai_close_test_plan(p_test_plan_id, p_verdict, p_summary)
--       Freezes an Open plan: verdict, summary, closer, close time and the progress
--       snapshot are written in ONE statement (atomic, never partial), plus one
--       'test_plan.closed' entry in activity_log.
--   * bunkai_reopen_test_plan(p_test_plan_id)
--       Returns a Closed plan to Open and clears verdict, summary, closer, close time
--       and snapshot, plus one 'test_plan.reopened' entry. The history rows stay
--       (activity_log is append-only), so every close/reopen remains an immutable trail.
--
-- Decisions followed (Jira BK-207, answers ratified 2026-10-04, the AI Product Owner and
-- AI Tech Lead decisions posted on the ticket on 2026-10-19):
--   T2  Storage: columns on test_plans + activity_log history (no new table).
--   T3  Error contract (SQLSTATEs of the 456xx block; messages are the identifiers):
--         45603 test_plan_not_open    close of a closed plan, reopen of an open plan
--                                     (same code 0073/0076 already raise for edits and
--                                     membership changes on a closed plan)
--         45604 verdict_required      verdict missing (null, empty or whitespace)
--         45605 verdict_invalid       verdict present but not 'passed' | 'failed'
--         45606 close_forbidden       caller is a member of the workspace but neither the
--                                     plan's creator (with write access) nor an admin/owner
--       Plus P0002 test_plan_not_found for a missing plan, a plan in another workspace
--       and any non-member (non-disclosure), and 22001 test_plan_summary_length for a
--       summary over 4000 characters (the contract allocates no 456xx code for it).
--       45604-45606 are also used by the BK-203 membership RPCs with different meanings;
--       the two families never share a route and have separate mappers.
--   T4  Both functions take FOR UPDATE on the plan row. The losing concurrent submit
--       re-reads the new status and raises 45603: no last-write-wins, exactly one
--       history entry.
--   T5  Summary: optional, plain text, max 4000 characters AFTER trimming; whitespace-only
--       trims to empty and is stored as NULL. 45604 fires only when the VERDICT is missing.
--   PO1 Reopen clears verdict, summary and snapshot (the plan returns fully Open).
--   PO2 A creator who is now a viewer cannot close or reopen (a viewer is read-only for
--       every write): the creator branch requires write access, the admin branch does not.
--   BK-204 is the single source of truth for progress: the snapshot is the output of
--       bunkai_plan_progress at close time, stored verbatim (counts, percentage and the
--       per-test outcomes). Nothing here recomputes it.
--
-- Security posture (ADR-0012: delete the identity parameter instead of guarding it):
--   * Both functions are SECURITY DEFINER and take NO identity or scope parameter. The
--     actor is auth.uid(). DEFINER is required: test_plans deliberately carries no UPDATE
--     policy (0073) and activity_log is DEFINER-only.
--   * The workspace is resolved server-side from the plan row the function locks; the
--     function reads and writes only that one row. There is no set-returning path.
--   * Authorization runs BEFORE the state check, so a caller who may not close a plan
--     learns nothing about whether it is already closed. Non-members get the same P0002
--     as an absent plan. A caller with no session (service role, anon) is not a member of
--     anything and therefore also gets P0002: fail closed.
--   * The nested bunkai_plan_progress call (SECURITY INVOKER) runs with the function
--     owner's privileges here, which is correct because the plan id was already gated.

-- ============================================================================
-- 1. Columns and structural invariants
-- ============================================================================

alter table public.test_plans
  add column if not exists verdict           text,
  add column if not exists summary           text,
  add column if not exists closed_by         uuid references auth.users(id) on delete set null,
  add column if not exists closed_at         timestamptz,
  add column if not exists progress_snapshot jsonb;

alter table public.test_plans drop constraint if exists test_plans_verdict_check;
alter table public.test_plans add  constraint test_plans_verdict_check
  check (verdict is null or verdict in ('passed', 'failed'));

alter table public.test_plans drop constraint if exists test_plans_summary_length_check;
alter table public.test_plans add  constraint test_plans_summary_length_check
  check (summary is null or char_length(summary) <= 4000);

-- An open plan carries no closure data. A closed row with no verdict stays legal on
-- purpose: the BK-202/BK-203 suites seed closed rows directly to prove the 45603 guard.
alter table public.test_plans drop constraint if exists test_plans_open_has_no_closure_check;
alter table public.test_plans add  constraint test_plans_open_has_no_closure_check
  check (
    status = 'closed'
    or (verdict is null and summary is null and closed_by is null
        and closed_at is null and progress_snapshot is null)
  );

-- ============================================================================
-- 2. bunkai_close_test_plan
-- ============================================================================

create or replace function public.bunkai_close_test_plan(
  p_test_plan_id uuid,
  p_verdict      text,
  p_summary      text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status       text;
  v_created_by   uuid;
  -- Same whitespace class as the summary trim below (space, tab, newline, vertical tab,
  -- form feed, CR, NBSP): a whitespace-only verdict is 'missing' (45604), not 'invalid'.
  v_verdict      text := regexp_replace(coalesce(p_verdict, ''), '^[\t\n\v\f\r  ]+|[\t\n\v\f\r  ]+$', '', 'g');
  v_summary      text;
  v_snapshot     jsonb;
  v_row          public.test_plans%rowtype;
begin
  -- 1. Resolve the plan under a row lock (0032/0036/0037 serialization convention).
  --    A concurrent close/reopen blocks here and then reads the new status below.
  select workspace_id, status, created_by
    into v_workspace_id, v_status, v_created_by
    from public.test_plans where id = p_test_plan_id for update;
  if v_workspace_id is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure: not a member (including no session) is indistinguishable from
  --    an absent plan.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- 3. Role gate, live on every call: the plan's creator while they still hold write
  --    access, or an admin/owner. Decided BEFORE the state check on purpose.
  if not (
    (v_created_by is not null and v_created_by = auth.uid() and public.bunkai_can_write_workspace(v_workspace_id))
    or public.bunkai_is_workspace_admin(v_workspace_id)
  ) then
    raise exception 'close_forbidden' using errcode = '45606';
  end if;

  -- 4. State: only an Open plan can be closed (also what the losing concurrent
  --    submit sees once the winner commits).
  if v_status <> 'open' then
    raise exception 'test_plan_not_open' using errcode = '45603';
  end if;

  -- 5. Verdict: missing is 45604, present but outside the vocabulary is 45605.
  if v_verdict = '' then
    raise exception 'verdict_required' using errcode = '45604';
  end if;
  if v_verdict not in ('passed', 'failed') then
    raise exception 'verdict_invalid' using errcode = '45605';
  end if;

  -- 6. Summary: trim (space, tab, newline, vertical tab, form feed, CR, NBSP), then the
  --    bound; empty after trimming is stored as NULL.
  v_summary := nullif(
    regexp_replace(coalesce(p_summary, ''), '^[\t\n\v\f\r  ]+|[\t\n\v\f\r  ]+$', '', 'g'),
    ''
  );
  if v_summary is not null and char_length(v_summary) > 4000 then
    raise exception 'test_plan_summary_length' using errcode = '22001';
  end if;

  -- 7. Freeze the progress (BK-204 is the single source; stored verbatim) and close in
  --    ONE statement so the five fields can never be partially written.
  v_snapshot := public.bunkai_plan_progress(p_test_plan_id);

  update public.test_plans
    set status            = 'closed',
        verdict           = v_verdict,
        summary           = v_summary,
        closed_by         = auth.uid(),
        closed_at         = now(),
        progress_snapshot = v_snapshot
    where id = p_test_plan_id
    returning * into v_row;

  -- 8. History (append-only; ADR-0011 actor resolution).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'test_plan', v_row.id, 'test_plan.closed',
          jsonb_build_object(
            'verdict', v_row.verdict,
            'summary', v_row.summary,
            'member_count', v_snapshot -> 'member_count',
            'passed_pct', v_snapshot -> 'passed_pct'
          ));

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'description', v_row.description, 'goal', v_row.goal, 'status', v_row.status,
    'created_by', v_row.created_by, 'created_at', v_row.created_at,
    'verdict', v_row.verdict, 'summary', v_row.summary,
    'closed_by', v_row.closed_by, 'closed_at', v_row.closed_at,
    'progress_snapshot', v_row.progress_snapshot
  );
end;
$$;

revoke execute on function public.bunkai_close_test_plan(uuid, text, text) from public, anon;
grant  execute on function public.bunkai_close_test_plan(uuid, text, text) to authenticated;

-- ============================================================================
-- 3. bunkai_reopen_test_plan
-- ============================================================================

create or replace function public.bunkai_reopen_test_plan(
  p_test_plan_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id     uuid;
  v_status           text;
  v_created_by       uuid;
  v_previous_verdict text;
  v_row              public.test_plans%rowtype;
begin
  select workspace_id, status, created_by, verdict
    into v_workspace_id, v_status, v_created_by, v_previous_verdict
    from public.test_plans where id = p_test_plan_id for update;
  if v_workspace_id is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- Same gate as close (T2 of the 2026-07-11 ratification: creator or admin and above).
  if not (
    (v_created_by is not null and v_created_by = auth.uid() and public.bunkai_can_write_workspace(v_workspace_id))
    or public.bunkai_is_workspace_admin(v_workspace_id)
  ) then
    raise exception 'close_forbidden' using errcode = '45606';
  end if;

  if v_status <> 'closed' then
    raise exception 'test_plan_not_open' using errcode = '45603';
  end if;

  update public.test_plans
    set status            = 'open',
        verdict           = null,
        summary           = null,
        closed_by         = null,
        closed_at         = null,
        progress_snapshot = null
    where id = p_test_plan_id
    returning * into v_row;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'test_plan', v_row.id, 'test_plan.reopened',
          jsonb_build_object('previous_verdict', v_previous_verdict));

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'description', v_row.description, 'goal', v_row.goal, 'status', v_row.status,
    'created_by', v_row.created_by, 'created_at', v_row.created_at,
    'verdict', v_row.verdict, 'summary', v_row.summary,
    'closed_by', v_row.closed_by, 'closed_at', v_row.closed_at,
    'progress_snapshot', v_row.progress_snapshot
  );
end;
$$;

revoke execute on function public.bunkai_reopen_test_plan(uuid) from public, anon;
grant  execute on function public.bunkai_reopen_test_plan(uuid) to authenticated;

-- 0088/0091 mechanism: the 0085 default privilege hands every new function to BOTH QA
-- roles. These two are volatile SECURITY DEFINER writers, so the read-only inspection
-- role must not keep them. Guarded: the role exists on the shared database only.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_close_test_plan(uuid, text, text) from qa_inspector_ro;
    revoke all on function public.bunkai_reopen_test_plan(uuid) from qa_inspector_ro;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('authenticated',
--            'public.bunkai_close_test_plan(uuid,text,text)', 'EXECUTE');    -- true
--   select has_function_privilege('anon',
--            'public.bunkai_close_test_plan(uuid,text,text)', 'EXECUTE');    -- false
--   select has_function_privilege('qa_inspector_ro',
--            'public.bunkai_close_test_plan(uuid,text,text)', 'EXECUTE');    -- false
--   select has_function_privilege('qa_inspector_ro',
--            'public.bunkai_reopen_test_plan(uuid)', 'EXECUTE');             -- false
