-- Migration: 0053 — Notifications inbox: schema + RLS + list RPC
-- (BK-209 Slice 1/3: DB layer only — see implementation plan,
-- .context/PBI/epics/EPIC-BK-208-notifications-center/stories/
-- STORY-BK-209-notifications-view-an-inbox-of-workspace-events/comments.md,
-- "Spec Implementation Plan (Dev)", Implementation Steps 1-2)
--
-- Dedicated per-recipient notification storage (Dev Answer, comments.md
-- 2026-07-16: "activity_log should not be the only source... does not model
-- personal delivery, read/unread state, retention visibility, or
-- per-recipient copies cleanly"). A `payload jsonb` snapshot is captured at
-- write time (by a future producer DEFINER function or the Step 3 test
-- factory, neither of which lands in this slice) so the inbox never has to
-- join live runs/tests/bugs to render a summary — that snapshot survives
-- entity deletion by construction (mirrors runs snapshotting run_atcs/
-- run_steps).
--
-- Authorization model (ADR-0012 / rpc-authorization.md six-question
-- checklist, answered in the implementation plan's Technical Decision 1):
--   1. Needs DEFINER? No — every query is naturally scoped to
--      recipient_user_id = auth.uid() via RLS; the one DEFINER precedent in
--      this codebase (bunkai_resolve_activity_actors, ADR-0011) exists only
--      because auth.users isn't PostgREST-exposed, which this story never
--      reads.
--   2. Identity parameter removable? There is none — p_workspace_id is a
--      plain filter, auth.uid() (via RLS) is the only identity anywhere.
--   3. Actor bind at step 0? N/A, no actor param.
--   4. Which returned rows cross a tenant boundary? None — RLS's
--      notifications_select_recipient_member_retained constrains every row
--      independently to (recipient_user_id = auth.uid() AND
--      bunkai_is_workspace_member(workspace_id) AND 90-day retention), not
--      merely asserted once.
--   5. Same error as not-found? N/A for the read path — a foreign/nonexistent
--      workspace_id simply RLS-filters to zero rows, matching
--      bunkai_list_activity's own non-disclosure posture (no raise at all).
--   6. Which test proves it against the real DB?
--      lib/notifications/list-notifications-isolation.test.ts (this slice).
--
-- bunkai_list_notifications is therefore SECURITY INVOKER (the clause is
-- simply omitted — plpgsql defaults to INVOKER), modeled directly on
-- bunkai_list_activity (0045_activity_stream.sql): no actor param, no in-band
-- membership assert, RLS does the entire job.
--
-- Mutations (mark-one-read, mark-all-read) are OUT OF SCOPE for this slice —
-- they are plain RLS-scoped PostgREST updates through ctx.db, no RPC, built
-- in Slice 2 (API layer). This migration ships only the UPDATE policy they
-- will rely on.
--
-- Realtime: enables replication per ADR-0010, which explicitly names "BK-209's
-- workspace-event inbox" as a reuse case of the mechanism established in
-- 0043_run_realtime_replication.sql. RLS gates postgres_changes subscriptions
-- the same way it gates SELECT (Realtime Authorization) — no extra policy
-- needed beyond the SELECT policy below.
--
-- Custom SQLSTATE (class 45xxx; highest allocated block so far is 45300-45308,
-- the bugs domain, per 0046_bugs.sql/0051_bugs_list.sql — this migration opens
-- a new 454xx slot for the notifications domain):
--   45400  notification_cursor_invalid  (exactly one cursor half supplied)

-- ============================================================================
-- 1. notifications
-- ============================================================================

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  recipient_user_id   uuid not null references auth.users(id) on delete cascade,
  event_type          text not null,
  entity_type         text not null,
  -- Deliberately NO foreign key (implementation plan Technical Decision 2):
  -- AC5 requires a deleted entity's row to SURVIVE with a fallback ("This
  -- item is no longer available"); an FK with cascade would delete it, the
  -- opposite of AC5. entity_id is also polymorphic across run/test/(future
  -- bug), so a single-table FK can't express it anyway. Availability is
  -- computed at READ time instead (bunkai_list_notifications' per-row
  -- entity_available), which also correctly handles "exists but no longer
  -- RLS-visible", not just "deleted".
  entity_id           uuid null,
  payload             jsonb not null default '{}'::jsonb,
  -- NULL = unread (mirrors runs.started_at/finished_at's nullable-timestamp
  -- pattern, not a boolean) — set once, on mark-one/mark-all-read (Slice 2).
  read_at             timestamptz null,
  created_at          timestamptz not null default now()
);

-- Listing access path: keyset seek on (recipient, workspace, created_at desc,
-- id desc) — the tie-break column the seek predicate needs, same shape as
-- activity_log_workspace_created_at_id_idx (0045_activity_stream.sql).
create index if not exists notifications_recipient_workspace_created_at_id_idx
  on public.notifications (recipient_user_id, workspace_id, created_at desc, id desc);

-- Badge/mark-all access path: equality-only partial index over unread rows,
-- scoped the same way the SELECT/UPDATE RLS policies are (recipient +
-- workspace), so the unread-count probe and the future mark-all-read update
-- (Slice 2) both hit this index instead of a full scan.
create index if not exists notifications_recipient_workspace_unread_idx
  on public.notifications (recipient_user_id, workspace_id)
  where read_at is null;

alter table public.notifications enable row level security;

-- SELECT: one policy structurally satisfies all three ratified business rules
-- at once (business-rules.md) — personal-copy (recipient_user_id = auth.uid()),
-- access-loss hides rows (bunkai_is_workspace_member), and 90-day retention
-- (PO Answer, comments.md 2026-07-16: "Day 90 remains visible; day 91 is
-- outside retention... the UI/API visibility must apply the 90-day filter").
drop policy if exists notifications_select_recipient_member_retained on public.notifications;
create policy notifications_select_recipient_member_retained
  on public.notifications
  for select
  using (
    recipient_user_id = auth.uid()
    and public.bunkai_is_workspace_member(workspace_id)
    and created_at >= now() - interval '90 days'
  );

-- UPDATE: same personal-copy + membership guard, WITHOUT the retention
-- clause (implementation plan Step 1) — a notification does not need to stay
-- inside the 90-day visibility window to be legitimately mark-read by its own
-- recipient; retention is a read-visibility rule, not a mutation-eligibility
-- rule. Consumed by Slice 2's plain `ctx.db.from('notifications').update(...)`
-- mark-one/mark-all routes — no RPC, no SECURITY DEFINER (ADR-0001 Path B).
drop policy if exists notifications_update_recipient_member on public.notifications;
create policy notifications_update_recipient_member
  on public.notifications
  for update
  using (
    recipient_user_id = auth.uid()
    and public.bunkai_is_workspace_member(workspace_id)
  )
  with check (
    recipient_user_id = auth.uid()
    and public.bunkai_is_workspace_member(workspace_id)
  );

-- No INSERT policy for authenticated clients at all — mirrors activity_log's
-- posture (0009_cross_cutting.sql: "No insert/update/delete policies for
-- clients"). Rows arrive only via a future producer SECURITY DEFINER function
-- (BK-211/212/213/214, none of which land in this slice) or, in tests, the
-- service-role-only test factory (Step 3, next slice) — sanctioned per
-- rpc-authorization.md §5 ("service-role in tests for fixture seed... obtains
-- no session").
--
-- No DELETE policy — the scheduled 90-day purge job is explicitly out of
-- scope for this story (Dev Answer, comments.md: "query-time filtering...
-- is what carries correctness, and the purge is explicitly allowed to run
-- asynchronously"); when built, it runs as a service-role job that bypasses
-- RLS entirely, so no client-facing DELETE policy is needed now or later.

-- Realtime replication (ADR-0010), so a future client subscription (Step 9,
-- out of this slice's scope) can push new/updated rows to the recipient
-- without a manual refresh. RLS enforces the subscriber's own visibility the
-- same way it gates SELECT (see 0043_run_realtime_replication.sql's own
-- comment on Realtime Authorization) — no additional policy needed here.
alter publication supabase_realtime add table public.notifications;

-- ============================================================================
-- 2. bunkai_list_notifications — keyset-paged inbox list + unread count
-- ============================================================================
--
-- SECURITY INVOKER (the clause is simply omitted — plpgsql defaults to
-- INVOKER). This is the load-bearing security property: the SELECT runs
-- under the CALLING role, so notifications_select_recipient_member_retained
-- evaluates against the caller's own auth.uid() on every call path — a
-- non-member, a foreign recipient, or a row outside the 90-day retention
-- window all silently disappear via RLS, never via an in-function check.
-- p_workspace_id is a plain filter, NOT a trust boundary (implementation
-- plan, Technical Decision 1) — RLS enforces recipient_user_id + membership
-- regardless of what this parameter is set to.
--
-- entity_available is computed per row via a CASE over entity_type, joining
-- (via EXISTS, not a LEFT JOIN column so the shape stays a scalar per row)
-- the live runs/tests tables. Being INVOKER, those EXISTS probes are
-- themselves RLS-scoped by runs_select_workspace_member /
-- tests_select_workspace_member (0031_runs.sql / 0024_tests.sql) — so an
-- entity that still exists but is no longer visible to the caller (e.g. a
-- workspace/project access change) also resolves to `false`, for free,
-- exactly like a deleted one. `bug` always resolves `false` regardless of the
-- underlying row's existence — no [bugId] detail route exists yet (Dev
-- Answer's own caveat, blocked on BK-31/BK-212) — matching
-- lib/notifications/entity-routes.ts's Slice 3 design of leaving `bug`
-- deliberately unmapped. Any other/future entity_type also falls into the
-- `else false` arm until a sibling story adds its own WHEN.
--
-- Validation order (mirrors bunkai_list_activity's shape):
--   1. Clamp p_limit into 1..50, default 30.
--   2. Cursor backstop: both halves NULL = first page; exactly one supplied
--      is rejected (45400), never silently degraded to page 1.
--   3. One keyset page (limit+1 probe) on workspace_id = p_workspace_id AND
--      (created_at, id) < (cursor), newest first — RLS applies the
--      recipient/membership/retention scoping transparently.
--   4. next_cursor: same probe-based shape as 0045.
--   5. unread_count: a second RLS-scoped count (read_at is null), using the
--      same partial index the future mark-all-read route will use.

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
