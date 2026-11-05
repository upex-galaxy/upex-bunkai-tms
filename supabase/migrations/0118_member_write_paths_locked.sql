-- Migration: 0118 — funnel every membership write through locked RPCs (BK-1589)
-- Authored: 2026-11-05
--
-- Governing record: the BK-1589 AI Product Owner ruling of 2026-11-05 (G1-G6),
-- ADR-0012 (RPC authorization invariant) and ADR-0022 with its 2026-11-05
-- addendum. Additive and idempotent: no table, column or row is removed; every
-- object is `create or replace`, `drop policy if exists` or a `revoke`.
--
-- What it does:
--   1. G1: drops the INSERT, UPDATE and DELETE policies of workspace_members
--      and revokes those table privileges from anon and authenticated.

-- ============================================================================
-- 1. workspace_members — no write path through a user session (G1)
-- ============================================================================
-- Every shipped writer already bypasses user-session RLS: bootstrap (0006),
-- leave (0044) and removal (0114) are SECURITY DEFINER, and invite accept runs
-- on the service role. What the 0114 ladder policies still allowed was the
-- problem: an Admin could add a lower-ranked row with no invite, and delete one
-- with none of the removal side effects. Replaying those side effects in a
-- trigger was rejected (two code paths to one operation drift), so the write
-- path goes away instead. The privileges go too, so a future permissive policy
-- cannot reopen it. SELECT is unchanged (0084a). bunkai_caller_workspace_rank
-- stays: dropping it is not needed to close the gap.

drop policy if exists workspace_members_insert_admin on public.workspace_members;
drop policy if exists workspace_members_update_admin on public.workspace_members;
drop policy if exists workspace_members_delete_admin on public.workspace_members;

revoke insert, update, delete, truncate on public.workspace_members from public, anon, authenticated;

