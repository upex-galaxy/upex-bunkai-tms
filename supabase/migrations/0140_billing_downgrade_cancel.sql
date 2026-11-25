-- 0140_billing_downgrade_cancel.sql — BK-233: Billing | Downgrade or cancel the
-- subscription
--
-- ADDITIVE AND IDEMPOTENT: four nullable/defaulted columns, three new functions and
-- one trigger per guarded table. Nothing is dropped, renamed or rewritten, and no
-- existing row changes value.
--
--   * workspace_billing_state gains the subscription lifecycle the Billing screen
--     shows: whether the subscription cancels at the end of the paid period, when
--     that period ends, when the owner asked, and the newest Stripe subscription
--     event applied (out-of-order guard).
--   * bunkai_read_only_project_ids(workspace) — the projects that are over the
--     EFFECTIVE plan's project limit (ADR-0021), oldest first
--     (created_at asc, id asc). Derived on every call, never stored (AI Tech Lead
--     ruling 2026-11-19): a workspace at or under its limit has none, so a
--     workspace within its plan can never be locked, and a re-upgrade restores
--     editing at once because there is nothing to undo.
--   * bunkai_guard_project_writable() — BEFORE INSERT/UPDATE trigger on the
--     project-scoped content tables. Refuses the write with SQLSTATE 45701
--     `project_read_only` when the target project is read-only. Reads are never
--     affected, DELETE is never guarded (cleanup, project deletion and workspace
--     deletion can never be wedged by a plan change), and writes made by another
--     trigger or a cascade (pg_trigger_depth() > 1) pass, so bookkeeping keeps
--     working. Runs and import jobs are guarded on INSERT only: a run or import
--     already started before a downgrade can still finish.
--   * bunkai_apply_billing_subscription_event — service_role only, no actor
--     parameter (ADR-0012). Applies `customer.subscription.updated` (cancel at period
--     end, or the cancellation reverted) and `customer.subscription.deleted` (the
--     subscription ended: the workspace drops to community, nothing is deleted).
--     Idempotent per Stripe event id through stripe_webhook_events. The app calls it
--     with a null event id right after its own successful Stripe call, so the
--     owner sees the change without waiting for the webhook; the webhook then
--     replays the same state.

-- =============================================================================
-- 1. workspace_billing_state — subscription lifecycle columns
-- =============================================================================

alter table public.workspace_billing_state
  add column if not exists cancel_at_period_end  boolean not null default false,
  add column if not exists current_period_end    timestamptz null,
  add column if not exists cancel_requested_at   timestamptz null,
  add column if not exists subscription_event_at timestamptz null;

-- =============================================================================
-- 2. bunkai_read_only_project_ids — derived, oldest first
-- =============================================================================

