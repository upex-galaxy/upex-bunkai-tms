-- Migration: 0077 — BK-230: Billing | Upgrade to a paid plan
-- Authored: 2026-08-27. Revised 2026-08-27 per Conductor review (PR #208):
-- items 1-4 below are the schema-facing fixes for that review's BLOCKER +
-- MAJOR findings 1-4. The file is written idempotent (create or replace /
-- add column if not exists / drop policy if exists) so it is safe to
-- re-apply from a clean database, not just as a live-DB patch.
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
--      workspace (the double-tab/double-charge guard). The row is now
--      inserted BEFORE the Stripe API call (review item 2) — its own `id`
--      is passed to Stripe as `client_reference_id`, so the row can always
--      be found again even if the app crashes between creating the Stripe
--      session and recording its id back onto this row. Also now carries
--      `stripe_customer_id` / `stripe_subscription_id` (review item 4) —
--      the only moment those identifiers are available for free.
--   2. stripe_webhook_events — Stripe event-id dedupe table. The RPC only
--      writes to it AFTER confirming a matching row exists (review item 2)
--      — an `unknown_session` outcome is never recorded as "seen", so a
--      legitimate Stripe redelivery (forced by the route's 5xx on that
--      outcome) gets a real second attempt instead of a rubber-stamped
--      `duplicate`.
--   3. bunkai_enforce_project_limit() trigger on public.projects — mirrors
--      lib/billing/plan-tiers.ts's projectLimit per plan as SQL literals
--      (0065_atc_tags_cap_guard.sql's inline-literal convention: TS owns the
--      number, SQL mirrors it with a pointer comment). This is the ONLY
--      enforcement point today — POST /api/v1/workspaces/{id}/projects does
--      a plain RLS-gated table insert with no RPC layer to backstop
--      otherwise. An unrecognized `plan` value now RAISES rather than
--      failing open to "unlimited" (review "worth doing" item).
--   4. bunkai_apply_billing_checkout_webhook_event RPC — SECURITY DEFINER
--      because the webhook request carries no Supabase session (auth.uid()
--      is null), so it cannot ride RLS like every other write route in this
--      repo. Looks the row up by `client_reference_id` FIRST (falling back
--      to `stripe_checkout_session_id`), only flips the plan when Stripe's
--      own `payment_status` is `'paid'` (review item 1 — the BLOCKER: a
--      delayed-notification payment method fires `checkout.session.completed`
--      immediately with `payment_status: 'unpaid'`, and this RPC used to
--      upgrade on that alone), and separately handles
--      `checkout.session.async_payment_succeeded` /
--      `checkout.session.async_payment_failed` for the methods where the
--      real outcome arrives on a later event.

-- =============================================================================
-- 1. billing_checkout_sessions
-- =============================================================================

create table if not exists public.billing_checkout_sessions (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id          uuid not null references auth.users(id) on delete restrict,
  target_plan                 text not null check (target_plan in ('cloud')),
  seat_quantity                int not null check (seat_quantity > 0),
  -- Nullable: the row is inserted BEFORE the Stripe API call now (this row's
  -- own `id` is what correlates it to Stripe, via client_reference_id — see
  -- the RPC below), so the Stripe session id is not yet known at insert time
  -- and is backfilled once Stripe returns it. `unique` already allows
  -- multiple NULLs in Postgres, so no partial-index rewrite is needed.
  stripe_checkout_session_id  text unique,
  stripe_customer_id          text,
  stripe_subscription_id      text,
  status                      text not null default 'open'
                                check (status in ('open','completed','expired','canceled')),
  idempotency_key             text not null,
  expires_at                  timestamptz not null,
  created_at                  timestamptz not null default now(),
  completed_at                timestamptz
);

-- Additive backfill for a database where this table already exists from the
-- pre-review version of this migration (it was applied once already before
-- this revision landed).
alter table public.billing_checkout_sessions alter column stripe_checkout_session_id drop not null;
alter table public.billing_checkout_sessions add column if not exists stripe_customer_id text;
alter table public.billing_checkout_sessions add column if not exists stripe_subscription_id text;

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

-- Owner-only read, kept for the same reason idempotency_keys (0009) keeps a
-- self-scoped SELECT policy even though every write below goes through
-- service_role: harmless, and lets an owner's own session observe their
-- attempt's status directly if a future surface ever needs to.
drop policy if exists billing_checkout_sessions_select_owner on public.billing_checkout_sessions;
create policy billing_checkout_sessions_select_owner
  on public.billing_checkout_sessions
  for select
  using ( public.bunkai_is_workspace_owner(workspace_id) );

-- Review item 3 (MAJOR): the previous version of this migration shipped
-- owner-scoped INSERT and UPDATE policies wide enough that PostgREST let the
-- workspace owner write this table DIRECTLY — including PATCHing their own
-- row's `status` from `open` back to `canceled` to release the one-open-
-- session lock and start a SECOND, independently payable Stripe Checkout
-- Session (the exact double-charge shape the partial unique index exists to
-- prevent). No authorization-boundary check was the bug — bunkai_is_
-- workspace_owner is a true statement about the CALLER, not a constraint on
-- WHICH rows or WHICH transitions may be written.
--
-- Fix: nothing outside `createAdminClient()` may write this table at all.
-- Both server routes (checkout create, checkout cancel) already perform
-- their authorization checks (workspace:admin capability +
-- assertWorkspaceContext + bunkai_is_workspace_owner) in TypeScript BEFORE
-- ever touching this table, so routing the writes through the admin client
-- does not weaken authorization — it removes a redundant, wider-than-
-- intended PostgREST-direct write path that bypassed the app layer's own
-- business-rule checks (valid status transitions, one-open-session
-- invariant checked before insert) entirely.
drop policy if exists billing_checkout_sessions_insert_owner on public.billing_checkout_sessions;
drop policy if exists billing_checkout_sessions_update_owner on public.billing_checkout_sessions;

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
--
-- An unrecognized `plan` value now RAISES (review "worth doing" item) rather
-- than falling through to `else null` (= unlimited). `workspaces.plan` is
-- CHECK-constrained to exactly community/cloud/enterprise (0001), so this
-- branch is unreachable today — but a billing cap whose failure mode on a
-- bad read is "no limit" points the wrong direction, and raising costs
-- nothing since the branch cannot fire against the live constraint.
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
    when 'enterprise' then null -- unlimited
    else -1 -- unrecognized plan: treat as the most restrictive tier (raises below)
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

-- Signature widened (review items 1 + 4): the route now passes Stripe's own
-- `client_reference_id`, `payment_status`, `customer`, and `subscription`
-- fields straight through from the verified event payload.
--
-- SECURITY DEFINER: the webhook request carries no Supabase session
-- (auth.uid() is null — Stripe calls this endpoint, not a signed-in user),
-- so RLS cannot gate this the way every user-facing write route in this
-- repo is gated. Authorization here is instead "the caller already verified
-- the Stripe webhook signature before invoking this RPC" — enforced by the
-- route (app/api/v1/billing/webhook/route.ts), not by this function itself.
-- Called exclusively via createAdminClient() from that route.
--
-- Idempotent by construction, but the dedupe write moved (review item 2):
-- the row lookup happens FIRST, and `stripe_webhook_events` is only written
-- once a matching row is confirmed — `unknown_session` is never recorded as
-- "seen". The route maps `unknown_session` to a 5xx (not 200), so Stripe
-- redelivers the SAME event id, and that redelivery gets a REAL second
-- lookup instead of a rubber-stamped `duplicate` (the previous version's
-- bug: the dedupe insert ran before the row lookup, so a webhook arriving
-- before this app's own row-insert had committed — however narrow that
-- window — would permanently swallow every future redelivery of that event
-- id, `unknown_session` forever, leaving a real paying customer stuck on
-- Community with no retry able to fix it).
create or replace function public.bunkai_apply_billing_checkout_webhook_event(
  p_stripe_event_id            text,
  p_stripe_event_type          text,
  p_stripe_checkout_session_id text,
  p_client_reference_id        text,
  p_payment_status             text,
  p_stripe_customer_id         text,
  p_stripe_subscription_id     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted       int;
  v_session_row_id uuid;
  v_workspace_id   uuid;
  v_target_plan    text;
  v_seat_quantity  int;
  v_status         text;
  v_ref_uuid       uuid;
begin
  -- client_reference_id is OUR OWN row id, round-tripped through Stripe — the
  -- primary correlation key, reliable even if the post-create UPDATE that
  -- backfills stripe_checkout_session_id onto this row never ran. Fall back
  -- to stripe_checkout_session_id for a session created before this column
  -- existed, or if client_reference_id is somehow absent.
  begin
    v_ref_uuid := nullif(p_client_reference_id, '')::uuid;
  exception when invalid_text_representation then
    v_ref_uuid := null;
  end;

  select id, workspace_id, target_plan, seat_quantity, status
    into v_session_row_id, v_workspace_id, v_target_plan, v_seat_quantity, v_status
    from public.billing_checkout_sessions
    where (v_ref_uuid is not null and id = v_ref_uuid)
       or stripe_checkout_session_id = p_stripe_checkout_session_id
    for update;

  if v_session_row_id is null then
    -- No matching row. Do NOT record this event id as seen — the route
    -- answers a 5xx for this outcome so Stripe redelivers, and a real
    -- retry needs to land here again, not be swallowed as a duplicate.
    return jsonb_build_object('status', 'unknown_session');
  end if;

  if v_status in ('completed', 'expired', 'canceled') then
    -- Row already reached a terminal state — safe, idempotent no-op. Still
    -- fine to record the dedupe entry below (a redelivery of the SAME event
    -- id against an already-terminal row has nothing further to do).
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- Dedupe floor, now AFTER confirming there is something real to act on.
  insert into public.stripe_webhook_events (id, type)
  values (p_stripe_event_id, p_stripe_event_type)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'duplicate');
  end if;

  -- Backfill the Stripe-side identifiers now that we have them — the only
  -- moment they are available (review item 4). coalesce so a later event
  -- for the same row never blanks a value an earlier one already set.
  update public.billing_checkout_sessions
    set stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_stripe_checkout_session_id),
        stripe_customer_id         = coalesce(p_stripe_customer_id, stripe_customer_id),
        stripe_subscription_id     = coalesce(p_stripe_subscription_id, stripe_subscription_id)
    where id = v_session_row_id;

  if p_stripe_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    -- Review item 1 — the BLOCKER. A delayed-notification payment method
    -- (SEPA, Bacs, ACH, Boleto, Konbini, ...) fires `checkout.session.
    -- completed` immediately with `payment_status: 'unpaid'`; the real
    -- outcome arrives later as `checkout.session.async_payment_succeeded`
    -- (payment_status becomes 'paid') or `.async_payment_failed`. The plan
    -- change applies ONLY when Stripe itself reports `paid` — never on
    -- `completed` alone.
    if p_payment_status is distinct from 'paid' then
      return jsonb_build_object('status', 'awaiting_payment');
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

  if p_stripe_event_type = 'checkout.session.async_payment_failed' then
    -- The delayed-notification payment ultimately failed. Release the
    -- one-open-session lock so the owner can start a fresh checkout; no
    -- plan change was ever applied for this row (payment_status never
    -- reached 'paid' above), so there is nothing to revert.
    update public.billing_checkout_sessions
      set status = 'expired'
      where id = v_session_row_id and status = 'open';
    return jsonb_build_object('status', 'payment_failed');
  end if;

  if p_stripe_event_type = 'checkout.session.expired' then
    update public.billing_checkout_sessions
      set status = 'expired'
      where id = v_session_row_id and status = 'open';
    return jsonb_build_object('status', 'expired');
  end if;

  return jsonb_build_object('status', 'ignored');
