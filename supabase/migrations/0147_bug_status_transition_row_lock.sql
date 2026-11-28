-- =============================================================================
-- 0147_bug_status_transition_row_lock
-- BK-2709 : lock the Bug row before bunkai_transition_bug_status reads its status.
-- =============================================================================
--
-- WHY. The function read the current status without a lock, so two concurrent
-- calls for the same Bug both passed the stage check and both wrote: one status
-- change recorded twice in the Activity log (reproduced: 19 of 30 concurrent
-- pairs). The read now takes FOR NO KEY UPDATE, the lock bunkai_bulk_edit_bugs
-- (0146) takes, so the second call waits, reads the new status and gets the
-- existing 45311 refusal.
--
-- WHAT. bunkai_transition_bug_status redefined with the body of 0054 and one
-- change: FOR NO KEY UPDATE on the first read. Same signature, same SECURITY
-- DEFINER and search_path, same grants. CREATE OR REPLACE keeps the existing ACL;
-- the revoke and grant below are 0054's, so a re-run converges. Idempotent.

create or replace function public.bunkai_transition_bug_status(
  p_bug_id     uuid,
  p_new_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id     uuid;
  v_assignee_user_id uuid;
  v_old_status       text;
  v_old_rank         int;
  v_new_rank         int;
begin
  -- 1. Resolve the bug. A nonexistent bug OR one in a workspace the caller
  --    isn't even a member of both raise the SAME not-found (non-disclosure).
  select workspace_id, status, assignee_user_id
    into v_workspace_id, v_old_status, v_assignee_user_id
    from public.bugs
    where id = p_bug_id
    for no key update;
  if v_workspace_id is null or not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'bug_not_found' using errcode = 'P0002';
  end if;

  -- 2. Write-role gate. Disclosed as a DISTINCT error from not-found — safe,
  --    since the caller (a genuine member) can already SELECT this bug.
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Adjacency check (Primary, friendly AC-specific messages) — holds OLD
  --    status in the same call. An unrecognized p_new_status ranks 0, which
  --    always falls into the "backward" bucket below (never the "skip" one).
  v_old_rank := case v_old_status
    when 'open' then 1 when 'in_progress' then 2
    when 'resolved' then 3 when 'closed' then 4 else 0 end;
  v_new_rank := case p_new_status
    when 'open' then 1 when 'in_progress' then 2
    when 'resolved' then 3 when 'closed' then 4 else 0 end;

  if v_new_rank > v_old_rank + 1 then
    raise exception 'bug_status_transition_skipped' using errcode = '45310';
  end if;
  if v_new_rank <= v_old_rank then
    raise exception 'bug_status_transition_backward' using errcode = '45311';
  end if;

  -- 4. Mutation, re-scoped to THIS bug only (never a broader WHERE).
  update public.bugs
    set status = p_new_status
    where id = p_bug_id;

  -- 5. Audit. assignee_user_id is snapshotted at write time so BK-212's
  --    future consumer knows WHO to notify without a live join (mirrors
  --    0053's own reason for snapshotting payload at write time).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'bug', p_bug_id, 'bug.status_changed',
    jsonb_build_object(
      'previous_status', v_old_status,
      'status', p_new_status,
      'assignee_user_id', v_assignee_user_id
    )
  );

  -- 6. Return the composed bug json.
  return public.bunkai_bug_json(p_bug_id);
end;
$$;

revoke execute on function public.bunkai_transition_bug_status(uuid, text) from public, anon;
grant execute on function public.bunkai_transition_bug_status(uuid, text) to authenticated;