-- Project limits mirror lib/billing/plan-tiers.ts (TS owns the ladder, SQL mirrors
-- the literal, same convention as 0077's bunkai_enforce_project_limit). An unknown
-- plan returns no read-only project: this function must fail open, never lock.
create or replace function public.bunkai_read_only_project_ids(p_workspace_id uuid)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with lim as (
    select case public.bunkai_effective_plan(w.plan, g.ends_at)
             when 'community' then 3
             when 'cloud' then 50
             else null
           end as project_limit
    from public.workspaces w
    left join public.workspace_grace_periods g on g.workspace_id = w.id
    where w.id = p_workspace_id
  ),
  ranked as (
    select p.id,
           row_number() over (order by p.created_at asc, p.id asc) as rnk,
           count(*) over () as total
    from public.projects p
    where p.workspace_id = p_workspace_id
  )
  select r.id
  from ranked r
  cross join lim
  where lim.project_limit is not null
    and r.rnk <= r.total - lim.project_limit
  order by r.rnk;
$$;

revoke execute on function public.bunkai_read_only_project_ids(uuid) from public, anon;
grant  execute on function public.bunkai_read_only_project_ids(uuid) to authenticated, service_role;

comment on function public.bunkai_read_only_project_ids(uuid) is
  'BK-233 — the projects of a workspace that are over its EFFECTIVE plan''s project limit (ADR-0021), oldest first (created_at asc, id asc). Derived on every call; empty when the workspace is at or under its limit or on an unlimited or unknown plan. SECURITY INVOKER: a caller sees only what RLS already lets them read.';

-- =============================================================================
-- 3. bunkai_guard_project_writable — the write lock
-- =============================================================================

-- SECURITY DEFINER so the check counts every project of the workspace whatever the
-- caller can see (an RLS-narrowed count would undercount and let a write through).
-- It takes no argument and only reads; it is never callable as an RPC.
create or replace function public.bunkai_guard_project_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row        jsonb;
  v_projects   uuid[] := '{}';
  v_project    uuid;
  v_workspace  uuid;
  v_plan       text;
  v_grace      timestamptz;
  v_limit      int;
  v_count      int;
  v_pass       int;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  for v_pass in 1..2 loop
    if v_pass = 1 then
      v_row := to_jsonb(new);
    elsif tg_op = 'UPDATE' then
      v_row := to_jsonb(old);
    else
      exit;
    end if;

    v_project := null;
    if tg_table_name = 'projects' then
      v_project := (v_row->>'id')::uuid;
    elsif v_row ? 'project_id' and v_row->>'project_id' is not null then
      v_project := (v_row->>'project_id')::uuid;
    elsif v_row ? 'module_id' and v_row->>'module_id' is not null then
      select m.project_id into v_project from public.modules m where m.id = (v_row->>'module_id')::uuid;
    elsif v_row ? 'atc_id' and v_row->>'atc_id' is not null then
      select a.project_id into v_project from public.atcs a where a.id = (v_row->>'atc_id')::uuid;
    elsif v_row ? 'user_story_id' and v_row->>'user_story_id' is not null then
      select coalesce(us.project_id, m.project_id) into v_project
        from public.user_stories us
        left join public.modules m on m.id = us.module_id
        where us.id = (v_row->>'user_story_id')::uuid;
    elsif v_row ? 'test_plan_id' and v_row->>'test_plan_id' is not null then
      select tp.project_id into v_project from public.test_plans tp where tp.id = (v_row->>'test_plan_id')::uuid;
    end if;

    if v_project is not null and not (v_project = any (v_projects)) then
      v_projects := v_projects || v_project;
    end if;
  end loop;

  foreach v_project in array v_projects loop
    select p.workspace_id, w.plan, g.ends_at
      into v_workspace, v_plan, v_grace
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      left join public.workspace_grace_periods g on g.workspace_id = w.id
      where p.id = v_project;

    if v_workspace is null then
      continue;
    end if;

    v_limit := case public.bunkai_effective_plan(v_plan, v_grace)
                 when 'community' then 3
                 when 'cloud' then 50
                 else null
               end;
    if v_limit is null then
      continue;
    end if;

    select count(*) into v_count from public.projects p where p.workspace_id = v_workspace;
    if v_count <= v_limit then
      continue;
    end if;

    if exists (select 1 from public.bunkai_read_only_project_ids(v_workspace) r where r = v_project) then
      raise exception 'project_read_only'
        using errcode = '45701',
              detail = jsonb_build_object(
                'project_id', v_project,
                'plan', public.bunkai_effective_plan(v_plan, v_grace),
                'limit', v_limit
              )::text;
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.bunkai_guard_project_writable() from public, anon, authenticated;

comment on function public.bunkai_guard_project_writable() is
  'BK-233 — BEFORE INSERT/UPDATE trigger: refuses a write to a project that is over its workspace''s EFFECTIVE plan limit (bunkai_read_only_project_ids) with SQLSTATE 45701 project_read_only. Checks the new and the old project of an UPDATE. Never guards DELETE; writes from another trigger or a cascade (pg_trigger_depth() > 1) pass. A workspace at or under its limit never reaches the read-only lookup.';

-- Content tables: INSERT and UPDATE.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'modules', 'user_stories', 'acceptance_criteria', 'atcs', 'atc_steps',
    'atc_assertions', 'atc_acceptance_criteria', 'bugs', 'bug_evidence_attachments',
    'milestones', 'test_plans', 'test_plan_tests', 'project_environments',
    'project_tracker_settings', 'project_repository_settings'
  ] loop
    execute format('drop trigger if exists bunkai_guard_project_writable_trigger on public.%I', v_table);
    execute format(
      'create trigger bunkai_guard_project_writable_trigger before insert or update on public.%I
         for each row execute function public.bunkai_guard_project_writable()',
      v_table
    );
  end loop;
end;
$$;

-- Starting a run or an import is a write; finishing one already started is not refused.
drop trigger if exists bunkai_guard_project_writable_trigger on public.runs;
create trigger bunkai_guard_project_writable_trigger
  before insert on public.runs
  for each row execute function public.bunkai_guard_project_writable();

drop trigger if exists bunkai_guard_project_writable_trigger on public.import_jobs;
create trigger bunkai_guard_project_writable_trigger
  before insert on public.import_jobs
  for each row execute function public.bunkai_guard_project_writable();