end;
$$;

revoke execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text, text, text, text, text) to service_role;

comment on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text, text, text, text, text) is
  'BK-230 — webhook-only: applies a Stripe checkout.session.completed/async_payment_succeeded (plan upgrade, ONLY when payment_status=paid), checkout.session.async_payment_failed, or checkout.session.expired event. Looks the row up by client_reference_id first, falling back to stripe_checkout_session_id. Idempotent per Stripe event id via stripe_webhook_events, recorded only once a matching row is found. SECURITY DEFINER because the webhook carries no Supabase session; the route verifies the Stripe signature before ever calling this, and only service_role may execute it.';

-- The pre-review signature is dropped explicitly — PostgREST/Postgres allow
-- function overloading by argument list, and leaving the old 3-arg version
-- around would let a stale caller silently invoke the unpatched (BLOCKER)
-- behavior instead of erroring.
drop function if exists public.bunkai_apply_billing_checkout_webhook_event(text, text, text);

-- =============================================================================
-- 5. purchased_seats — review item 5 (MAJOR: "purchased seats are write-only")
-- =============================================================================

-- The REAL seat ceiling for a Cloud workspace is what it purchased at
-- checkout, not the tier's flat `PLAN_TIERS.cloud.seatLimit` (25 — that stays
-- the plan's maximum PURCHASABLE quantity, never a specific workspace's
-- actual cap). `null` means "no purchase on record" (Community, Enterprise,
-- or a Cloud workspace predating this column) — lib/billing/plan-tiers.ts's
-- new `effectiveSeatLimit()` falls back to the tier constant in that case, so
-- nothing regresses to a blank/zero cap. Scope decision (published as an
-- attributed AI Product Owner comment on BK-230, with a filed follow-up
-- ticket): this migration fixes the DISPLAY half of the bug (the meter now
-- shows the true purchased amount) and populates the value at the one moment
-- it is free to capture (successful webhook completion, below). It does NOT
-- add a hard invite-time ENFORCEMENT gate — unlike the project-limit trigger
-- (which extended an existing direct-insert route), no seat-limit
-- enforcement mechanism exists anywhere in this codebase to extend; building
-- one from scratch (a workspace_members-insert trigger or an invite-accept
-- RPC gate) is sized as its own story, not a review fix-up.
alter table public.workspaces add column if not exists purchased_seats int null check (purchased_seats is null or purchased_seats > 0);

