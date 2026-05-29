-- Migration: 0011 — Split auth secret hashes into sibling tables
-- Authored: 2026-05-29
--
-- WHY: QA inspection roles (qa_inspector_ro/_rw) can read auth secret hashes
-- (access_tokens.hash, magic_link_tokens.token_hash/ip_hash,
-- workspace_invites.token_hash). Postgres cannot hide a single column once a
-- table-level SELECT grant exists, and an ALTER DEFAULT PRIVILEGES rule
-- auto-grants every NEW public table to the QA roles. So we invert the
-- problem: move each secret into a 1:1 sibling table, keep the main table
-- open by default, and explicitly REVOKE the secret tables from QA.
--
-- This is the EXPAND step. Legacy columns are made nullable (and their UNIQUE
-- constraints dropped) so application code can stop writing them; the columns
-- are dropped later in 0012 after verification. All secret access runs through
-- service_role (admin client), which bypasses RLS + grants.

-- =============================================================================
-- 1. access_token_secrets
-- =============================================================================
create table public.access_token_secrets (
  token_id uuid primary key references public.access_tokens (id) on delete cascade,
  hash     text not null
);

insert into public.access_token_secrets (token_id, hash)
  select id, hash from public.access_tokens;

alter table public.access_token_secrets enable row level security;
-- No policies: anon/authenticated are blocked at the PostgREST/RLS layer.
-- service_role bypasses RLS for the app's verify/mint paths.
revoke all on public.access_token_secrets from anon, authenticated, qa_inspector_ro, qa_inspector_rw;
grant select, insert, update, delete on public.access_token_secrets to service_role;

comment on table public.access_token_secrets is
  'Secret material for access_tokens (SHA-256 of the PAT secret). Isolated so QA/analytics roles with read access to access_tokens cannot read the hash. service_role only.';

-- =============================================================================
-- 2. magic_link_token_secrets
-- =============================================================================
create table public.magic_link_token_secrets (
  magic_link_token_id uuid primary key references public.magic_link_tokens (id) on delete cascade,
  token_hash          text not null unique,
  ip_hash             text
);

insert into public.magic_link_token_secrets (magic_link_token_id, token_hash, ip_hash)
  select id, token_hash, ip_hash from public.magic_link_tokens;

alter table public.magic_link_token_secrets enable row level security;
revoke all on public.magic_link_token_secrets from anon, authenticated, qa_inspector_ro, qa_inspector_rw;
grant select, insert, update, delete on public.magic_link_token_secrets to service_role;

comment on table public.magic_link_token_secrets is
  'Secret material for magic_link_tokens (token_hash + hashed client IP). Isolated from QA/analytics read access. service_role only.';

-- =============================================================================
-- 3. workspace_invite_secrets
-- =============================================================================
create table public.workspace_invite_secrets (
  invite_id  uuid primary key references public.workspace_invites (id) on delete cascade,
  token_hash text not null unique
);

insert into public.workspace_invite_secrets (invite_id, token_hash)
  select id, token_hash from public.workspace_invites;

alter table public.workspace_invite_secrets enable row level security;
revoke all on public.workspace_invite_secrets from anon, authenticated, qa_inspector_ro, qa_inspector_rw;
grant select, insert, update, delete on public.workspace_invite_secrets to service_role;

comment on table public.workspace_invite_secrets is
  'Secret material for workspace_invites (SHA-256 of the invite token). Isolated from QA/analytics read access. service_role only.';

-- =============================================================================
-- 4. Make legacy secret columns dormant (dropped in 0012 after verification)
-- =============================================================================
alter table public.access_tokens     alter column hash       drop not null;

alter table public.magic_link_tokens alter column token_hash drop not null;
alter table public.magic_link_tokens drop constraint magic_link_tokens_token_hash_key;

alter table public.workspace_invites alter column token_hash drop not null;
alter table public.workspace_invites drop constraint workspace_invites_token_hash_key;
