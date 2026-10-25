-- Migration: 0107 — BK-1217: honour the In-app channel preference at write
-- time, while the Email channel keeps delivering through the daily digest.
--
-- Defect: `bunkai_notify_run_event` (0066) and `bunkai_notify_bug_event`
-- (0057) never read `notification_preferences` (0062). Turning Run lifecycle
-- or Bug lifecycle In-app off in Settings was saved, but every run/bug event
-- still landed in the inbox and raised the bell count (BK-213 AC2/AC4).
--
-- Decision trail (BK-1217 Jira comments, implemented here, not re-decided):
--   13138 (AI Product Owner) — option C, independent channels. In-app off
--     hides the event from the inbox, the bell and realtime; Email on still
--     delivers it in the next daily digest exactly once; both channels off
--     delivers and stores nothing. The decision is a snapshot taken when the
--     event happens: toggling later never hides existing items and never
--     resurrects suppressed ones (BK-213 "future deliveries only").
--   13139 (AI Tech Lead) — shape T1: a write-time flag
--     (`in_app_suppressed`) read by the existing SELECT/UPDATE RLS policies,
--     plus `emailed_at`, stamped by the digest runner after a successful
--     send, so an email-only row is digested once instead of daily for 90
--     days.
--
-- Objects, in dependency order:
--   1. notifications.in_app_suppressed / notifications.emailed_at (additive,
--      no backfill: existing rows default to visible, no index change).
--   2. bunkai_notification_channel_enabled — preference lookup helper.
--   3. bunkai_notify_run_event  — restated from 0066 + the preference gate.
--   4. bunkai_notify_bug_event  — restated from 0057 + the per-recipient gate.
--   5. notifications_select_recipient_member_retained /
--      notifications_update_recipient_member — restated from 0053 with
--      `and not in_app_suppressed`.
--   6. bunkai_notification_digest_candidates — restated from 0089 (keeps the
--      BK-991 deleted-workspace guard) + the once-only predicate.
--
-- Every function is `create or replace` (0088: drop-and-recreate re-grants
-- qa_inspector_ro through 0085's default privileges; `create or replace`
-- keeps the curated ACL). Signatures and return types are unchanged.
--
-- Authorization (ADR-0012 / rpc-authorization.md):
--   - The two producers stay SECURITY DEFINER trigger functions with no
--     caller-supplied parameter (nothing to actor-bind); their existing ACLs
--     are untouched (pre-existing 0088 debt, out of scope here).
--   - The helper takes an identity parameter, so it is NOT callable by any
--     client role: execute is revoked from public, anon and authenticated and
--     granted to service_role only. It is SECURITY INVOKER: called from the
--     DEFINER producers it runs as their owner (postgres, which owns
--     notification_preferences, RLS not forced), so it reads preferences
--     without RLS. 0085's default privileges also grant EXECUTE to
--     qa_inspector_ro / qa_inspector_rw; for a read-only INVOKER function that
--     matches 0085's own intent and is left as is.
--   - RLS is the single in-app choke point: the list RPC (SECURITY INVOKER)
--     items and unread_count, the layout badge, Realtime postgres_changes and
--     both mark-read routes all go through these two policies, so no client
--     or route change is needed. Mark-one on a suppressed id matches zero rows
--     and answers the existing not_found; mark-all never stamps read_at on a
--     suppressed row (which would otherwise silently drop it from the digest).
--   - The digest RPC is SECURITY DEFINER, service_role only (ADR-0017), and
--     bypasses RLS, so it keeps seeing suppressed rows until they are emailed.
--
-- Never raise: both producers fire from AFTER INSERT triggers on
-- activity_log inside the same transaction as the finish / abort / assign /
-- transition that wrote the row. The helper is a plain indexed lookup (the
-- (user_id, event_type, channel) unique index) that cannot raise for any
-- input, and an unmapped event type or a missing preference row reads as
-- "enabled", matching 0062's no-seed default.

-- ============================================================================
-- 1. notifications — write-time suppression flag + once-only email stamp
-- ============================================================================

alter table public.notifications
  add column if not exists in_app_suppressed boolean not null default false,
  add column if not exists emailed_at timestamptz null;