-- Populate purchased_seats on successful plan application — additive
-- replacement of the same statement in bunkai_apply_billing_checkout_webhook_
-- event above; re-declared here in full because a second `create or replace`
-- for the same function in one migration file is clearer than a partial diff
-- comment. This is the FINAL body (supersedes the one earlier in this file).
create or replace function public.bunkai_apply_billing_checkout_webhook_event(
  p_stripe_event_id            text,
  p_stripe_event_type          text,
  p_stripe_checkout_session_id text,
  p_client_reference_id        text,
  p_payment_status             text,
  p_stripe_customer_id         text,
  p_stripe_subscription_id     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted       int;
  v_session_row_id uuid;
  v_workspace_id   uuid;
  v_target_plan    text;
  v_seat_quantity  int;
  v_status         text;
  v_ref_uuid       uuid;
begin
  begin
    v_ref_uuid := nullif(p_client_reference_id, '')::uuid;
  exception when invalid_text_representation then
    v_ref_uuid := null;
  end;

  select id, workspace_id, target_plan, seat_quantity, status
    into v_session_row_id, v_workspace_id, v_target_plan, v_seat_quantity, v_status
    from public.billing_checkout_sessions
    where (v_ref_uuid is not null and id = v_ref_uuid)
       or stripe_checkout_session_id = p_stripe_checkout_session_id
    for update;

  if v_session_row_id is null then
    return jsonb_build_object('status', 'unknown_session');
  end if;

  if v_status = 'completed' then
    -- Row already fully applied — replaying the SAME event id (Stripe
    -- redelivers until it sees 2xx) is a safe, idempotent no-op.
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- Conductor re-review (PR #208) item 1 — NEW MAJOR introduced by this
  -- round's own item 2/3 fix: widening this short-circuit to ALSO cover
  -- 'expired'/'canceled' silently 200s a PAID completed event against a row
  -- this app marked expired/canceled LOCALLY (checkout.ts's
  -- reuseOpenCheckoutSession flips a stale open row to 'expired' WITHOUT
  -- consulting Stripe whenever it has no stripe_checkout_session_id yet —
  -- the backfill at checkout.ts:203-213 is deliberately non-fatal). A
  -- customer who already holds a live Stripe URL for that row can still pay
  -- it after the local flip; the webhook must still be able to apply that
  -- payment. Only short-circuit an expired/canceled row for event types
  -- that cannot themselves complete a purchase — a genuinely paid
  -- completed/async_payment_succeeded event falls through to the branch
  -- below regardless of how this row got marked expired/canceled.
  if v_status in ('expired', 'canceled')
     and p_stripe_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    return jsonb_build_object('status', 'already_processed');
  end if;

  insert into public.stripe_webhook_events (id, type)
  values (p_stripe_event_id, p_stripe_event_type)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'duplicate');
  end if;

  update public.billing_checkout_sessions
    set stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_stripe_checkout_session_id),
        stripe_customer_id         = coalesce(p_stripe_customer_id, stripe_customer_id),
        stripe_subscription_id     = coalesce(p_stripe_subscription_id, stripe_subscription_id)
    where id = v_session_row_id;

  if p_stripe_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    if p_payment_status is distinct from 'paid' then
      return jsonb_build_object('status', 'awaiting_payment');
    end if;

    update public.workspaces
      set plan = v_target_plan,
          purchased_seats = v_seat_quantity
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

  if p_stripe_event_type = 'checkout.session.async_payment_failed' then
    update public.billing_checkout_sessions
      set status = 'expired'
      where id = v_session_row_id and status = 'open';
    return jsonb_build_object('status', 'payment_failed');
  end if;

  if p_stripe_event_type = 'checkout.session.expired' then
    update public.billing_checkout_sessions
      set status = 'expired'
      where id = v_session_row_id and status = 'open';
    return jsonb_build_object('status', 'expired');
  end if;

  return jsonb_build_object('status', 'ignored');