-- The project row itself: renaming or editing a read-only project is refused,
-- deleting it is not (creating one is the project-limit trigger's job).
drop trigger if exists bunkai_guard_project_writable_trigger on public.projects;
create trigger bunkai_guard_project_writable_trigger
  before update on public.projects
  for each row execute function public.bunkai_guard_project_writable();

-- =============================================================================
-- 4. bunkai_apply_billing_subscription_event — webhook and post-call confirm
-- =============================================================================

create or replace function public.bunkai_apply_billing_subscription_event(
  p_stripe_event_id         text,
  p_event_type              text,
  p_event_created           timestamptz,
  p_stripe_customer_id      text,
  p_stripe_subscription_id  text,
  p_cancel_at_period_end    boolean,
  p_current_period_end      timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted   int;
  v_state      public.workspace_billing_state%rowtype;
  v_read_only  int;
begin
  select * into v_state
    from public.workspace_billing_state
    where stripe_customer_id = p_stripe_customer_id
    for update;

  if not found then
    return jsonb_build_object('status', 'unknown_customer');
  end if;

  -- An event for a subscription this workspace no longer pays through (an older
  -- one, or one already ended) must never touch the current state.
  if v_state.stripe_subscription_id is null
     or v_state.stripe_subscription_id is distinct from p_stripe_subscription_id then
    return jsonb_build_object('status', 'ignored');
  end if;

  if p_stripe_event_id is not null then
    insert into public.stripe_webhook_events (id, type)
    values (p_stripe_event_id, p_event_type)
    on conflict (id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      return jsonb_build_object('status', 'duplicate');
    end if;
  end if;

  if p_event_type = 'customer.subscription.updated' then
    if v_state.subscription_event_at is not null and p_event_created < v_state.subscription_event_at then
      return jsonb_build_object('status', 'stale');
    end if;

    update public.workspace_billing_state
      set cancel_at_period_end  = coalesce(p_cancel_at_period_end, false),
          current_period_end    = coalesce(p_current_period_end, current_period_end),
          cancel_requested_at   = case
                                    when coalesce(p_cancel_at_period_end, false) and not v_state.cancel_at_period_end then now()
                                    when coalesce(p_cancel_at_period_end, false) then cancel_requested_at
                                    else null
                                  end,
          subscription_event_at = p_event_created,
          updated_at            = now()
      where workspace_id = v_state.workspace_id;

    if coalesce(p_cancel_at_period_end, false) and not v_state.cancel_at_period_end then
      insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
      values (
        v_state.workspace_id, null, 'workspace', v_state.workspace_id, 'workspace.subscription_cancel_scheduled',
        jsonb_build_object('ends_at', coalesce(p_current_period_end, v_state.current_period_end))
      );
      return jsonb_build_object('status', 'cancel_scheduled', 'workspace_id', v_state.workspace_id);
    end if;

    if not coalesce(p_cancel_at_period_end, false) and v_state.cancel_at_period_end then
      insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
      values (v_state.workspace_id, null, 'workspace', v_state.workspace_id, 'workspace.subscription_resumed', '{}'::jsonb);
      return jsonb_build_object('status', 'resumed', 'workspace_id', v_state.workspace_id);
    end if;

    return jsonb_build_object('status', 'updated', 'workspace_id', v_state.workspace_id);
  end if;

  if p_event_type = 'customer.subscription.deleted' then
    -- Only a Cloud plan bought through this subscription drops; an Enterprise
    -- contract is never touched by a Stripe event.
    update public.workspaces
      set plan = 'community',
          purchased_seats = null
      where id = v_state.workspace_id
        and plan = 'cloud';

    -- The customer, the card summary and the invoices stay: re-upgrading reuses
    -- them, and nothing about the workspace is deleted.
    update public.workspace_billing_state
      set stripe_subscription_id = null,
          cancel_at_period_end   = false,
          current_period_end     = null,
          cancel_requested_at    = null,
          payment_state          = 'paid',
          failed_invoice_id      = null,
          retry_started_at       = null,
          subscription_event_at  = p_event_created,
          updated_at             = now()
      where workspace_id = v_state.workspace_id;

    delete from public.workspace_grace_periods where workspace_id = v_state.workspace_id;

    select count(*) into v_read_only from public.bunkai_read_only_project_ids(v_state.workspace_id);

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_state.workspace_id, null, 'workspace', v_state.workspace_id, 'workspace.plan_downgraded',
      jsonb_build_object('plan', 'community', 'read_only_projects', v_read_only)
    );

    return jsonb_build_object('status', 'downgraded', 'workspace_id', v_state.workspace_id, 'read_only_projects', v_read_only);
  end if;

  return jsonb_build_object('status', 'ignored');
end;
$$;

revoke execute on function public.bunkai_apply_billing_subscription_event(text, text, timestamptz, text, text, boolean, timestamptz) from public, anon, authenticated;
grant  execute on function public.bunkai_apply_billing_subscription_event(text, text, timestamptz, text, text, boolean, timestamptz) to service_role;

comment on function public.bunkai_apply_billing_subscription_event(text, text, timestamptz, text, text, boolean, timestamptz) is
  'BK-233 — webhook-only (and the app''s own confirm after a successful Stripe call, with a null event id): customer.subscription.updated records cancel-at-period-end and the period end (out-of-order guard on subscription_event_at); customer.subscription.deleted drops a cloud workspace to community, clears the subscription and any grace window, and deletes nothing. Idempotent per Stripe event id via stripe_webhook_events. Ignores events for any subscription other than the current one. SECURITY DEFINER, no caller identity parameter, service_role only.';

-- =============================================================================
-- 5. qa_inspector_ro — no writer reaches the read-only inspector role
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_guard_project_writable() from qa_inspector_ro;
    revoke all on function public.bunkai_apply_billing_subscription_event(text, text, timestamptz, text, text, boolean, timestamptz) from qa_inspector_ro;
  end if;
end;
$$;
