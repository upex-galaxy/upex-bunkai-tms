-- 0113_billing_details_invoices.sql — BK-231: Billing | Manage billing details and
-- download invoices
--
-- ADDITIVE AND IDEMPOTENT: three new tables, one pure function, two webhook-only
-- RPCs, and `create or replace` of three BK-230 / BK-229 objects whose bodies stay
-- logically identical (comments aside) except for the marked BK-231 lines. Nothing is dropped or renamed.
--
--   * workspace_billing_profiles  — the company name, billing email and address the
--                                   owner keeps up to date. Stripe holds the copy
--                                   that appears on invoices (the app pushes every
--                                   save to the Stripe Customer); this row is what
--                                   the Billing screen reads back.
--   * workspace_billing_state     — workspace -> Stripe customer / subscription
--                                   mapping, the payment-method SUMMARY (brand, last
--                                   four, expiry; never a card number), and the
--                                   failed-renewal state machine.
--   * workspace_grace_periods     — the 14-day grace window of an unpaid renewal.
--                                   Kept apart from the state table on purpose: any
--                                   active member may read it, because the project-
--                                   limit trigger below is SECURITY INVOKER and must
--                                   evaluate it for a plain member without a
--                                   privileged helper. It holds two timestamps.
--   * bunkai_effective_plan       — pure function: the plan whose limits apply right
--                                   now. A Cloud workspace whose grace window has
--                                   ended is evaluated as Community FROM THE EXACT
--                                   INSTANT (now >= ends_at), with no sweep job and no
--                                   clock dependency. `workspaces.plan` stays the
--                                   stored plan and nothing is deleted (ADR-0021).
--   * bunkai_apply_billing_invoice_event / bunkai_apply_billing_payment_method —
--                                   webhook-only, service_role only, no actor
--                                   parameter (the request carries no Supabase
--                                   session; the route verifies the Stripe signature
--                                   first). Idempotent per Stripe event id through
--                                   `stripe_webhook_events`, recorded only after the
--                                   customer lookup succeeded (0077's convention), with
--                                   a stale-event guard for out-of-order delivery.
--
-- Decisions followed (Jira BK-231, AI Product Owner comment 13337 and AI Tech Lead
-- comment 13338 posted at Stage 1; PO/Dev readiness decisions of 2026-11-01):
--   * Grace = 14 x 24 hours from the FIRST failed renewal, UTC. Only a renewal
--     invoice (billing_reason = subscription_cycle) opens it; Stripe's own automatic
--     retry failures never extend it. Paid limits hold strictly before ends_at.
--   * Recovery is recorded only from the provider's confirmation (invoice.paid).
--   * Stripe is the source of truth for invoices and PDFs; none is mirrored here.
--
-- Security posture:
--   * The three tables enable RLS. Reads: profile and state = workspace owner/admin
--     (bunkai_is_workspace_admin); grace window = any active member. There is NO
--     INSERT/UPDATE/DELETE policy and the write privileges are revoked from anon and
--     authenticated as well: every write goes through createAdminClient() after the
--     TypeScript owner check (BK-230 review item 3 removed the equivalent policies
--     from billing_checkout_sessions for the same reason).
--   * The two DEFINER RPCs take no caller identity at all (ADR-0012: remove the
--     parameter instead of guarding it); EXECUTE is revoked from public, anon and
--     authenticated, so a signed-in user cannot call them.
--   * bunkai_enforce_project_limit stays SECURITY INVOKER.

-- =============================================================================
-- 1. workspace_billing_profiles
-- =============================================================================

create table if not exists public.workspace_billing_profiles (
  workspace_id        uuid primary key references public.workspaces(id) on delete cascade,
  company_name        text not null check (char_length(company_name) between 1 and 120),
  billing_email       text not null check (
                        char_length(billing_email) <= 254
                        and billing_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                      ),
  address_line1       text not null check (char_length(address_line1) between 1 and 120),
  address_line2       text null check (address_line2 is null or char_length(address_line2) <= 120),
  city                text not null check (char_length(city) between 1 and 80),
  region              text null check (region is null or char_length(region) <= 80),
  postal_code         text not null check (char_length(postal_code) between 1 and 20),
  country             text not null check (country ~ '^[A-Z]{2}$'),
  updated_by_user_id  uuid null references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.workspace_billing_profiles enable row level security;

drop policy if exists workspace_billing_profiles_select_admin on public.workspace_billing_profiles;
create policy workspace_billing_profiles_select_admin
  on public.workspace_billing_profiles
  for select
  using ( public.bunkai_is_workspace_admin(workspace_id) );

revoke insert, update, delete on public.workspace_billing_profiles from anon, authenticated;

-- =============================================================================
-- 2. workspace_billing_state
-- =============================================================================

create table if not exists public.workspace_billing_state (
  workspace_id                 uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id           text not null unique,
  stripe_subscription_id       text null,
  -- Payment-method SUMMARY only. The full card number never reaches this app.
  payment_method_brand         text null,
  payment_method_last4         text null check (payment_method_last4 is null or payment_method_last4 ~ '^[0-9]{4}$'),
  payment_method_exp_month     int  null check (payment_method_exp_month is null or payment_method_exp_month between 1 and 12),
  payment_method_exp_year      int  null,
  -- When the owner last CONFIRMED a replacement method. Retry is enabled only
  -- when this is later than the start of the grace window.
  payment_method_updated_at    timestamptz null,
  payment_state                text not null default 'paid'
                                 check (payment_state in ('paid', 'payment_failed', 'retry_pending', 'recovered')),
  failed_invoice_id            text null,
  -- The newest invoice a paid event was seen for. A failure delivered AFTER its
  -- own invoice's paid event (out of order) must never open a grace window.
  last_paid_invoice_id         text null,
  last_payment_failed_at       timestamptz null,
  recovered_at                 timestamptz null,
  retry_attempts               int  not null default 0 check (retry_attempts >= 0),
  retry_started_at             timestamptz null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

alter table public.workspace_billing_state enable row level security;

drop policy if exists workspace_billing_state_select_admin on public.workspace_billing_state;
create policy workspace_billing_state_select_admin
  on public.workspace_billing_state
  for select
  using ( public.bunkai_is_workspace_admin(workspace_id) );

revoke insert, update, delete on public.workspace_billing_state from anon, authenticated;

-- =============================================================================
-- 3. workspace_grace_periods
-- =============================================================================

create table if not exists public.workspace_grace_periods (
  workspace_id  uuid primary key references public.workspaces(id) on delete cascade,
  started_at    timestamptz not null,
  ends_at       timestamptz not null,
  check (ends_at > started_at)
);

alter table public.workspace_grace_periods enable row level security;

drop policy if exists workspace_grace_periods_select_member on public.workspace_grace_periods;
create policy workspace_grace_periods_select_member
  on public.workspace_grace_periods
  for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

revoke insert, update, delete on public.workspace_grace_periods from anon, authenticated;

-- Existing paid workspaces: BK-230 recorded the Stripe customer / subscription on the
-- completed checkout row only. Seed the state table from the latest completed row of
-- each workspace so the Billing screen works for them without a re-purchase.
insert into public.workspace_billing_state (workspace_id, stripe_customer_id, stripe_subscription_id)
select distinct on (s.workspace_id) s.workspace_id, s.stripe_customer_id, s.stripe_subscription_id
from public.billing_checkout_sessions s
where s.status = 'completed'
  and s.stripe_customer_id is not null
order by s.workspace_id, s.completed_at desc nulls last
on conflict do nothing;

-- =============================================================================
-- 4. bunkai_effective_plan — pure
-- =============================================================================

-- Boundary (2026-11-01 ruling): the workspace remains paid BEFORE the grace end and
-- transitions to Community AT that exact instant, so the comparison is `>=`.
create or replace function public.bunkai_effective_plan(
  p_plan           text,
  p_grace_ends_at  timestamptz,
  p_now            timestamptz default now()
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_plan = 'cloud' and p_grace_ends_at is not null and p_now >= p_grace_ends_at then 'community'
    else p_plan
  end;
$$;

revoke execute on function public.bunkai_effective_plan(text, timestamptz, timestamptz) from public, anon;
grant  execute on function public.bunkai_effective_plan(text, timestamptz, timestamptz) to authenticated, service_role;

comment on function public.bunkai_effective_plan(text, timestamptz, timestamptz) is
  'BK-231 / ADR-0021 — pure: the plan whose limits apply at p_now. A cloud plan whose grace window ended (p_now >= p_grace_ends_at) is evaluated as community; every other input returns p_plan unchanged. workspaces.plan is never rewritten by the grace expiry.';

-- =============================================================================
-- 5. bunkai_apply_billing_invoice_event — webhook-only
-- =============================================================================

create or replace function public.bunkai_apply_billing_invoice_event(
  p_stripe_event_id    text,
  p_event_type         text,
  p_event_created      timestamptz,
  p_stripe_customer_id text,
  p_stripe_invoice_id  text,
  p_billing_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted  int;
  v_state     public.workspace_billing_state%rowtype;
  v_ends_at   timestamptz;
begin
  select * into v_state
    from public.workspace_billing_state
    where stripe_customer_id = p_stripe_customer_id
    for update;

  if not found then
    -- Not recorded as seen: the route answers 5xx for a short window so Stripe
    -- redelivers once the checkout row has committed (0077's unknown_session rule).
    return jsonb_build_object('status', 'unknown_customer');
  end if;

  insert into public.stripe_webhook_events (id, type)
  values (p_stripe_event_id, p_event_type)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'duplicate');
  end if;

  if p_event_type = 'invoice.payment_failed' then
    -- Only a renewal (or the invoice already tracked as failed) is a failed renewal.
    if p_billing_reason is distinct from 'subscription_cycle'
       and v_state.failed_invoice_id is distinct from p_stripe_invoice_id then
      return jsonb_build_object('status', 'ignored');
    end if;

    -- Out-of-order guards: a failure for an invoice whose paid event was already
    -- seen, or created at or before a recovery already recorded, is a late
    -- delivery of history, not a new failure.
    if v_state.last_paid_invoice_id is not distinct from p_stripe_invoice_id then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_state.recovered_at is not null and p_event_created <= v_state.recovered_at then
      return jsonb_build_object('status', 'stale');
    end if;

    if v_state.payment_state in ('payment_failed', 'retry_pending') then
      -- A later failure (Stripe's automatic retries, or a failed manual retry) never
      -- extends the window: the FIRST failure governs the grace end.
      update public.workspace_billing_state
        set payment_state = 'payment_failed',
            last_payment_failed_at = greatest(coalesce(last_payment_failed_at, p_event_created), p_event_created),
            retry_started_at = null,
            updated_at = now()
        where workspace_id = v_state.workspace_id;
      return jsonb_build_object('status', 'grace_continued', 'workspace_id', v_state.workspace_id);
    end if;

    v_ends_at := p_event_created + interval '14 days';

    update public.workspace_billing_state
      set payment_state = 'payment_failed',
          failed_invoice_id = p_stripe_invoice_id,
          last_payment_failed_at = p_event_created,
          retry_attempts = 0,
          retry_started_at = null,
          updated_at = now()
      where workspace_id = v_state.workspace_id;

    insert into public.workspace_grace_periods (workspace_id, started_at, ends_at)
    values (v_state.workspace_id, p_event_created, v_ends_at)
    on conflict (workspace_id) do update
      set started_at = excluded.started_at,
          ends_at = excluded.ends_at;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_state.workspace_id, null, 'workspace', v_state.workspace_id, 'workspace.payment_failed',
      jsonb_build_object('grace_ends_at', v_ends_at)
    );

    return jsonb_build_object('status', 'grace_started', 'workspace_id', v_state.workspace_id, 'grace_ends_at', v_ends_at);
  end if;

  if p_event_type = 'invoice.paid' then
    -- Remember the paid invoice whatever happens next (see the stale guard above).
    update public.workspace_billing_state
      set last_paid_invoice_id = p_stripe_invoice_id, updated_at = now()
      where workspace_id = v_state.workspace_id;

    -- Recovery is confirmed only by the provider's own paid event for the invoice
    -- that put the workspace in grace.
    if v_state.payment_state in ('payment_failed', 'retry_pending')
       and v_state.failed_invoice_id = p_stripe_invoice_id then
      update public.workspace_billing_state
        set payment_state = 'recovered',
            recovered_at = greatest(coalesce(recovered_at, p_event_created), p_event_created),
            failed_invoice_id = null,
            retry_started_at = null,
            updated_at = now()
        where workspace_id = v_state.workspace_id;

      delete from public.workspace_grace_periods where workspace_id = v_state.workspace_id;

      -- activity_log is readable by every member: no invoice or card detail here.
      insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
      values (v_state.workspace_id, null, 'workspace', v_state.workspace_id, 'workspace.payment_recovered', '{}'::jsonb);

      return jsonb_build_object('status', 'recovered', 'workspace_id', v_state.workspace_id);
    end if;
    return jsonb_build_object('status', 'ignored');
  end if;

  return jsonb_build_object('status', 'ignored');
end;
$$;

revoke execute on function public.bunkai_apply_billing_invoice_event(text, text, timestamptz, text, text, text) from public, anon, authenticated;
grant  execute on function public.bunkai_apply_billing_invoice_event(text, text, timestamptz, text, text, text) to service_role;

comment on function public.bunkai_apply_billing_invoice_event(text, text, timestamptz, text, text, text) is
  'BK-231 — webhook-only: applies a Stripe invoice.payment_failed (renewal invoices open or continue the 14-day grace window; the first failure governs the end) or invoice.paid (recovery, only for the invoice that caused the grace). Idempotent per Stripe event id via stripe_webhook_events, recorded only once the customer is known; stale deliveries after a recovery are ignored. SECURITY DEFINER because the webhook carries no Supabase session; no caller identity parameter; only service_role may execute it.';

-- =============================================================================
-- 6. bunkai_apply_billing_payment_method — webhook-only
-- =============================================================================

-- p_replaced = true when the owner just confirmed a NEW method through the hosted
-- setup flow (stamps payment_method_updated_at, which unlocks the retry);
-- p_replaced = false is the summary refresh that fills brand / last four for a
-- subscription created before this column existed. A null event id skips the
-- dedupe (the refresh has no Stripe event behind it).
create or replace function public.bunkai_apply_billing_payment_method(
  p_stripe_event_id    text,
  p_event_type         text,
  p_event_created      timestamptz,
  p_stripe_customer_id text,
  p_brand              text,
  p_last4              text,
  p_exp_month          int,
  p_exp_year           int,
  p_replaced           boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted  int;
  v_state     public.workspace_billing_state%rowtype;
begin
  select * into v_state
    from public.workspace_billing_state
    where stripe_customer_id = p_stripe_customer_id
    for update;

  if not found then
    return jsonb_build_object('status', 'unknown_customer');
  end if;

  if p_stripe_event_id is not null then
    insert into public.stripe_webhook_events (id, type)
    values (p_stripe_event_id, coalesce(p_event_type, 'payment_method'))
    on conflict (id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      return jsonb_build_object('status', 'duplicate');
    end if;
  end if;

  if p_replaced then
    -- A replacement older than the one already recorded (events delivered out of
    -- order) must not put the older card back on screen.
    if v_state.payment_method_updated_at is not null and p_event_created < v_state.payment_method_updated_at then
      return jsonb_build_object('status', 'stale');
    end if;

    update public.workspace_billing_state
      set payment_method_brand = p_brand,
          payment_method_last4 = p_last4,
          payment_method_exp_month = p_exp_month,
          payment_method_exp_year = p_exp_year,
          payment_method_updated_at = p_event_created,
          updated_at = now()
      where workspace_id = v_state.workspace_id;

    -- activity_log is readable by every member: no card detail in the payload.
    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (v_state.workspace_id, null, 'workspace', v_state.workspace_id, 'workspace.payment_method_updated', '{}'::jsonb);
  else
    -- The summary refresh only FILLS a gap; it never overwrites a recorded method.
    update public.workspace_billing_state
      set payment_method_brand = coalesce(payment_method_brand, p_brand),
          payment_method_last4 = coalesce(payment_method_last4, p_last4),
          payment_method_exp_month = coalesce(payment_method_exp_month, p_exp_month),
          payment_method_exp_year = coalesce(payment_method_exp_year, p_exp_year),
          updated_at = now()
      where workspace_id = v_state.workspace_id;
  end if;

  return jsonb_build_object('status', 'applied', 'workspace_id', v_state.workspace_id);
end;
$$;

revoke execute on function public.bunkai_apply_billing_payment_method(text, text, timestamptz, text, text, text, int, int, boolean) from public, anon, authenticated;
grant  execute on function public.bunkai_apply_billing_payment_method(text, text, timestamptz, text, text, text, int, int, boolean) to service_role;

comment on function public.bunkai_apply_billing_payment_method(text, text, timestamptz, text, text, text, int, int, boolean) is
  'BK-231 — webhook-only: records the payment-method summary (brand, last four, expiry; never a card number) on the workspace billing state; p_replaced stamps payment_method_updated_at, which unlocks the failed-renewal retry. Idempotent per Stripe event id when one is supplied. SECURITY DEFINER, no caller identity parameter, service_role only.';

-- =============================================================================
-- 7. BK-230 checkout RPC — also creates the billing state row
-- =============================================================================

-- Body logically identical to 0077's final definition (comments aside) except the block marked BK-231, which
-- upserts workspace_billing_state in the same transaction as the plan flip.
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
    return jsonb_build_object('status', 'already_processed');
  end if;

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

    -- BK-231: remember which Stripe customer / subscription this workspace pays
    -- through, so billing details, payment method, invoices and retry can find them.
    if p_stripe_customer_id is not null then
      insert into public.workspace_billing_state (workspace_id, stripe_customer_id, stripe_subscription_id)
      values (v_workspace_id, p_stripe_customer_id, p_stripe_subscription_id)
      on conflict (workspace_id) do update
        set stripe_customer_id = excluded.stripe_customer_id,
            stripe_subscription_id = coalesce(excluded.stripe_subscription_id, public.workspace_billing_state.stripe_subscription_id),
            -- A different customer starts from a clean slate: it must not inherit the
            -- previous customer's card summary or failed-renewal state.
            payment_method_brand = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then null else public.workspace_billing_state.payment_method_brand end,
            payment_method_last4 = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then null else public.workspace_billing_state.payment_method_last4 end,
            payment_method_exp_month = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then null else public.workspace_billing_state.payment_method_exp_month end,
            payment_method_exp_year = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then null else public.workspace_billing_state.payment_method_exp_year end,
            payment_method_updated_at = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then null else public.workspace_billing_state.payment_method_updated_at end,
            payment_state = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then 'paid' else public.workspace_billing_state.payment_state end,
            failed_invoice_id = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then null else public.workspace_billing_state.failed_invoice_id end,
            last_paid_invoice_id = case when public.workspace_billing_state.stripe_customer_id is distinct from excluded.stripe_customer_id then null else public.workspace_billing_state.last_paid_invoice_id end,
            updated_at = now();
    end if;

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

revoke execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.bunkai_apply_billing_checkout_webhook_event(text, text, text, text, text, text, text) to service_role;

-- =============================================================================
-- 8. BK-229 overview RPC — effective plan + grace deadline
-- =============================================================================

-- Body logically identical to 0077's final definition except the lines marked BK-231: `plan`
-- is now the EFFECTIVE plan (a Cloud workspace past its grace end reads as
-- community), and the payload also carries `stored_plan`, `grace_ends_at` and
-- `payment_overdue` (checkout refuses a second subscription while a renewal is unpaid).
-- Same step-0 admin gate, same SECURITY INVOKER posture, same non-disclosure null.
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
  v_grace_ends_at timestamptz;
  v_payment_overdue boolean;
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

  -- BK-231
  select g.ends_at into v_grace_ends_at
  from public.workspace_grace_periods g
  where g.workspace_id = p_workspace_id;

  -- BK-231: an unpaid renewal. The caller is an admin here (step 0), so the
  -- admin-only RLS on workspace_billing_state lets this through.
  select exists (
    select 1
    from public.workspace_billing_state b
    where b.workspace_id = p_workspace_id
      and b.payment_state in ('payment_failed', 'retry_pending')
  ) into v_payment_overdue;

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
    'plan', public.bunkai_effective_plan(v_plan, v_grace_ends_at), -- BK-231
    'stored_plan', v_plan,                                          -- BK-231
    'grace_ends_at', v_grace_ends_at,                               -- BK-231
    'payment_overdue', v_payment_overdue,                           -- BK-231
    'purchased_seats', v_purchased_seats,
    'active_seats', v_active_seats,
    'project_count', v_project_count,
    'oldest_run_age_days', v_oldest_run_age_days
  );
end;
$$;

revoke execute on function public.bunkai_workspace_billing_overview(uuid) from public, anon;
grant  execute on function public.bunkai_workspace_billing_overview(uuid) to authenticated, service_role;

-- =============================================================================
-- 9. Project-limit trigger — evaluate the EFFECTIVE plan
-- =============================================================================

-- Body logically identical to 0077's definition except the lines marked BK-231. SECURITY
-- INVOKER is unchanged: the caller already reads their own workspace row, and
-- workspace_grace_periods is member-readable by design.
create or replace function public.bunkai_enforce_project_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan text;
  v_grace_ends_at timestamptz;
  v_limit int;
  v_count int;
begin
  select w.plan, g.ends_at into v_plan, v_grace_ends_at -- BK-231
  from public.workspaces w
  left join public.workspace_grace_periods g on g.workspace_id = w.id -- BK-231
  where w.id = new.workspace_id;

  v_plan := public.bunkai_effective_plan(v_plan, v_grace_ends_at); -- BK-231

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
