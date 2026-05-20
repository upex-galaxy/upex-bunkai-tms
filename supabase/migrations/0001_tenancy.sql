-- Migration: 0001 — tenancy (workspaces, workspace_members)
-- Authored: 2026-05-19
--
-- Establishes the multi-tenant root. `workspaces` is the tenant boundary; every
-- downstream table resolves a row's tenant by walking back to a workspace_id.
-- `workspace_members` is the RBAC join: a user only sees a workspace's data
-- when an active membership row exists.
--
-- RLS strategy (per .context/SRS/architecture-specs.md §2.4):
--   * SELECT: caller is an active member of the row's workspace.
--   * Mutations on workspaces: owner only (role = 'owner', status = 'active').
--   * Mutations on workspace_members: admin or owner only.
--
-- Note: pgcrypto is assumed already enabled in the target Supabase project; we
-- still create-if-missing for self-hosted (Phase 2) safety.
--
-- ORDER: tables are created in dependency order BEFORE any policy references
-- them. RLS policies that EXISTS-subquery another table require that table to
-- already be in the catalog at policy-creation time.

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. TABLES (create both before any policies)
-- =============================================================================

create table if not exists public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  owner_user_id   uuid not null references auth.users(id) on delete restrict,
  plan            text not null default 'community'
                    check (plan in ('community','cloud','enterprise')),
  created_at      timestamptz not null default now()
);

create index if not exists workspaces_owner_user_id_idx
  on public.workspaces (owner_user_id);

create table if not exists public.workspace_members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member'
                  check (role in ('viewer','member','admin','owner')),
  status        text not null default 'active'
                  check (status in ('active','invited','suspended')),
  joined_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Reverse lookup index: "what workspaces does this user belong to?" is the
-- dominant query path for RLS subqueries on every other table.
create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

-- =============================================================================
-- 2. RLS — enable on both
-- =============================================================================

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- =============================================================================
-- 3. POLICIES — workspaces
-- =============================================================================

-- SELECT: caller is an active member of the workspace
drop policy if exists workspaces_select_active_member on public.workspaces;
create policy workspaces_select_active_member
  on public.workspaces
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT: only the caller can declare themselves the owner of a new workspace
drop policy if exists workspaces_insert_self_owner on public.workspaces;
create policy workspaces_insert_self_owner
  on public.workspaces
  for insert
  with check (
    auth.uid() = owner_user_id
  );

-- UPDATE: owner role, active membership
drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner
  on public.workspaces
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
        and wm.status = 'active'
    )
  );

-- DELETE: owner role, active membership
drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner
  on public.workspaces
  for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
        and wm.status = 'active'
    )
  );

-- =============================================================================
-- 4. POLICIES — workspace_members
-- =============================================================================

-- SELECT: caller can see their own membership row, OR caller is admin/owner of
-- the workspace and can therefore see the full member list.
drop policy if exists workspace_members_select_self_or_admin on public.workspace_members;
create policy workspace_members_select_self_or_admin
  on public.workspace_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('admin','owner')
        and wm.status = 'active'
    )
  );

-- INSERT: admin or owner of the target workspace
drop policy if exists workspace_members_insert_admin on public.workspace_members;
create policy workspace_members_insert_admin
  on public.workspace_members
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('admin','owner')
        and wm.status = 'active'
    )
  );

-- UPDATE: admin or owner of the target workspace
drop policy if exists workspace_members_update_admin on public.workspace_members;
create policy workspace_members_update_admin
  on public.workspace_members
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('admin','owner')
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('admin','owner')
        and wm.status = 'active'
    )
  );

-- DELETE: admin or owner of the target workspace
drop policy if exists workspace_members_delete_admin on public.workspace_members;
create policy workspace_members_delete_admin
  on public.workspace_members
  for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('admin','owner')
        and wm.status = 'active'
    )
  );
