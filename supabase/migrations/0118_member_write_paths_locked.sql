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
--   2. G2: bunkai_assign_bug locks the assignee's member row before the Bug.
--   3. G3: bunkai_leave_workspace takes the same lock as removal (0114).
--   4. G4: bunkai_accept_workspace_invite moves invite accept into one
--      transaction that re-validates the inviter under lock and fails closed.

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

-- ============================================================================
-- 4. bunkai_accept_workspace_invite — one transaction, inviter re-validated (G4)
-- ============================================================================
-- Before this, accept was a route making separate service-role calls, with no
-- transaction to lock in, and it never looked at the inviter. A removed or
-- demoted Admin could keep a pre-issued admin invite as a backdoor. The invite
-- stays listed so an Admin can revoke it; it is simply not redeemable while its
-- inviter lacks the authority. This tightens one line of the BK-572 PO-1 ruling.
--
-- AUTHORIZATION (ADR-0012). The route serves cookie and PAT callers through the
-- admin client, so auth.uid() is null there and p_user_id cannot be deleted.
-- EXECUTE goes to service_role ONLY: no user session may reach this past the
-- route's token hash and email gate. The bind at step 0 still refuses a session
-- that is not the user named. The only row returned is the invite's own.
--
-- LOCK ORDER (global, BK-1589): member rows in user_id order, then the workspace,
-- then the invite row. Removal (0114) goes members, Bugs, invites. Workspace
-- deletion (0084) goes workspace, invites, so the workspace comes first here or
-- the two could deadlock. FOR SHARE on the workspace makes an accept wait for a
-- deletion in flight and then see it.
--
-- Check order under the locks:
--   1. invite or workspace gone, or workspace deleted -> P0002 invite_not_found
--      (the route answers its never-existed 404, BK-988)
--   2. invite revoked / accepted / expired            -> 45224, by message
--   3. invitee already holds an equal or higher role  -> 45223 (BK-62; before the
--      inviter check so AC-4.6 reads the same as the route's early refusal)
--   4. inviter null, gone, not active, not admin or
--      owner, or ranked below the invite's role       -> 45222 inviter_not_authorized
--
-- Error codes, re-verified on 2026-11-05 against migrations, app, lib and the one
-- open PR: 45220/45221 are 0114's, 45222-45224 had no hit.
create or replace function public.bunkai_accept_workspace_invite(
  p_invite_id uuid,
  p_user_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id    uuid;
  v_inviter         uuid;
  v_role            text;
  v_accepted_at     timestamptz;
  v_revoked_at      timestamptz;
  v_expires_at      timestamptz;
  v_deleted_at      timestamptz;
  v_existing_role   text;
  v_existing_status text;
  v_inviter_role    text;
begin
  -- 0. Actor bind.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  -- Which rows to lock. Nothing here is trusted past the locks below.
  select i.workspace_id, i.invited_by_user_id
    into v_workspace_id, v_inviter
    from public.workspace_invites i
   where i.id = p_invite_id;
  if v_workspace_id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  perform 1
     from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id in (v_inviter, p_user_id)
    order by wm.user_id
    for update;

  select w.deleted_at into v_deleted_at
    from public.workspaces w
   where w.id = v_workspace_id
     for share;
  if not found or v_deleted_at is not null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  select i.role, i.accepted_at, i.revoked_at, i.expires_at
    into v_role, v_accepted_at, v_revoked_at, v_expires_at
    from public.workspace_invites i
   where i.id = p_invite_id
     for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  -- 2. Pending, as committed now.
  if v_revoked_at is not null then
    raise exception 'invite_revoked' using errcode = '45224';
  end if;
  if v_accepted_at is not null then
    raise exception 'invite_already_accepted' using errcode = '45224';
  end if;
  if v_expires_at < now() then
    raise exception 'invite_expired' using errcode = '45224';
  end if;

  -- 3. An accept must never demote (BK-62).
  select wm.role, wm.status into v_existing_role, v_existing_status
    from public.workspace_members wm
   where wm.workspace_id = v_workspace_id
     and wm.user_id = p_user_id;
  if v_existing_status = 'active'
     and public.bunkai_workspace_role_rank(v_role) <= public.bunkai_workspace_role_rank(v_existing_role) then
    raise exception 'already_member_equal_or_higher_role' using errcode = '45223';
  end if;

  -- 4. The inviter still holds the authority the invite was issued under. A null
  --    inviter (account deleted, FK is on delete set null) fails closed.
  select wm.role into v_inviter_role
    from public.workspace_members wm
   where wm.workspace_id = v_workspace_id
     and wm.user_id = v_inviter
     and wm.status = 'active';
  if v_inviter_role is null
     or v_inviter_role not in ('admin', 'owner')
     or public.bunkai_workspace_role_rank(v_inviter_role) < public.bunkai_workspace_role_rank(v_role) then
    raise exception 'inviter_not_authorized' using errcode = '45222';
  end if;

  -- 5. Writes. With no row to lock at step 3, two different invites can race to
  --    insert this user; the conflict clause holds the never-demote rule there.
  insert into public.workspace_members as wm (workspace_id, user_id, role, status)
  values (v_workspace_id, p_user_id, v_role, 'active')
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        status = 'active'
    where wm.status <> 'active'
       or public.bunkai_workspace_role_rank(excluded.role) > public.bunkai_workspace_role_rank(wm.role);
  if not found then
    raise exception 'already_member_equal_or_higher_role' using errcode = '45223';
  end if;

  update public.workspace_invites
     set accepted_at = now(),
         accepted_by_user_id = p_user_id
   where id = p_invite_id;

  return jsonb_build_object('workspace_id', v_workspace_id, 'role', v_role);
end;
$$;

revoke all on function public.bunkai_accept_workspace_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bunkai_accept_workspace_invite(uuid, uuid) to service_role;

-- 0085 hands every new function to the QA roles; this one takes an identity
-- parameter and writes, so neither QA role keeps it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_accept_workspace_invite(uuid, uuid) from qa_inspector_ro;
  end if;
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke all on function public.bunkai_accept_workspace_invite(uuid, uuid) from qa_inspector_rw;
  end if;
end;
$$;

-- Verification (run after apply):
--   select policyname from pg_policies where tablename = 'workspace_members';            -- only the select policy
--   select has_table_privilege('authenticated', 'public.workspace_members', 'DELETE');   -- false
--   select has_function_privilege('authenticated', 'public.bunkai_accept_workspace_invite(uuid,uuid)', 'EXECUTE'); -- false
