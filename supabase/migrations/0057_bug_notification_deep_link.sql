-- Migration: 0057 — BK-212 Slice 2: Notifications | bug assignment + status
-- change UI (entity_available + deep-link context)
-- Authored: 2026-08-03
--
-- Closes the two gaps Slice 1 (0056_bug_event_notifications.sql) left for the
-- UI layer, both flagged in that migration's own header as this slice's job:
--   1. `bunkai_list_notifications`'s `entity_available` CASE (0053) always
--      resolved `false` for `entity_type = 'bug'` — "no [bugId] detail route
--      exists yet (Dev Answer's own caveat, blocked on BK-31/BK-212)". BK-212
--      is this story, and a bug now has an addressable deep link (see 2
--      below), so a bug row must resolve availability the SAME way `run`/
--      `test` already do: does the row still exist and is it still
--      RLS-visible to the caller.
--   2. `bunkai_notify_bug_event`'s payload (0056) snapshotted `title` +
--      `project_slug` but never `run_id` — 0056's own header anticipated
--      exactly this: "`project_slug` specifically matches the wire contract
--      `lib/notifications/entity-routes.ts` already documents... populating
--      it now means a future Slice 2 UI change can add a `bug` case to that
--      resolver's switch without ANOTHER migration to backfill the field."
--      That reasoning covered `project_slug`; it missed `run_id`, which the
--      href resolver also needs (scope.md: "Deep link lands on the bug with
--      its attached test and run context" — the run-detail page,
--      `/projects/{slug}/runs/{run_id}`, IS that context; there is no
--      separate bug-detail page, see entity-routes.ts's updated header).
--      `bugs.run_id` is nullable (0046_bugs.sql: a standalone bug carries no
--      run) — snapshotting it as `null` for a standalone bug is correct and
--      expected, not a bug in this producer; the href resolver treats a
--      missing `run_id` as "no route" rather than guessing one (no AC/
--      business-rule defines a standalone-bug destination).
--
-- Both functions are `create or replace` — Postgres has no "ALTER FUNCTION
-- body" primitive, so evolving either one always means restating the WHOLE
-- body. This mirrors how this codebase already evolves composer functions
-- across migrations (bunkai_run_json restated across 0031/0036/0037/0040/
-- 0042) — a NEW migration re-declaring the function, never an edit to the
-- already-applied 0053/0056 files, per the ledger convention (README.md:
-- "Amend-in-place iterations must not mint new ledger rows... while a
-- migration is in flight" — 0053/0056 are NOT in flight, they are merged).
--
-- entity_available for 'bug': `exists (select 1 from public.bugs b where
-- b.id = k.entity_id)`, scoped by `bugs_select_workspace_member`
-- (0046_bugs.sql: `bunkai_is_workspace_member(workspace_id)`) — identical
-- shape to the existing `run`/`test` arms, and identical reasoning
-- (`bunkai_list_notifications` stays SECURITY INVOKER, so this EXISTS probe
-- runs under the CALLING role: a bug that is deleted, or whose project the
-- caller has lost access to, resolves `false` for free, exactly like run/
-- test). No new SQLSTATE, no new authorization surface — a pure read-only
-- addition to an existing per-row CASE.

create or replace function public.bunkai_list_notifications(
  p_workspace_id      uuid,
  p_limit             int default 30,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit       int;
  v_items       jsonb;
  v_fetched     int;
  v_unread      int;
  v_next_cursor jsonb;
  v_last        jsonb;
begin
  -- 1. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  -- 2. Cursor backstop: the keyset position is a PAIR. Exactly one half is
  --    not a position — raise rather than silently degrade to the first page.
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'notification_cursor_invalid' using errcode = '45400';
  end if;

  -- 3-4. One keyset page (limit+1 probe) + per-row entity availability.
  with page as (
    select n.id, n.workspace_id, n.event_type, n.entity_type, n.entity_id,
           n.payload, n.read_at, n.created_at
      from public.notifications n
      where n.workspace_id = p_workspace_id
        and (
          p_cursor_created_at is null
          or p_cursor_id is null
          or (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
        )
      order by n.created_at desc, n.id desc
      limit v_limit + 1
  ),
  kept as (
    select * from page order by created_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'workspace_id', k.workspace_id,
                 'event_type', k.event_type,
                 'entity_type', k.entity_type,
                 'entity_id', k.entity_id,
                 'payload', k.payload,
                 'read_at', k.read_at,
                 'created_at', k.created_at,
                 'entity_available', case k.entity_type
                   when 'run' then exists (select 1 from public.runs r where r.id = k.entity_id)
                   when 'test' then exists (select 1 from public.tests t where t.id = k.entity_id)
                   -- BK-212 Slice 2: a bug now has an addressable deep link
                   -- (entity-routes.ts's `bug` case, below `run_id` in
                   -- payload) — resolves the same way run/test do, RLS-scoped
                   -- for free via bugs_select_workspace_member.
                   when 'bug' then exists (select 1 from public.bugs b where b.id = k.entity_id)
                   else false
                 end
               ) order by k.created_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- next_cursor: NULL when the probe row was absent (no further page).
  -- Otherwise the (created_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  -- 5. unread_count: RLS-scoped the same way the list page is (recipient +
  --    membership + retention), independent of pagination.
  select count(*) into v_unread
    from public.notifications n
    where n.workspace_id = p_workspace_id
      and n.read_at is null;

  return jsonb_build_object('items', v_items, 'unread_count', v_unread, 'next_cursor', v_next_cursor);
end;
$$;

revoke execute on function public.bunkai_list_notifications(uuid, int, timestamptz, uuid) from public, anon;
grant execute on function public.bunkai_list_notifications(uuid, int, timestamptz, uuid) to authenticated, service_role;

-- ============================================================================
-- bunkai_notify_bug_event — restated to add `run_id` to both payload shapes
-- ============================================================================
--
-- Everything else (recipient rules, idempotency, SECURITY DEFINER rationale,
-- the deliberate `bug.unassigned` no-op) is UNCHANGED from 0056 — see that
-- migration's header for the full authorization walkthrough, which still
-- applies verbatim. The only diff below is:
--   * the snapshot query now also selects `b.run_id`
--   * both payload branches now include `'run_id', b.run_id` (null for a
--     standalone bug — expected, see this file's own header above)

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