-- ============================================================================
-- 2. bunkai_notification_channel_enabled — preference lookup
-- ============================================================================
--
-- True unless the user holds an explicit `enabled = false` row for the
-- event's category on that channel. `run.%` -> run_lifecycle,
-- `bug.%` -> bug_lifecycle; any other event type maps to null, matches no
-- row, and is therefore always enabled (same as a missing row, 0062).
-- The digest RPC keeps its own inline mapping (not refactored here).

create or replace function public.bunkai_notification_channel_enabled(
  p_user_id    uuid,
  p_event_type text,
  p_channel    text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1
      from public.notification_preferences np
      where np.user_id = p_user_id
        and np.channel = p_channel
        and np.enabled = false
        and np.event_type = case
              when p_event_type like 'run.%' then 'run_lifecycle'
              when p_event_type like 'bug.%' then 'bug_lifecycle'
            end
  );
$$;

revoke execute on function public.bunkai_notification_channel_enabled(uuid, text, text) from public;
revoke execute on function public.bunkai_notification_channel_enabled(uuid, text, text) from anon;
revoke execute on function public.bunkai_notification_channel_enabled(uuid, text, text) from authenticated;
grant  execute on function public.bunkai_notification_channel_enabled(uuid, text, text) to service_role;

-- ============================================================================
-- 3. bunkai_notify_run_event — restated from 0066, plus the preference gate
-- ============================================================================
--
-- Only change against 0066: after the existing cookie self-suppression, read
-- the starter's In-app and Email preferences for this event. Both off -> no
-- row. Otherwise insert, with `in_app_suppressed = not in_app`.

create or replace function public.bunkai_notify_run_event()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_test_title   text;
  v_project_slug text;
  v_recipient    uuid;
  v_payload      jsonb;
  v_in_app       boolean;
