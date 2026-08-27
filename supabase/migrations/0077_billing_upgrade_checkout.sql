-- Migration: 0077 — BK-230: Billing | Upgrade to a paid plan
-- Authored: 2026-08-27
--
-- Ratified by the 2026-08-17 PO/Dev Jira comment (Q1/Q2/T2) plus the AI Tech
-- Lead / AI Product Owner decision comment published alongside this Story's
-- implementation plan: Stripe Checkout (hosted redirect + webhook), the
-- existing Idempotency-Key contract (ADR-0002) extended with a one-open-
-- session-per-workspace guard for double-tab safety, and a Free-plan
-- project-limit gate built as part of this Story (BK-232 owns only the
-- warning UI, not the enforcement).
--
-- Four pieces, independent of each other:
--   1. billing_checkout_sessions — one row per Stripe Checkout Session
--      attempt; a partial unique index enforces at most one OPEN row per
--      workspace (the double-tab/double-charge guard).
--   2. stripe_webhook_events — Stripe event-id dedupe table (the webhook's
--      own idempotency floor, independent of the app-level guard above).
--   3. bunkai_enforce_project_limit() trigger on public.projects — mirrors
--      lib/billing/plan-tiers.ts's projectLimit per plan as SQL literals
--      (0065_atc_tags_cap_guard.sql's inline-literal convention: TS owns the
--      number, SQL mirrors it with a pointer comment). This is the ONLY
--      enforcement point today — POST /api/v1/workspaces/{id}/projects does
--      a plain RLS-gated table insert with no RPC layer to backstop
--      otherwise.
--   4. bunkai_apply_billing_checkout_webhook_event RPC — SECURITY DEFINER
--      because the webhook request carries no Supabase session (auth.uid()
--      is null), so it cannot ride RLS like every other write route in this
--      repo. Dedupes via stripe_webhook_events, then applies the plan change
--      or releases the one-open-session lock depending on event type.

-- =============================================================================
-- 1. billing_checkout_sessions
-- =============================================================================

create table if not exists public.billing_checkout_sessions (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id          uuid not null references auth.users(id) on delete restrict,
  target_plan                 text not null check (target_plan in ('cloud')),
  seat_quantity                int not null check (seat_quantity > 0),
  stripe_checkout_session_id  text not null unique,
  status                      text not null default 'open'
                                check (status in ('open','completed','expired','canceled')),
  idempotency_key             text not null,
  expires_at                  timestamptz not null,
  created_at                  timestamptz not null default now(),
  completed_at                timestamptz
);

-- The E1 guard (double tab, both confirmed): at most one OPEN checkout
-- session per workspace. A second concurrent attempt either reuses the
-- existing session (app-level read before insert) or loses the insert race
-- here (23505 -> mapped to 409 checkout_in_progress by the route) — never a
-- second Stripe session, never a double charge.
create unique index if not exists billing_checkout_sessions_one_open_per_workspace
  on public.billing_checkout_sessions (workspace_id)
  where status = 'open';

create index if not exists billing_checkout_sessions_workspace_id_idx
  on public.billing_checkout_sessions (workspace_id);

alter table public.billing_checkout_sessions enable row level security;

-- Owner-only, mirrors idempotency_keys' self-scoped RLS posture (0009) even
-- though the checkout/cancel routes use the caller's own RLS-scoped client
-- (never createAdminClient()) for these two operations — only the webhook
-- (no user session) needs service_role.
drop policy if exists billing_checkout_sessions_select_owner on public.billing_checkout_sessions;
create policy billing_checkout_sessions_select_owner
  on public.billing_checkout_sessions
  for select
  using ( public.bunkai_is_workspace_owner(workspace_id) );

drop policy if exists billing_checkout_sessions_insert_owner on public.billing_checkout_sessions;
create policy billing_checkout_sessions_insert_owner
  on public.billing_checkout_sessions
  for insert
  with check ( public.bunkai_is_workspace_owner(workspace_id) and created_by_user_id = auth.uid() );

-- Update is scoped to the cancel path only (status open -> canceled); the
-- route is the sole caller and already only ever writes that transition, so
-- the policy does not re-validate the target status value itself.
drop policy if exists billing_checkout_sessions_update_owner on public.billing_checkout_sessions;
create policy billing_checkout_sessions_update_owner
  on public.billing_checkout_sessions
  for update
  using ( public.bunkai_is_workspace_owner(workspace_id) )
  with check ( public.bunkai_is_workspace_owner(workspace_id) );

-- =============================================================================
-- 2. stripe_webhook_events
-- =============================================================================

create table if not exists public.stripe_webhook_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

