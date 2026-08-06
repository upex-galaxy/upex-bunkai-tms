-- Migration: 0062 — BK-213: Notification preferences (CRUD table + RLS)
-- (see implementation-plan.md,
-- .context/PBI/epics/EPIC-BK-208-notifications-center/stories/
-- STORY-BK-213-notifications-configure-notification-preferences-p/)
--
-- Personal, GLOBAL (cross-workspace) preferences: 2 editable event types
-- (`run_lifecycle`, `bug_lifecycle`) x 2 channels (`in_app`, `email`), plus a
-- structurally-locked `mentions` event type (business-rules.md: "declared
-- from day one but locked until the Team Chat epic ships"). QA Refinement
-- Decision 1 (comments.md, 2026-07-18): the grid stays GLOBAL, not
-- per-workspace, despite BK-209's inbox being per-workspace.
--
-- No row is ever seeded at signup: an absent (user_id, event_type, channel)
-- row is a valid, meaningful state ("never touched, still on default") — the
-- read path (app layer) supplies `enabled: true` for the two editable event
-- types when no row exists, per scope.md's stated defaults. This avoids a
-- new signup trigger for a purely additive, opt-out preference.
--
-- Authorization model (ADR-0012 / rpc-authorization.md six-question
-- checklist): this migration adds ZERO Postgres functions — no RPC, no
-- SECURITY DEFINER, nothing the checklist's actor-bind requirement applies
-- to. Every read/write is a plain RLS-scoped PostgREST call through the
-- caller's own session, mirroring `notifications`' mark-read pattern
-- (0053_notifications.sql: "plain RLS-scoped PostgREST update... no RPC").
-- `user_id` is never accepted as a client parameter anywhere in the API
-- layer — it is always `principal.userId` / `auth.uid()` — so there is no
-- caller-supplied identity parameter to bind in the first place (ADR-0012
-- questions 1-3 are vacuous by construction); question 4 (result scoping) is
-- satisfied structurally by `user_id = auth.uid()` on every policy below.
--
-- Defense in depth for the `mentions` lock: business-rules.md states this
-- row is immutable until Team Chat ships. Rather than trust only the UI
-- (disabled control) and the API (Zod enum excludes `mentions`), the
-- INSERT/UPDATE policies themselves reject `event_type = 'mentions'` — the
-- table is structurally guaranteed to never contain one. The GET response
-- synthesizes the two locked mention cells in application code instead.

-- ============================================================================
-- 1. notification_preferences
-- ============================================================================

create table if not exists public.notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null check (event_type in ('run_lifecycle', 'bug_lifecycle', 'mentions')),
  channel     text not null check (channel in ('in_app', 'email')),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (user_id, event_type, channel)
);

-- Sole access path: "give me this user's rows" — no other query shape exists
-- (there is no workspace/admin listing of another user's preferences,
-- business-rules.md: "no role can edit another user's preferences").
create index if not exists notification_preferences_user_id_idx
  on public.notification_preferences (user_id);

-- Reuse the existing shared trigger function (0004_atcs.sql) rather than
-- inventing a new one — this story adds no new Postgres functions.
drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row
  execute function public.bunkai_set_updated_at();

alter table public.notification_preferences enable row level security;

-- SELECT: a user reads only their own rows. No membership/workspace concept
-- applies — these preferences are explicitly global (QA Refinement Decision 1).
drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences
  for select
  using (user_id = auth.uid());

-- INSERT/UPDATE: a user may only write their OWN row, and never for the
-- locked `mentions` event type (DB-level defense in depth — see header).
-- No DELETE policy: no client use case removes a preference row; "reset to
-- default" is just an upsert back to `enabled = true`.
drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences
  for insert
  with check (user_id = auth.uid() and event_type <> 'mentions');

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences
  for update
  using (user_id = auth.uid() and event_type <> 'mentions')
  with check (user_id = auth.uid() and event_type <> 'mentions');
