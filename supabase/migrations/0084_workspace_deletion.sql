-- Migration: 0084 — Delete a workspace I own (BK-512), per ADR-0015
-- Authored: 2026-08-30
--
-- ADR-0015 (supersedes ADR-0013): soft-delete with a 30-day grace period,
-- access revoked immediately for everyone including the owner, no member
-- veto. This migration implements ADR-0015 points 1-8 and 10.
--
-- Custom SQLSTATE codes allocated for the workspace-deletion domain (class
-- 45xxx, 459xx block — current max in use elsewhere is 45803, confirmed via
--   grep -rhoE "errcode = '[0-9P][0-9A-Za-z]{4}'" supabase/migrations/*.sql | sort -u
-- ):
--   45900  owner_only        (caller is an active member but not 'owner')
--   45901  already_deleted   (workspace already has deleted_at set — the
--                              idempotent-double-submit guard, Scenario N5)
--   45902  not_deleted       (restore attempted on a workspace that is not
--                              currently soft-deleted)
-- not_authenticated (42501) and not_found (P0002) reuse the established
-- codes from 0044_leave_workspace.sql.

-- ============================================================================
-- 1. workspaces — soft-delete columns (ADR-0015 point 1)
-- ============================================================================

alter table public.workspaces
  add column if not exists deleted_at timestamptz null,
  add column if not exists deletion_requested_by uuid null references auth.users(id) on delete restrict;

create index if not exists workspaces_deleted_at_idx
  on public.workspaces (deleted_at)
  where deleted_at is not null;

-- ============================================================================
-- 2. workspace_deletions — audit tombstone, OUTSIDE the cascade (ADR-0015
--    point 8 / AC-17). `workspace_id` is deliberately NOT a foreign key to
--    `workspaces(id)` — a FK there (cascade or otherwise) would either be
--    destroyed by the purge it exists to survive, or block the purge
--    outright. This is the only structure in the deletion design that
--    outlives `bunkai_purge_deleted_workspaces`.
-- ============================================================================

create table if not exists public.workspace_deletions (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null,
  workspace_name     text not null,
  workspace_slug     text not null,
  requested_by       uuid not null references auth.users(id) on delete restrict,
  requested_at       timestamptz not null default now(),
  purge_deadline     timestamptz not null,
  purged_at          timestamptz null,
  member_count       int not null default 0,
  row_count_digest   jsonb not null default '{}'::jsonb
);

create index if not exists workspace_deletions_workspace_id_idx
  on public.workspace_deletions (workspace_id);

-- Locked down entirely: no SELECT/INSERT/UPDATE policy is defined, so no
-- `authenticated`/`anon` role can read or write this table over PostgREST.
-- Every write happens inside the SECURITY DEFINER functions below, which
-- bypass RLS. There is no product surface reading this table in this story
-- (out of scope — see PR body); `service_role` bypasses RLS regardless.
alter table public.workspace_deletions enable row level security;

-- ============================================================================
-- 3. Structural read filter (ADR-0015 point 6) — 5 objects total: this
--    policy plus the 4 helpers in 0005_rls_helpers.sql, re-created below.
--    Together they cover every `from('workspaces')` cookie-session read site
--    per ADR-0001 Path B, without touching 43 call sites individually.
-- ============================================================================

drop policy if exists workspaces_select_active_member on public.workspaces;
create policy workspaces_select_active_member on public.workspaces
  for select using (
    deleted_at is null
    and public.bunkai_is_workspace_member(id)
  );

create or replace function public.bunkai_is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and w.deleted_at is null
  );
$$;

create or replace function public.bunkai_can_write_workspace(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role in ('member','admin','owner')
      and w.deleted_at is null
  );
$$;

create or replace function public.bunkai_is_workspace_admin(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role in ('admin','owner')
      and w.deleted_at is null
  );
$$;

create or replace function public.bunkai_is_workspace_owner(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = 'owner'
      and w.deleted_at is null
  );
$$;

-- ============================================================================
-- 4. workspace_members_select_self_or_admin — the AC-10 fix (autonomous-
--    delivery review finding). Unlike the four helpers above, this policy
--    (0001_tenancy.sql:139-153) queries `workspace_members` directly with NO
--    join to `workspaces`, so a caller's OWN membership row for a deleted
--    workspace stayed visible even after point 6's structural fix — the
--    exact gap `app/(app)/onboarding/page.tsx` reads through, producing the
--    projects <-> onboarding redirect loop for a sole owner who just deleted
--    their only workspace. Wrapping the whole USING clause in a workspace-
--    liveness check closes it for both branches (self row and admin/owner
--    visibility into a co-member's row) at once.
-- ============================================================================

drop policy if exists workspace_members_select_self_or_admin on public.workspace_members;
create policy workspace_members_select_self_or_admin
  on public.workspace_members
  for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.deleted_at is null
    )
    and (
      user_id = auth.uid()
      or exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = workspace_members.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('admin','owner')
          and wm.status = 'active'
      )
    )
  );

-- ============================================================================
-- 5. bunkai_request_workspace_deletion — SECURITY DEFINER. ADR-0015 points
--    2-5, 7-9 (request half). Modelled on bunkai_leave_workspace (0044).
--
-- AUTHORIZATION. No actor parameter (ADR-0012's preferred outcome, per ADR-
-- 0015 point 2) — auth.uid() is read inline. Caller must hold an ACTIVE
-- 'owner' membership row (point 3); a non-member gets not_found (P0002, non-
-- disclosure convention), a non-owner member gets owner_only (45900).
--
-- v_other_active_owners is retained as a cheap invariant check (ADR-0015
-- point 3 / brief §7(a)) even though it is currently a no-op: this product
-- has no path to a second active 'owner' row on one workspace (no ownership-
-- transfer flow exists), so the branch can never be exercised today. Kept
-- for parity with 0044's shape and as a tripwire if that ever changes.
--
-- ADR-0015 point 4: deletion is NEVER blocked by other members' presence —
-- no count-of-members gate exists here at all (unlike 0044's leave guard).
--
-- IDEMPOTENCE (Scenario N5): a workspace already soft-deleted raises
-- already_deleted (45901) rather than silently re-stamping deleted_at, so a
-- lost double-submit race is refused cleanly instead of resetting the grace
-- clock.
--
-- Immediate eviction (point 5): PATs and pending invites for the workspace
-- are revoked in the same transaction as the deleted_at stamp, so they die
-- at the same instant as read access — not at purge time.
--
-- Tombstone (point 8 / AC-17): written in the same transaction, so AC-18
-- ("failed deletion leaves the workspace whole") holds for free — a raised
-- exception rolls back every write in this function, tombstone included.
--
-- Recipients (point 9): returned to the caller as part of the response
-- rather than emailed from inside Postgres — neither pg_net nor http is
-- installed on this project (confirmed by 0075's header), so there is no
-- path from a DEFINER function out to Resend. The app-layer route sends the
-- email after this RPC returns, mirroring 0075's documented reasoning for
-- why BK-214's digest sender is an app-layer route and not a DB trigger.
-- ============================================================================

create or replace function public.bunkai_request_workspace_deletion(p_workspace_id uuid)
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
  v_workspace_slug text;
  v_other_active_owners int;
  v_other_member_count int;
  v_purge_deadline timestamptz;
  v_digest jsonb;
  v_recipients jsonb;
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

  select deleted_at, name, slug into v_deleted_at, v_workspace_name, v_workspace_slug
  from public.workspaces
  where id = p_workspace_id
  for update;

  if v_workspace_name is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  if v_deleted_at is not null then
    raise exception 'already_deleted' using errcode = '45901';
  end if;

  -- Cheap invariant, currently unreachable (see header comment).
  select count(*) into v_other_active_owners
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id <> v_user_id
    and status = 'active'
    and role = 'owner';

  v_purge_deadline := now() + interval '30 days';

  update public.workspaces
  set deleted_at = now(),
      deletion_requested_by = v_user_id
  where id = p_workspace_id;

  update public.access_tokens
  set revoked_at = now()
  where workspace_id = p_workspace_id
    and revoked_at is null;

  update public.workspace_invites
  set revoked_at = now()
  where workspace_id = p_workspace_id
    and accepted_at is null
    and revoked_at is null;

  select count(*) into v_other_member_count
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id <> v_user_id
    and status = 'active';

  v_digest := jsonb_build_object(
    'projects', (select count(*) from public.projects where workspace_id = p_workspace_id),
    'tests', (select count(*) from public.tests where workspace_id = p_workspace_id),
    'runs', (select count(*) from public.runs where workspace_id = p_workspace_id),
    'bugs', (select count(*) from public.bugs where workspace_id = p_workspace_id),
    'workspace_members', (select count(*) from public.workspace_members where workspace_id = p_workspace_id and status = 'active')
  );

  insert into public.workspace_deletions (
    workspace_id, workspace_name, workspace_slug, requested_by,
    requested_at, purge_deadline, member_count, row_count_digest
  )
  values (
    p_workspace_id, v_workspace_name, v_workspace_slug, v_user_id,
    now(), v_purge_deadline, v_other_member_count + 1, v_digest
  );

  select coalesce(jsonb_agg(jsonb_build_object('email', u.email)), '[]'::jsonb)
  into v_recipients
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id and u.email is not null
  where wm.workspace_id = p_workspace_id
    and wm.status = 'active';

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'workspace_name', v_workspace_name,
    'workspace_slug', v_workspace_slug,
    'deleted_at', now(),
    'purge_deadline', v_purge_deadline,
    'other_member_count', v_other_member_count,
    'recipients', v_recipients
  );
end;
$$;

revoke execute on function public.bunkai_request_workspace_deletion(uuid) from public, anon;
grant execute on function public.bunkai_request_workspace_deletion(uuid) to authenticated;

-- ============================================================================
-- 6. bunkai_restore_workspace_deletion — SECURITY DEFINER. ADR-0015 point
--    10: "Restore during grace is deleted_at = null -- no data movement."
--
-- Reachable even though the workspace is invisible via RLS while
-- deleted_at is set: this function is SECURITY DEFINER and queries
-- workspace_members / workspaces directly, bypassing RLS internally, the
-- same as every other function in this migration. The caller's own
-- workspace_members row is untouched by the request RPC (only the workspace
-- row and the caller's tokens/invites are stamped), so the owner-role check
-- below works unchanged after a request.
-- ============================================================================

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

  update public.workspaces
  set deleted_at = null,
      deletion_requested_by = null
  where id = p_workspace_id;

  return jsonb_build_object('workspace_id', p_workspace_id, 'workspace_name', v_workspace_name);
end;
$$;

revoke execute on function public.bunkai_restore_workspace_deletion(uuid) from public, anon;
grant execute on function public.bunkai_restore_workspace_deletion(uuid) to authenticated;

-- ============================================================================
-- 7. bunkai_purge_deleted_workspaces — SECURITY DEFINER, service_role only.
--    ADR-0015 point 7. Scheduled on the 0075_run_inactivity_sweep.sql
--    template: pg_cron invokes it directly, no Edge Function / HTTP / secret
--    (ADR-0001 Path/principal reasoning carried over verbatim from 0075).
--
-- Per-workspace isolation mirrors 0075's per-run BEGIN/EXCEPTION block: one
-- bad workspace cannot strand the rest of the pass, and a mid-pass failure
-- leaves the remaining candidates for the next tick (idempotent — a
-- workspace already purged is no longer a candidate).
--
-- The existing ON DELETE CASCADE edges (0001, 0002, 0008, 0009, 0010, 0019,
-- 0024, 0031, 0046, 0053, 0064, 0073, 0077, 0083 — see PR body for the full
-- count re-verified against this branch) do the physical delete once the
-- `workspaces` row itself is removed. `workspace_deletions` is not one of
-- them by construction (section 2 above), so it survives.
-- ============================================================================

create or replace function public.bunkai_purge_deleted_workspaces()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_purged int := 0;
  v_failed int := 0;
begin
  for v_row in
    select id
    from public.workspaces
    where deleted_at is not null
      and deleted_at <= now() - interval '30 days'
    for update skip locked
  loop
    begin
      update public.workspace_deletions
      set purged_at = now()
      where workspace_id = v_row.id
        and purged_at is null;

      delete from public.workspaces where id = v_row.id;

      v_purged := v_purged + 1;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object('purged', v_purged, 'failed', v_failed);
end;
$$;

revoke execute on function public.bunkai_purge_deleted_workspaces() from public;
revoke execute on function public.bunkai_purge_deleted_workspaces() from anon;
revoke execute on function public.bunkai_purge_deleted_workspaces() from authenticated;
grant  execute on function public.bunkai_purge_deleted_workspaces() to service_role;

-- Once daily — a 30-day grace period has no reason to poll every 15 minutes
-- like 0075's abandoned-run sweep; a purge landing anywhere within the same
-- day of the deadline satisfies "permanently erased 30 days after".
select cron.schedule(
  'bunkai-purge-deleted-workspaces',
  '0 3 * * *',
  $$select public.bunkai_purge_deleted_workspaces()$$
);
