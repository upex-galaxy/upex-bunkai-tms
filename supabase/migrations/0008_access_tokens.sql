-- Migration: 0008 — Personal access tokens (PATs) for CLI + AI-agent bearer auth
-- Authored: 2026-05-20
--
-- Issued via POST /api/v1/tokens (session-authenticated). The server returns
-- the raw secret in the response body exactly once, formatted as
-- `bk_pat_<prefix>.<secret>`. We store the SHA-256 of `<secret>` in `hash`
-- and the first 12 chars of `<secret>` in `token_prefix` so the bearer
-- middleware can do an O(1) lookup by prefix before the constant-time hash
-- compare.
--
-- workspace_id NULL = global / cross-workspace token (admin or AI-agent use
-- cases that need to enumerate workspaces). Per-workspace tokens carry the
-- workspace id so future rate-limiting + audit logs can scope by workspace
-- without re-deriving from the user.
--
-- Revocation = UPDATE setting revoked_at (soft delete). The bearer middleware
-- rejects rows with revoked_at IS NOT NULL or expires_at < now(). There is no
-- DELETE RLS policy on purpose — tokens must remain in the audit trail.
create extension if not exists pgcrypto;

create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text,
  token_prefix text not null,
  hash text not null,
  scopes text[] not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint access_tokens_scopes_nonempty check (array_length(scopes, 1) >= 1),
  constraint access_tokens_scopes_allowed check (
    scopes <@ array['atc:read', 'atc:write', 'run:execute', 'workspace:admin']::text[]
  )
);

create index access_tokens_token_prefix_idx on public.access_tokens (token_prefix);
create index access_tokens_user_active_idx on public.access_tokens (user_id, revoked_at);

alter table public.access_tokens enable row level security;

create policy access_tokens_select_own on public.access_tokens
  for select using (auth.uid() = user_id);

create policy access_tokens_insert_own on public.access_tokens
  for insert with check (auth.uid() = user_id);

create policy access_tokens_update_own on public.access_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Intentionally no DELETE policy. Revocation = UPDATE setting revoked_at.

comment on table public.access_tokens is
  'Personal access tokens (PATs). Issue via POST /api/v1/tokens, store SHA-256 of secret in hash, return raw bk_pat_<prefix>.<secret> exactly once.';
comment on column public.access_tokens.token_prefix is
  'First 12 chars of the raw secret (post-prefix), indexed for O(1) lookup before hash compare.';
comment on column public.access_tokens.scopes is
  'Allowed scopes: atc:read, atc:write, run:execute, workspace:admin.';
