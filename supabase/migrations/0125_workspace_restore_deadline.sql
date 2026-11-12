-- Migration: 0125 — Refuse a workspace restore once the 30-day window closed (BK-1735, defect of BK-512 AC-07)
-- Authored: 2026-11-12
--
-- 0084's bunkai_restore_workspace_deletion only refused a workspace that was
-- not deleted. A workspace past its 30-day deadline stayed restorable until
-- the daily purge (03:00 UTC) removed it: up to ~24h beyond what the Owner is
-- told. This redefines the function with a deadline guard that uses the SAME
-- predicate as bunkai_purge_deleted_workspaces (deleted_at <= now() - interval
-- '30 days'), so "purgeable" and "no longer restorable" are one definition.
--
-- New SQLSTATE in the workspace-deletion block (0084: 45900-45902):
--   45903  restore_window_closed  (restore attempted past the 30-day deadline)
--
-- Everything else is unchanged from 0084: SECURITY DEFINER, search_path = '',
-- owner-only check (ADR-0012), same grants. Additive and idempotent
-- (create or replace + revoke/grant restated).

create or replace function public.bunkai_restore_workspace_deletion(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_deleted_at timestamptz;
  v_workspace_name text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select role into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = v_user_id
    and status = 'active';

  if v_role is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  if v_role <> 'owner' then
    raise exception 'owner_only' using errcode = '45900';
  end if;

  select deleted_at, name into v_deleted_at, v_workspace_name
  from public.workspaces
  where id = p_workspace_id
  for update;

  if v_workspace_name is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  if v_deleted_at is null then
    raise exception 'not_deleted' using errcode = '45902';
  end if;

  -- Same predicate as bunkai_purge_deleted_workspaces (0084 section 7).
  if v_deleted_at <= now() - interval '30 days' then
    raise exception 'restore_window_closed' using errcode = '45903';
  end if;

  update public.workspaces
  set deleted_at = null,
      deletion_requested_by = null
  where id = p_workspace_id;

  return jsonb_build_object('workspace_id', p_workspace_id, 'workspace_name', v_workspace_name);
end;
$$;

revoke execute on function public.bunkai_restore_workspace_deletion(uuid) from public, anon;
grant execute on function public.bunkai_restore_workspace_deletion(uuid) to authenticated;
