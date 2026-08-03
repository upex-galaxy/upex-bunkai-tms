-- Migration: 0056 — BK-212 Slice 1: Notifications | bug assignment + status
-- change producer (DB layer only)
-- Authored: 2026-08-03
--
-- Wires the two upstream producers that already exist — BK-264's
-- `bunkai_assign_bug` / `bunkai_transition_bug_status` (0054), which write
-- `bug.assigned` / `bug.reassigned` / `bug.unassigned` / `bug.status_changed`
-- rows to `activity_log` — into BK-209's `notifications` inbox (0053). An
-- `AFTER INSERT ON activity_log` trigger is the natural fit: both producer
-- RPCs already write their audit row inside the SAME transaction as the
-- mutation, so a trigger on that write gets the notification "for free"
-- inside that transaction, without either RPC needing to know BK-212 exists.
--
-- NOTE ON NUMBERING: verified against both the local migrations directory
-- and the live project's migration ledger (mcp__supabase__list_migrations,
-- project fmbpikzpkafptqximhxn) at Stage 2 start — 0055_activity_bug_events
-- is the last applied migration, so 0056 is next.
--
-- Recipient rule per event (BK-212 business-rules.md / scope.md, quoted
-- verbatim — NOT invented for this migration):
--   "Audiences: assignment events notify the new assignee only;
--    status-change events notify the reporter and the current assignee,
--    always excluding the user who made the change."
--   "Reassignment notifies the newly assigned user; the previously assigned
--    user receives no removal notification in this story."
--   "One status change produces at most one notification per recipient,
--    even when reporter and assignee are the same person."
-- scope.md only defines recipients for "assigned (or reassigned)" and for a
-- status change — an unassignment produces no new assignee and is not a
-- status change, so `bug.unassigned` has no recipient defined in this story
-- and is a deliberate no-op below, not an oversight.
--
-- Note what the business rule does NOT say: the actor-exclusion clause is
-- grammatically scoped only to "status-change events" — assignment events
-- have no stated self-notification exclusion, so a self-assign/self-reassign
-- DOES notify the actor here. Read literally from the ratified text rather
-- than assumed from the equivalent status-changed behavior.
--
-- Authorization model (ADR-0012 / rpc-authorization.md): this trigger
-- function is `SECURITY DEFINER` by necessity — its whole purpose is to
-- write a `notifications` row on behalf of the RECIPIENT (the new assignee,
-- or the reporter/assignee on a status change), who is essentially never the
-- same as `auth.uid()` (the actor whose write fired the trigger), and
-- `notifications` deliberately carries no INSERT policy for authenticated
-- clients at all (0053's own comment: "No insert policy for authenticated
-- clients... Rows arrive only via a future producer SECURITY DEFINER
-- function"). Unlike an RPC, a trigger function takes NO caller-supplied
-- parameter of any kind — there is nothing to actor-bind (ADR-0012 question
-- 3 is vacuous here) because there is no parameter to spoof in the first
-- place. `SECURITY DEFINER` is declared explicitly (mirrors 0054's own
-- amendment of `bunkai_bugs_check_consistency`, "independent of whatever
-- context invoked it") rather than relying on this trigger incidentally
-- running inside its DEFINER callers' elevated role.
--
-- What this trigger DOES trust, and why each source is already authorized:
--   - `new.workspace_id` / `new.actor_user_id` / `new.entity_id` / `new.action`
--     / `new.payload` — the activity_log row this trigger fires ON. Both
--     producer RPCs bind `workspace_id` to the bug's OWN row (never a
--     caller-supplied value) and `actor_user_id` to `auth.uid()` directly
--     (0054's own header) before writing it — this trigger consumes an
--     already-trustworthy row, it does not re-derive trust.
--   - `public.bugs.title` / `.created_by` / `.project_id` and
--     `public.projects.slug`, looked up by `new.entity_id` (the bug this
--     activity row is ABOUT) — read-only lookups scoped to that same bug,
--     never a caller-supplied id.
-- Nothing here is a caller-supplied identity or scope parameter, so there is
-- no actor-bind guard to write — the six-question checklist's actionable
-- items are (4) result scoping (every row this trigger inserts is scoped to
-- `new.workspace_id` and a recipient computed only from `new.payload` /
-- `public.bugs`, never an external input) and (6) the DB-integration test
-- (`lib/notifications/bug-event-trigger-isolation.test.ts`, this slice).
--
-- Idempotency: `notifications` gains `source_event_id` (the `activity_log.id`
-- that produced it) + `unique (source_event_id, recipient_user_id)` — BK-209
-- shipped without one since no producer existed yet. Every insert below goes
-- through `on conflict (source_event_id, recipient_user_id) do nothing`, so a
-- trigger that somehow fires twice for the same activity_log row (a retried
-- statement, a future replay/backfill) can never double-notify the same
-- recipient. `source_event_id` is nullable and carries no unique constraint
-- BY ITSELF — existing/future rows from other producers that never populate
-- it stay unaffected (Postgres never treats two NULLs as equal in a unique
-- constraint), and no foreign key is added to `activity_log` — this column
-- is purely an idempotency token for THIS trigger, not a browsable relation
-- the app needs (YAGNI; mirrors 0053's own precedent of omitting an FK where
-- the relation isn't needed for anything the read path does).
--
-- Payload: a small superset of what 0054 already writes to `activity_log`,
-- snapshotted at write time (mirrors 0053's own "payload jsonb snapshot...
-- so the inbox never has to join live runs/tests/bugs to render a summary").
-- Adds `title` (bugs.title) and `project_slug` (projects.slug) — neither
-- exists in the activity_log payload today. `project_slug` specifically
-- matches the wire contract `lib/notifications/entity-routes.ts` already
-- documents ("the payload snapshot is the ONLY source for `project_slug`");
-- populating it now means a future Slice 2 UI change can add a `bug` case to
-- that resolver's switch without ANOTHER migration to backfill the field.
-- Uses a per-action POSITIVE projection (never a blanket copy of
-- `new.payload`), mirroring 0055's own "Decision 3 / Risk R3" convention.
--
-- Custom SQLSTATE: none allocated — this trigger never raises. A bug row
-- that cannot be found (should not happen; this fires inside the SAME
-- transaction as the RPC that just wrote the referencing activity_log row)
-- is treated as "nothing to snapshot yet" and silently skipped, and a null
-- assignee is defensively filtered out of the recipient array before the
-- insert loop — both on purpose, so a defect in this producer can never
-- raise out of an AFTER INSERT trigger and roll back the bug mutation that
-- fired it (an assignment/status-change RPC succeeding is more important
-- than the notification that describes it).

-- ============================================================================
-- 1. notifications — idempotency column + constraint
-- ============================================================================

alter table public.notifications
  add column if not exists source_event_id uuid null;

alter table public.notifications
  drop constraint if exists notifications_source_event_recipient_key;
alter table public.notifications
  add constraint notifications_source_event_recipient_key
  unique (source_event_id, recipient_user_id);

-- ============================================================================
-- 2. bunkai_notify_bug_event — AFTER INSERT trigger on activity_log
-- ============================================================================

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
  v_assignee_id  uuid;
  v_recipients   uuid[];
  v_recipient    uuid;
  v_payload      jsonb;
begin
  -- Snapshot the bug's title + owning project's slug, scoped to THIS bug
  -- (new.entity_id) only — never a caller-supplied id.
  select b.title, b.created_by, p.slug
    into v_bug_title, v_reporter_id, v_project_slug
    from public.bugs b
    join public.projects p on p.id = b.project_id
    where b.id = new.entity_id;

  if v_bug_title is null then
    -- Nothing to snapshot (see header) — never raise out of this trigger.
    return new;
  end if;

  if new.action in ('bug.assigned', 'bug.reassigned') then
    -- "assignment events notify the new assignee only" — no actor
    -- exclusion for this event class (see header), and the previously
    -- assigned user gets no removal notification in this story.
    v_recipients := array_remove(array[(new.payload ->> 'assignee_user_id')::uuid], null);
    v_payload := jsonb_build_object(
      'title', v_bug_title,
      'project_slug', v_project_slug,
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
      'previous_status', new.payload -> 'previous_status',
      'status', new.payload -> 'status',
      'assignee_user_id', new.payload -> 'assignee_user_id'
    );
  else
    -- bug.unassigned: no new assignee, not a status change — no recipient
    -- is defined for it in this story (see header).
    v_recipients := array[]::uuid[];
    v_payload := '{}'::jsonb;
  end if;

  foreach v_recipient in array v_recipients
  loop
    insert into public.notifications (
      workspace_id, recipient_user_id, event_type, entity_type, entity_id, payload, source_event_id
    )
    values (
      new.workspace_id, v_recipient, new.action, 'bug', new.entity_id, v_payload, new.id
    )
    on conflict (source_event_id, recipient_user_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists activity_log_notify_bug_event on public.activity_log;
create trigger activity_log_notify_bug_event
  after insert on public.activity_log
  for each row
  when (
    new.entity_type = 'bug'
    and new.action in ('bug.assigned', 'bug.reassigned', 'bug.unassigned', 'bug.status_changed')
  )
  execute function public.bunkai_notify_bug_event();
