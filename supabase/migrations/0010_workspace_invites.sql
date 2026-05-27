-- Migration: 0010 — workspace_invites
-- Authored: 2026-05-27
--
-- BK-5 invite teammate. A workspace owner/admin issues an invite for an
-- email + role; the invitee redeems it by following a link that posts the
-- token to /api/v1/invites/accept.
--
-- Token is generated and hashed at issuance time. We store ONLY the hash so
-- DB compromise does not yield usable tokens (same shape as access_tokens).
-- The raw token is returned in the POST response exactly once and embedded
-- in the accept URL the inviter shares.

create table if not exists public.workspace_invites (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  email               text not null,
  role                text not null default 'member'
                        check (role in ('viewer','member','admin')),
  token_hash          text not null unique,
  invited_by_user_id  uuid null references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '7 days'),
  accepted_at         timestamptz null,
  accepted_by_user_id uuid null references auth.users(id) on delete set null,
  revoked_at          timestamptz null
);

create index if not exists workspace_invites_workspace_id_idx
  on public.workspace_invites (workspace_id);

create index if not exists workspace_invites_email_idx
  on public.workspace_invites (lower(email));

create index if not exists workspace_invites_expires_at_idx
  on public.workspace_invites (expires_at);

alter table public.workspace_invites enable row level security;

-- SELECT: workspace admins/owners see all invites for their workspace;
-- the invited email cannot enumerate other workspace invites via this table.
drop policy if exists workspace_invites_select_admin on public.workspace_invites;
create policy workspace_invites_select_admin
  on public.workspace_invites
  for select
  using ( public.bunkai_is_workspace_admin(workspace_id) );

-- INSERT: workspace admins/owners may issue invites for their workspace.
drop policy if exists workspace_invites_insert_admin on public.workspace_invites;
create policy workspace_invites_insert_admin
  on public.workspace_invites
  for insert
  with check ( public.bunkai_is_workspace_admin(workspace_id) );

-- UPDATE: admins/owners can revoke or refresh expiry. The acceptance flow
-- itself runs through service_role (see the /api/v1/invites/accept route).
drop policy if exists workspace_invites_update_admin on public.workspace_invites;
create policy workspace_invites_update_admin
  on public.workspace_invites
  for update
  using ( public.bunkai_is_workspace_admin(workspace_id) )
  with check ( public.bunkai_is_workspace_admin(workspace_id) );

-- DELETE: admins/owners only.
drop policy if exists workspace_invites_delete_admin on public.workspace_invites;
create policy workspace_invites_delete_admin
  on public.workspace_invites
  for delete
  using ( public.bunkai_is_workspace_admin(workspace_id) );