-- service_role-only (mirrors magic_link_tokens' posture, 0009): RLS enabled,
-- no policies. The webhook route always runs through createAdminClient(),
-- which bypasses RLS entirely; no authenticated caller has any business
-- reading or writing raw Stripe event ids.
alter table public.stripe_webhook_events enable row level security;

-- =============================================================================
-- 3. Project-limit enforcement (Q2 — build it as part of BK-230)
-- =============================================================================

-- Literals mirror lib/billing/plan-tiers.ts's PLAN_TIERS[*].projectLimit
-- (community 3, cloud 50, enterprise unlimited/null) — same TS-owns-the-
-- number / SQL-mirrors-the-literal convention as 0065_atc_tags_cap_guard.sql.
-- If the ladder ever changes, update BOTH files; this migration is not
-- re-derived from the TS module at runtime (no shared-constant mechanism
-- across migrations, per that same file's own header note).
--
-- SECURITY INVOKER: no actor-spoof surface to close. The caller reaching
-- this trigger has already passed the projects table's own RLS INSERT
-- policy (workspace member, role >= member), which already grants them
-- SELECT on their own workspace row and their own workspace's projects —
-- this trigger reads nothing the caller could not already read directly.
create or replace function public.bunkai_enforce_project_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  select w.plan into v_plan
  from public.workspaces w
  where w.id = new.workspace_id;

  v_limit := case v_plan
    when 'community' then 3
    when 'cloud' then 50
    else null -- enterprise (or an unrecognized plan): unlimited, fail open
  end;

  if v_limit is not null then
    select count(*) into v_count
    from public.projects p
    where p.workspace_id = new.workspace_id;

    if v_count >= v_limit then
      raise exception 'project_limit_reached' using errcode = '45700';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bunkai_enforce_project_limit_trigger on public.projects;
create trigger bunkai_enforce_project_limit_trigger
  before insert on public.projects
  for each row
  execute function public.bunkai_enforce_project_limit();

-- =============================================================================
-- 4. bunkai_apply_billing_checkout_webhook_event — webhook-only RPC
-- =============================================================================

-- SECURITY DEFINER: the webhook request carries no Supabase session
-- (auth.uid() is null — Stripe calls this endpoint, not a signed-in user),
-- so RLS cannot gate this the way every user-facing write route in this
-- repo is gated. Authorization here is instead "the caller already verified
-- the Stripe webhook signature before invoking this RPC" — enforced by the
-- route (app/api/v1/billing/webhook/route.ts), not by this function itself.
-- Called exclusively via createAdminClient() from that route.
--
-- Idempotent by construction: the stripe_webhook_events insert is the first
-- statement and the ONLY thing checked before returning 'duplicate' — Stripe
-- retries a webhook delivery until it gets a 2xx, so this must be safe to
-- call twice (or a hundred times) for the same event id.
create or replace function public.bunkai_apply_billing_checkout_webhook_event(
  p_stripe_event_id           text,
  p_stripe_event_type         text,
  p_stripe_checkout_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted            int;
  v_session_row_id       uuid;
  v_workspace_id         uuid;
  v_target_plan          text;
  v_seat_quantity        int;
  v_status               text;
begin
  -- Dedupe floor: Stripe redelivers until it sees 2xx, so the SAME event may
  -- arrive more than once. ON CONFLICT DO NOTHING + checking the affected
  -- row count is the whole guard — no second statement runs on a replay.
  insert into public.stripe_webhook_events (id, type)
  values (p_stripe_event_id, p_stripe_event_type)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select id, workspace_id, target_plan, seat_quantity, status
    into v_session_row_id, v_workspace_id, v_target_plan, v_seat_quantity, v_status
    from public.billing_checkout_sessions
    where stripe_checkout_session_id = p_stripe_checkout_session_id
    for update;

  if v_session_row_id is null then
    -- No matching row (e.g. a session created outside this app, or a stale
    -- test event). Nothing to apply; still a valid 200 to Stripe — retrying
    -- will not manufacture a row that does not exist.
    return jsonb_build_object('status', 'unknown_session');
  end if;

  if p_stripe_event_type = 'checkout.session.completed' then
    if v_status = 'completed' then
      return jsonb_build_object('status', 'already_completed');
    end if;

    update public.workspaces
      set plan = v_target_plan
      where id = v_workspace_id;

    update public.billing_checkout_sessions
      set status = 'completed', completed_at = now()
      where id = v_session_row_id;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, null, 'workspace', v_workspace_id, 'workspace.plan_upgraded',
      jsonb_build_object('plan', v_target_plan, 'seat_quantity', v_seat_quantity, 'stripe_checkout_session_id', p_stripe_checkout_session_id)
    );

    return jsonb_build_object('status', 'applied', 'workspace_id', v_workspace_id, 'plan', v_target_plan);
  end if;

  if p_stripe_event_type = 'checkout.session.expired' then
    if v_status = 'open' then
      update public.billing_checkout_sessions
        set status = 'expired'
        where id = v_session_row_id;
    end if;
    return jsonb_build_object('status', 'expired');
  end if;

  return jsonb_build_object('status', 'ignored');
end;
$$;

revoke execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text) to service_role;

comment on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text) is
  'BK-230 — webhook-only: applies a Stripe checkout.session.completed (plan upgrade) or checkout.session.expired (release the one-open-session lock) event. Idempotent per Stripe event id via stripe_webhook_events. SECURITY DEFINER because the webhook carries no Supabase session; the route verifies the Stripe signature before ever calling this, and only service_role may execute it.';