-- ============================================================================
-- 2. bunkai_assign_bug — the assignee's member row is locked first (G2)
-- ============================================================================
-- Global lock order for membership work: member rows (in user_id order), then
-- Bugs. Removal (0114) already takes them in that order, so an assign to a
-- member being removed either commits first (removal then sees the Bug and
-- unassigns it) or waits and fails 45312 on the locked read. Never a Bug left
-- assigned to a removed member. Called from inside removal the row is already
-- ours, and removal only ever unassigns, which takes no member lock.
--
-- Body copied forward from 0054. Changes: the eligibility read is FOR UPDATE;
-- the caller is re-checked after it (a wait can now outlast the caller's own
-- membership, same rule as 0114 step 4); and the Bug is locked and re-read
-- before the write, so the no-op test and the event's previous assignee never
-- describe the Bug as it was before the wait.
create or replace function public.bunkai_assign_bug(
  p_bug_id           uuid,
  p_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id      uuid;
  v_previous_assignee uuid;
  v_assignee_status   text;
  v_assignee_role     text;
  v_action            text;
begin
  -- 1. Resolve the bug. A nonexistent bug OR one in a workspace the caller
  --    isn't even a member of both raise the SAME not-found (non-disclosure).
  select workspace_id, assignee_user_id
    into v_workspace_id, v_previous_assignee
    from public.bugs
    where id = p_bug_id;
  if v_workspace_id is null or not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'bug_not_found' using errcode = 'P0002';
  end if;

  -- 2. Write-role gate. Disclosed as a DISTINCT error from not-found — safe,
  --    since the caller (a genuine member) can already SELECT this bug.
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. No-op: identical assign/unassign — silent, no audit row (mirrors
  --    0023's no-op convention for a same-parent module move).
  if p_assignee_user_id is not distinct from v_previous_assignee then
    return public.bunkai_bug_json(p_bug_id);
  end if;

  -- 4. Assignee eligibility (only when assigning/reassigning to someone, not
  --    on unassign) — the ONE cross-user read this function needs: a
  --    workspace_members row for a user OTHER than the caller, scoped to the
  --    bug's OWN already-authorized workspace_id. Locked, so a removal cannot
  --    pass between this check and the write.
  if p_assignee_user_id is not null then
    select status, role into v_assignee_status, v_assignee_role
      from public.workspace_members
      where workspace_id = v_workspace_id
        and user_id = p_assignee_user_id
      for update;
    if v_assignee_status is distinct from 'active' then
      raise exception 'bug_assignee_not_workspace_member' using errcode = '45312';
    end if;
    if v_assignee_role = 'viewer' then
      raise exception 'bug_assignee_view_only' using errcode = '45313';
    end if;

    -- The lock above may have waited: re-validate the caller against what
    -- committed meanwhile, same answers as steps 1 and 2.
    if not public.bunkai_is_workspace_member(v_workspace_id) then
      raise exception 'bug_not_found' using errcode = 'P0002';
    end if;
    if not public.bunkai_can_write_workspace(v_workspace_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- 5. Lock the Bug (members first, then Bugs) and re-read it: step 3 and the
  --    event below must describe the Bug as it is now, not before the wait.
  select assignee_user_id into v_previous_assignee
    from public.bugs
    where id = p_bug_id
    for update;
  if not found then
    raise exception 'bug_not_found' using errcode = 'P0002';
  end if;
  if p_assignee_user_id is not distinct from v_previous_assignee then
    return public.bunkai_bug_json(p_bug_id);
  end if;

  -- 6. Mutation, re-scoped to THIS bug only (never a broader WHERE).
  update public.bugs
    set assignee_user_id = p_assignee_user_id
    where id = p_bug_id;

  -- 7. Audit — action depends on the old/new assignment state.
  v_action := case
    when v_previous_assignee is null then 'bug.assigned'
    when p_assignee_user_id is null then 'bug.unassigned'
    else 'bug.reassigned'
  end;
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'bug', p_bug_id, v_action,
    jsonb_build_object(
      'previous_assignee_user_id', v_previous_assignee,
      'assignee_user_id', p_assignee_user_id
    )
  );

  -- 8. Return the composed bug json.
  return public.bunkai_bug_json(p_bug_id);
end;
$$;

-- ============================================================================
-- 3. bunkai_leave_workspace — the same lock as removal (G3)
-- ============================================================================
-- Leave adopts the 0114 lock: the caller's row plus the workspace's active owner
-- rows, in user_id order, FOR UPDATE, and then the caller is re-validated under
-- it. That serializes Leave against Remove on the same member (whoever waits
-- finds the row gone and answers not found) and closes the co-owner race 0044
-- documented as accepted debt: of two Owners leaving at once, the second now
-- sees no other Owner and gets sole_owner. Declared in the BK-1589 ruling, so
-- this is not an unplanned security change (ADR-0012).
--
-- Body copied forward from 0044. The guards and the writes are unchanged; a
-- leaver's Bugs stay assigned, as they always have (BK-1589 AI Tech Lead
-- decision). Not covered: two leaves of one user from two DIFFERENT workspaces
-- can both pass last_membership (out of scope in G3).
create or replace function public.bunkai_leave_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_total_active_memberships int;
  v_other_active_owners int;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Only a member gets to take locks in this workspace.
  select role into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = v_user_id
    and status = 'active';

  if v_role is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  perform 1
     from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and (wm.user_id = v_user_id or (wm.role = 'owner' and wm.status = 'active'))
    order by wm.user_id
    for update;

  -- Re-validate against what committed while waiting.
  v_role := null;
  select role into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = v_user_id
    and status = 'active';

  if v_role is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  select count(*) into v_total_active_memberships
  from public.workspace_members
  where user_id = v_user_id
    and status = 'active';

  if v_total_active_memberships <= 1 then
    raise exception 'last_membership' using errcode = '45212';
  end if;

  if v_role = 'owner' then
    select count(*) into v_other_active_owners
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id <> v_user_id
      and status = 'active'
      and role = 'owner';

    if v_other_active_owners = 0 then
      raise exception 'sole_owner' using errcode = '45213';
    end if;
  end if;

  delete from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = v_user_id;

  update public.access_tokens
  set revoked_at = now()
  where user_id = v_user_id
    and workspace_id = p_workspace_id
    and revoked_at is null;
end;
$$;