begin
  -- Snapshot the run's start-time test title, its project's slug, and its
  -- starter, scoped to THIS run (new.entity_id) only. `executor_user_id` is
  -- the starter: bunkai_create_run stamps it with p_actor_user_id at start
  -- (0031_runs.sql) and no path ever rewrites it afterward.
  -- `executor_mode` is deliberately NOT selected — it is never a branch in
  -- this rule (12196: suppression reads the SESSION KIND of the terminal
  -- call, via `new.payload ->> 'via'`, never the run's declared executor).
  select r.test_title, p.slug, r.executor_user_id
    into v_test_title, v_project_slug, v_recipient
    from public.runs r
    join public.projects p on p.id = r.project_id
    where r.id = new.entity_id;

  -- Nothing to snapshot: never raise out of an AFTER INSERT trigger, or the
  -- finish/abort that fired it rolls back (0056 header, verbatim reasoning).
  if v_test_title is null then
    return new;
  end if;

  -- Null recipient (starter's account deleted -> executor_user_id ON DELETE
  -- SET NULL): no notification, silently — notifications.recipient_user_id
  -- is NOT NULL, so there is nothing coherent to insert.
  if v_recipient is null then
    return new;
  end if;

  -- Suppression (12196, superseding 12173's identity-only predicate):
  -- self-suppress ONLY when the actor is the starter AND the terminal call
  -- arrived through an interactive cookie session. A bearer/PAT-borne call
  -- notifies even when it authenticates as the starter (ADR-0001 Path B —
  -- the impersonated actor IS the starter, so identity alone is not enough
  -- to distinguish "Elena finished her own run" from "an agent finished it
  -- using Elena's PAT"). `is not distinct from` (not `<>`) is 0056's own
  -- operator: `activity_log.actor_user_id` is nullable, and `<>` against a
  -- null yields null (never false), which would silently suppress every
  -- notification for an unattributed event.
  if v_recipient is not distinct from new.actor_user_id
     and (new.payload ->> 'via') = 'cookie'
  then
    return new;
  end if;

  -- BK-1217: channel preferences, read at event time (a later toggle never
  -- rewrites this decision). Both channels off -> nothing delivered, nothing
  -- stored. In-app off + Email on -> stored as email-only (hidden by RLS,
  -- digested once).
  v_in_app := public.bunkai_notification_channel_enabled(v_recipient, new.action, 'in_app');
  if not v_in_app
     and not public.bunkai_notification_channel_enabled(v_recipient, new.action, 'email')
  then
    return new;
  end if;

  if new.action = 'run.finished' then
    v_payload := jsonb_build_object(
      'title', v_test_title,
      'project_slug', v_project_slug,
      'verdict', new.payload -> 'verdict'
    );
  else -- 'run.aborted'
    v_payload := jsonb_build_object(
      'title', v_test_title,
      'project_slug', v_project_slug,
      'reason', new.payload -> 'reason'
    );
  end if;

  insert into public.notifications (
    workspace_id, recipient_user_id, event_type, entity_type, entity_id, payload, source_event_id,
    in_app_suppressed
  )
  values (
    new.workspace_id, v_recipient, new.action, 'run', new.entity_id, v_payload, new.id,
    not v_in_app
  )
  on conflict (source_event_id, recipient_user_id) do nothing;

  return new;
end;
$$;

-- ============================================================================
-- 4. bunkai_notify_bug_event — restated from 0057, plus the per-recipient gate
-- ============================================================================
--
-- Only change against 0057: the same evaluation, per recipient, inside the
-- existing loop. `continue` when both channels are off for that recipient
-- (the other recipients of the same event are unaffected).

create or replace function public.bunkai_notify_bug_event()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_bug_title    text;
  v_reporter_id  uuid;
  v_project_slug text;
  v_run_id       uuid;
  v_assignee_id  uuid;
  v_recipients   uuid[];
  v_recipient    uuid;
  v_payload      jsonb;
  v_in_app       boolean;
begin
  -- Snapshot the bug's title + owning project's slug + run provenance,
  -- scoped to THIS bug (new.entity_id) only — never a caller-supplied id.
  select b.title, b.created_by, p.slug, b.run_id
    into v_bug_title, v_reporter_id, v_project_slug, v_run_id
    from public.bugs b
    join public.projects p on p.id = b.project_id
    where b.id = new.entity_id;

  if v_bug_title is null then
    -- Nothing to snapshot (see 0056's header) — never raise out of this trigger.
    return new;
  end if;

  if new.action in ('bug.assigned', 'bug.reassigned') then
    -- "assignment events notify the new assignee only" — no actor
    -- exclusion for this event class (see 0056's header), and the previously
    -- assigned user gets no removal notification in this story.
    v_recipients := array_remove(array[(new.payload ->> 'assignee_user_id')::uuid], null);
    v_payload := jsonb_build_object(
      'title', v_bug_title,
      'project_slug', v_project_slug,
      'run_id', v_run_id,
      'assignee_user_id', new.payload -> 'assignee_user_id',
      'previous_assignee_user_id', new.payload -> 'previous_assignee_user_id'
    );
  elsif new.action = 'bug.status_changed' then
    -- "status-change events notify the reporter and the current assignee,
    -- always excluding the user who made the change" + "at most one
    -- notification per recipient, even when reporter and assignee are the
    -- same person" — dedupe via array_agg(distinct ...), actor + nulls
    -- filtered in the same pass.
    v_assignee_id := (new.payload ->> 'assignee_user_id')::uuid;
    select coalesce(array_agg(distinct r), array[]::uuid[])
      into v_recipients
      from unnest(array[v_reporter_id, v_assignee_id]) as r
      where r is not null and r is distinct from new.actor_user_id;
    v_payload := jsonb_build_object(
      'title', v_bug_title,
      'project_slug', v_project_slug,
      'run_id', v_run_id,
      'previous_status', new.payload -> 'previous_status',
      'status', new.payload -> 'status',
      'assignee_user_id', new.payload -> 'assignee_user_id'
    );
  else
    -- bug.unassigned: no new assignee, not a status change — no recipient
    -- is defined for it in this story (see 0056's header).
    v_recipients := array[]::uuid[];
    v_payload := '{}'::jsonb;
  end if;

  foreach v_recipient in array v_recipients
  loop
    -- BK-1217: per-recipient channel preferences, read at event time. Both
    -- off -> skip this recipient only. In-app off + Email on -> email-only.
    v_in_app := public.bunkai_notification_channel_enabled(v_recipient, new.action, 'in_app');
    if not v_in_app
       and not public.bunkai_notification_channel_enabled(v_recipient, new.action, 'email')
    then
      continue;
    end if;

    insert into public.notifications (
      workspace_id, recipient_user_id, event_type, entity_type, entity_id, payload, source_event_id,
      in_app_suppressed
    )
    values (
      new.workspace_id, v_recipient, new.action, 'bug', new.entity_id, v_payload, new.id,
      not v_in_app
    )
    on conflict (source_event_id, recipient_user_id) do nothing;
  end loop;

  return new;
end;
$$;

-- ============================================================================
-- 5. RLS — suppressed rows are invisible and immutable to every client
-- ============================================================================
--
-- Predicates restated verbatim from 0053, plus `and not in_app_suppressed`.
-- SELECT covers the list RPC items + unread_count, the layout badge and
-- Realtime delivery. UPDATE (USING and WITH CHECK) covers mark-one (zero rows
-- -> the existing not_found) and mark-all (never stamps read_at on a hidden
-- row; BK-209: "hidden or inaccessible notifications must not be mutated").

drop policy if exists notifications_select_recipient_member_retained on public.notifications;
create policy notifications_select_recipient_member_retained
  on public.notifications
  for select
  using (
    recipient_user_id = auth.uid()
    and public.bunkai_is_workspace_member(workspace_id)
    and created_at >= now() - interval '90 days'
    and not in_app_suppressed
  );

drop policy if exists notifications_update_recipient_member on public.notifications;
create policy notifications_update_recipient_member
  on public.notifications
  for update
  using (
    recipient_user_id = auth.uid()
    and public.bunkai_is_workspace_member(workspace_id)
    and not in_app_suppressed
  )
  with check (
    recipient_user_id = auth.uid()
    and public.bunkai_is_workspace_member(workspace_id)
    and not in_app_suppressed
  );

-- ============================================================================
-- 6. bunkai_notification_digest_candidates — restated from 0089, plus the
--    once-only predicate for email-only rows
-- ============================================================================
--
-- A visible (in-app) unread row keeps being re-included every day while it
-- stays unread (BK-214, unchanged). An email-only row can never be read in
-- the app, so it is included only until the runner stamps `emailed_at` after
-- a successful send (lib/notifications/send-digest-run.ts).

create or replace function public.bunkai_notification_digest_candidates()
returns table (
  recipient_user_id uuid,
  recipient_email    text,
  workspace_id       uuid,
  project_id         uuid,
  project_name       text,
  project_slug       text,
  notification_id    uuid,
  event_type         text,
  entity_type        text,
  entity_id          uuid,
  payload            jsonb,
  created_at         timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    n.recipient_user_id,
    u.email,
    n.workspace_id,
    p.id,
    p.name,
    p.slug,
    n.id,
    n.event_type,
    n.entity_type,
    n.entity_id,
    n.payload,
    n.created_at
  from public.notifications n
  join public.workspace_members wm
    on wm.workspace_id = n.workspace_id
   and wm.user_id = n.recipient_user_id
   and wm.status = 'active'
  -- BK-991: no digest for a soft-deleted workspace (AC-07: notifications
  -- stop at the same instant as read access).
  join public.workspaces w
    on w.id = n.workspace_id
   and w.deleted_at is null
  join auth.users u
    on u.id = n.recipient_user_id
   and u.email is not null
  left join public.runs r
    on n.entity_type = 'run' and r.id = n.entity_id
  left join public.bugs b
    on n.entity_type = 'bug' and b.id = n.entity_id
  join public.projects p
    on p.id = coalesce(r.project_id, b.project_id)
  where n.read_at is null
    and n.created_at >= now() - interval '90 days'
    -- BK-1217: an email-only row is digested once.
    and (not n.in_app_suppressed or n.emailed_at is null)
    and n.event_type in (
      'run.finished', 'run.aborted',
      'bug.assigned', 'bug.reassigned', 'bug.status_changed'
    )
    and not exists (
      select 1
        from public.notification_preferences np
        where np.user_id = n.recipient_user_id
          and np.channel = 'email'
          and np.enabled = false
          and np.event_type = case
                when n.event_type like 'run.%' then 'run_lifecycle'
                when n.event_type like 'bug.%' then 'bug_lifecycle'
              end
    )
  order by n.recipient_user_id, p.name, n.created_at desc;
$$;

revoke execute on function public.bunkai_notification_digest_candidates() from public;
revoke execute on function public.bunkai_notification_digest_candidates() from anon;
revoke execute on function public.bunkai_notification_digest_candidates() from authenticated;
grant  execute on function public.bunkai_notification_digest_candidates() to service_role;
