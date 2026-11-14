-- Migration: 0128 — Leave counts only memberships in live workspaces (BK-1901)
-- Authored: 2026-11-14
--
-- Defect BK-1901 (related story BK-859, Leave a workspace). Deleting a
-- workspace (BK-512, ADR-0015) soft-deletes it: `workspaces.deleted_at` is
-- stamped and its `workspace_members` rows stay `active`, so a restore inside
-- the 30-day grace brings every member back with no data movement. The
-- last_membership guard of bunkai_leave_workspace counted those rows as live
-- memberships. An account that owned a deleted workspace A and was a member of
-- B only could leave B and end with no live workspace, and an Owner in the same
-- position got the sole_owner block instead of last_membership.
--
-- What it does: redefines bunkai_leave_workspace on top of 0118 (the latest
-- definition). The guard now asks whether the caller keeps at least one
-- membership in a LIVE workspace (`deleted_at is null`) OTHER than the one
-- being left, and raises last_membership when none survives. For a live
-- workspace that is the same as "live memberships <= 1". Excluding the target
-- by id, instead of comparing a live count to 1, keeps leaving an already
-- deleted workspace allowed while the caller still holds a live one; a plain
-- live count would have refused that with a block that says they have no other
-- workspace. Leaving a deleted workspace stays reachable on purpose: 0089
-- audited this function and left a deleted target unguarded.
--
-- Not changed: the 0118 lock (the caller's row plus the workspace's active
-- owner rows, in user_id order, re-validated under it), the sole_owner guard,
-- the delete and the PAT revoke. The memberships of a deleted workspace are
-- NOT rewritten: restore keeps working, and the guard counts them again the
-- moment `deleted_at` goes back to null. No workspace row is locked, so the
-- global lock order (member rows, then Bugs) is unchanged. Not covered, same
-- class as the cross-workspace gap 0118 documents: a deletion of another
-- workspace that commits while this leave is running is not seen by it.
--
-- Additive and idempotent: one `create or replace function`. It keeps the
-- function's existing ACL (including the qa_inspector_rw grant); the
-- revoke/grant pair below is re-emitted verbatim from 0044 for idempotence
-- (0118 emits none for this function). Same SECURITY DEFINER and empty
-- search_path as 0118, so the ADR-0012 invariant holds: no actor parameter,
-- the caller is auth.uid().

create or replace function public.bunkai_leave_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_other_live_memberships int;
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

  -- BK-1901: a membership in a soft-deleted workspace is not a place to land.
  select count(*) into v_other_live_memberships
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = v_user_id
    and wm.status = 'active'
    and wm.workspace_id <> p_workspace_id
    and w.deleted_at is null;

  if v_other_live_memberships = 0 then
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

revoke execute on function public.bunkai_leave_workspace(uuid) from public, anon;
grant execute on function public.bunkai_leave_workspace(uuid) to authenticated;
