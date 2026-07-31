-- Migration: 0044 — self-service "leave workspace" RPC (BK-90 Slice A)
-- Authored: 2026-07-31
--
-- NOTE ON NUMBERING: 0042/0043 are already taken (and already applied to this
-- shared remote project) by a concurrent BK-35 story ("mark run step" +
-- realtime replication) whose branch had not yet merged into staging at the
-- time this migration was authored. 0044 is the genuinely next-free ordinal
-- confirmed against both the repo's local migrations directory and the
-- remote `supabase_migrations.schema_migrations` ledger.
--
-- Adds `bunkai_leave_workspace(p_workspace_id uuid) returns void`, a
-- SECURITY DEFINER RPC that lets the caller remove their own
-- `workspace_members` row, following the `bunkai_bootstrap_workspace`
-- (migration 0006) precedent for an atomic multi-step workspace transaction.
--
-- Guards (Technical Decisions 1-3, STORY-BK-90):
--   1. not_authenticated (42501) — auth.uid() is null (defensive backstop;
--      the wrapping route already rejects Bearer/PAT callers before this RPC
--      ever runs, and a cookie session always resolves auth.uid()).
--   2. not_a_member (P0002) — caller has no active membership row for the
--      target workspace. Defense-in-depth: the UI never offers "Leave" for a
--      workspace it cannot see, but the RPC must not trust the client.
--      Reuses this repo's established not-found/non-disclosure P0002
--      convention (see 0021/0025/0028/0032/0036/etc.) rather than minting a
--      new code for a case that is already "not found" in shape.
--   3. last_membership (45212) — caller has <= 1 total active membership
--      (Decision 2's server-side backstop: leaving your only workspace is
--      blocked, even though the UI hides the action entirely in this case —
--      the RPC must not trust the client here either).
--   4. sole_owner (45213) — caller's role is 'owner' and no OTHER active
--      owner row remains in the same workspace (Decision 1: count-based, not
--      identity-based — any owner may leave as long as >= 1 other active
--      owner survives; no ownership-transfer sub-flow in this story's scope).
--
-- 45212/45213 confirmed free at authoring time via:
--   grep -rhoE "errcode = '4[0-9]{4}'" supabase/migrations/*.sql | sort -u
-- (current max in use was 45211).
--
-- On success: deletes the caller's workspace_members row, then soft-revokes
-- (revoked_at = now()) the caller's workspace-scoped access_tokens for that
-- workspace (Decision 3), reusing BK-88's exact revocation mechanism
-- (migration 0008) — no new column.
--
-- Edge case — concurrent co-owner leaves: two co-owners leaving near-
-- simultaneously could both pass the owner-count check before either commits
-- (read-committed snapshot). Accepted per the story's Risk 1 — a possible
-- future `SELECT ... FOR UPDATE` hardening, out of scope here (Scope requires
-- "enforced server-side", not "fully serialized").
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

-- Permission shape mirrors 0005/0006: `authenticated` needs EXECUTE (the only
-- safe entry point for a logged-in user to remove their own membership);
-- `anon`/`public` get nothing.
revoke execute on function public.bunkai_leave_workspace(uuid) from public, anon;
grant execute on function public.bunkai_leave_workspace(uuid) to authenticated;