end;
$$;

-- Additive extension of BK-229's overview RPC (0072): `purchased_seats` rides
-- alongside the existing fields so BillingOverviewView can compute the true
-- effective seat limit client-side via plan-tiers.ts's effectiveSeatLimit().
-- Body otherwise byte-identical to 0072's — same step-0 admin gate, same
-- SECURITY INVOKER posture, same non-disclosure contract (null for a
-- non-admin caller / unknown workspace / a workspace the caller cannot see).
create or replace function public.bunkai_workspace_billing_overview(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_plan text;
  v_purchased_seats int;
  v_active_seats int;
  v_project_count int;
  v_oldest_run_age_days int;
begin
  if not public.bunkai_is_workspace_admin(p_workspace_id) then
    return null;
  end if;

  select w.plan, w.purchased_seats into v_plan, v_purchased_seats
  from public.workspaces w
  where w.id = p_workspace_id;

  if v_plan is null then
    return null;
  end if;

  select count(*) into v_active_seats
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.status = 'active';

  select count(*) into v_project_count
  from public.projects p
  where p.workspace_id = p_workspace_id;

  select extract(day from now() - min(r.created_at))::int into v_oldest_run_age_days
  from public.runs r
  where r.workspace_id = p_workspace_id;

  return jsonb_build_object(
    'plan', v_plan,
    'purchased_seats', v_purchased_seats,
    'active_seats', v_active_seats,
    'project_count', v_project_count,
    'oldest_run_age_days', v_oldest_run_age_days
  );
end;
$$;

revoke execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text, text, text, text, text) to service_role;

revoke execute on function public.bunkai_workspace_billing_overview(uuid) from public, anon;
grant  execute on function public.bunkai_workspace_billing_overview(uuid) to authenticated, service_role;
