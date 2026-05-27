-- Migration: 0009 — cross-cutting Wave-0 tables
-- Authored: 2026-05-27
--
-- Materialises the four cross-cutting tables that master-implementation-plan
-- §Wave-0 requires up-front so per-endpoint integration is bolt-in, not
-- retrofit. Plus `magic_link_tokens` for BK-2 replay-guard auditing.
--
-- Tables:
--   * idempotency_keys     — POST replay protection (BK-037), 24h TTL.
--   * activity_log         — audit-light (BK-038).
--   * feature_flags        — Phase-2 gradual rollout gating.
--   * user_view_state      — Wave-6 view persistence (BK-032).
--   * magic_link_tokens    — BK-2 replay-guard audit trail.
--
-- RLS strategy:
--   * idempotency_keys: per-user read (the inserter), service_role bypass for
--     middleware writes. No cross-user visibility.
--   * activity_log: workspace members read; writes via service_role only.
--   * feature_flags: global-scope rows readable by any authenticated user;
--     workspace-scope rows readable by workspace members. Writes service_role.
--   * user_view_state: owner-only. Standard `auth.uid() = user_id` pattern.
--   * magic_link_tokens: service_role only (auth flow runs server-side).

-- =============================================================================
-- 1. idempotency_keys
-- =============================================================================

create table if not exists public.idempotency_keys (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid null references public.workspaces(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  endpoint            text not null,
  key                 text not null,
  request_hash        text not null,
  status              text not null default 'pending'
                        check (status in ('pending','succeeded','failed')),
  response_snapshot   jsonb null,
  response_status     smallint null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '24 hours'),
  unique (user_id, endpoint, key)
);

create index if not exists idempotency_keys_expires_at_idx
  on public.idempotency_keys (expires_at);

create index if not exists idempotency_keys_workspace_id_idx
  on public.idempotency_keys (workspace_id);

alter table public.idempotency_keys enable row level security;

-- Owner-only read so a token holder can observe their own retry outcomes.
drop policy if exists idempotency_keys_select_owner on public.idempotency_keys;
create policy idempotency_keys_select_owner
  on public.idempotency_keys
  for select
  using ( user_id = auth.uid() );

-- Inserts and updates flow through the API handler running with the user's
-- session, so we accept self-insert with check on user_id. Service_role
-- bypasses RLS entirely (used by the idempotency middleware).
drop policy if exists idempotency_keys_insert_self on public.idempotency_keys;
create policy idempotency_keys_insert_self
  on public.idempotency_keys
  for insert
  with check ( user_id = auth.uid() );

drop policy if exists idempotency_keys_update_self on public.idempotency_keys;
create policy idempotency_keys_update_self
  on public.idempotency_keys
  for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- =============================================================================
-- 2. activity_log
-- =============================================================================

create table if not exists public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid null references public.workspaces(id) on delete cascade,
  actor_user_id   uuid null references auth.users(id) on delete set null,
  entity_type     text not null,
  entity_id       uuid null,
  action          text not null,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists activity_log_workspace_id_created_at_idx
  on public.activity_log (workspace_id, created_at desc);

create index if not exists activity_log_entity_idx
  on public.activity_log (entity_type, entity_id);

alter table public.activity_log enable row level security;

-- Members of the workspace may read the workspace's audit trail. Global rows
-- (workspace_id is null) are admin/operational and hidden from regular users.
drop policy if exists activity_log_select_workspace_member on public.activity_log;
create policy activity_log_select_workspace_member
  on public.activity_log
  for select
  using (
    workspace_id is not null
    and public.bunkai_is_workspace_member(workspace_id)
  );

-- No insert/update/delete policies for clients — writes happen via service_role
-- from the logging middleware. Anything else trips RLS denial.

-- =============================================================================
-- 3. feature_flags
-- =============================================================================

create table if not exists public.feature_flags (
  id              uuid primary key default gen_random_uuid(),
  key             text not null,
  scope           text not null default 'global'
                    check (scope in ('global','workspace')),
  workspace_id    uuid null references public.workspaces(id) on delete cascade,
  enabled         boolean not null default false,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Global flags: workspace_id is null. Workspace flags: workspace_id is set.
  -- A given key may exist once at global scope AND once per workspace at
  -- workspace scope (workspace overrides global at app layer).
  unique (key, scope, workspace_id),
  check (
    (scope = 'global' and workspace_id is null)
    or (scope = 'workspace' and workspace_id is not null)
  )
);

create index if not exists feature_flags_key_idx
  on public.feature_flags (key);

alter table public.feature_flags enable row level security;

-- Any authenticated user may read global flags (they describe app behaviour).
drop policy if exists feature_flags_select_global on public.feature_flags;
create policy feature_flags_select_global
  on public.feature_flags
  for select
  using ( scope = 'global' );

-- Workspace flags are visible only to members of that workspace.
drop policy if exists feature_flags_select_workspace_member on public.feature_flags;
create policy feature_flags_select_workspace_member
  on public.feature_flags
  for select
  using (
    scope = 'workspace'
    and workspace_id is not null
    and public.bunkai_is_workspace_member(workspace_id)
  );

-- No client write policies — flags are operated via Supabase Studio /
-- service_role migrations / admin tooling in MVP.

-- =============================================================================
-- 4. user_view_state
-- =============================================================================

create table if not exists public.user_view_state (
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  view_kind   text not null,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, project_id, view_kind)
);

alter table public.user_view_state enable row level security;

-- Only the owner may read/write their own view state. Project visibility is
-- still constrained by the project's RLS policy when the row is joined.
drop policy if exists user_view_state_select_self on public.user_view_state;
create policy user_view_state_select_self
  on public.user_view_state
  for select
  using ( user_id = auth.uid() );

drop policy if exists user_view_state_insert_self on public.user_view_state;
create policy user_view_state_insert_self
  on public.user_view_state
  for insert
  with check ( user_id = auth.uid() );

drop policy if exists user_view_state_update_self on public.user_view_state;
create policy user_view_state_update_self
  on public.user_view_state
  for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

drop policy if exists user_view_state_delete_self on public.user_view_state;
create policy user_view_state_delete_self
  on public.user_view_state
  for delete
  using ( user_id = auth.uid() );

-- =============================================================================
-- 5. magic_link_tokens
-- =============================================================================
-- Bunkai-specific audit trail of magic-link issuances. Supabase Auth manages
-- the actual OTP; this table lets us detect replays and rate-limit per-email
-- abuse without inspecting the auth schema.

create table if not exists public.magic_link_tokens (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  token_hash      text not null,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '1 hour'),
  consumed_at     timestamptz null,
  ip_hash         text null,
  user_agent      text null,
  unique (token_hash)
);

create index if not exists magic_link_tokens_email_issued_at_idx
  on public.magic_link_tokens (email, issued_at desc);

create index if not exists magic_link_tokens_expires_at_idx
  on public.magic_link_tokens (expires_at);

alter table public.magic_link_tokens enable row level security;

-- No client policies. The auth route handler runs with service_role to
-- record issuance and consumption.
