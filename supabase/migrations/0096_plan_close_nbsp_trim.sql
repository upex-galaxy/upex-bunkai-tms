-- 0096_plan_close_nbsp_trim.sql — BK-207: forward fix for 0095 (trim class)
--
-- 0095 was applied through a transport that turned the literal NBSP (U+00A0) inside the
-- trim character class into a plain space, so the stored bunkai_close_test_plan did not
-- trim NBSP (the repo file was correct; the ledger statement differed only in those four
-- characters, confirmed by md5). The real-DB suite asserts an NBSP-only verdict is
-- 45604 and an NBSP-padded summary is trimmed.
--
-- Decision (AI Tech Lead, scored): A) forward migration redefining the function with the
-- ASCII escape \u00a0 (no byte can be lost again): reversible, ledger stays truthful,
-- no ledger surgery. B) edit the ledger statements: rejected, hand-edits to the ledger.
-- C) leave it: rejected, contradicts the ratified trim contract (T5).
-- Only bunkai_close_test_plan changes; bunkai_reopen_test_plan has no trim. Grants are
-- preserved by CREATE OR REPLACE and re-stated below anyway.

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
  v_verdict      text := regexp_replace(coalesce(p_verdict, ''), '^[\t\n\v\f\r \u00a0]+|[\t\n\v\f\r \u00a0]+$', '', 'g');
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
    regexp_replace(coalesce(p_summary, ''), '^[\t\n\v\f\r \u00a0]+|[\t\n\v\f\r \u00a0]+$', '', 'g'),
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_close_test_plan(uuid, text, text) from qa_inspector_ro;
  end if;
end
$$;
