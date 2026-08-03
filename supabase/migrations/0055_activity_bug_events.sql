-- Migration: 0055 — BK-264 Slice 4: Activity Feed — Bug-triage event payload
-- Authored: 2026-08-03
--
-- Migration 0054 (Slice 1) already writes activity_log rows for the 4 new
-- Bug-triage events (bug.assigned / bug.reassigned / bug.unassigned /
-- bug.status_changed), and Slice 4's TypeScript layer (lib/activity/
-- constants.ts's ACTIVITY_ALLOWED_ACTIONS, lib/activity/labels.ts's
-- resolveActionLabel) now renders them. But bunkai_list_activity
-- (0045_activity_stream.sql) is what actually hands a row's `payload` to the
-- API in the first place, via a POSITIVE per-action `case` projection
-- (Decision 3 / Risk R3 — never `select payload` raw). That `case` has no
-- branch for any of the 4 new actions, so every one of them falls to the
-- `else '{}'::jsonb` arm — an EMPTY payload, silently stripping
-- `assignee_user_id` / `previous_status` / `status` before they ever reach
-- the API route. Without this fix, `resolveActionLabel` always sees an empty
-- payload and falls back to "a workspace member" / "an unknown status" —
-- never the AC's literal wording ("assigned this defect to Sara Iglesias",
-- "moved this defect to in progress"). This is therefore a required part of
-- Slice 4, not an optional follow-up: the rendering layer cannot render what
-- the read RPC never hands it.
--
-- `create or replace function` (append-only, same signature — mirrors 0039's
-- precedent of amending 0038's function later, and 0054's own amendment of
-- 0046's trigger). Two changes only:
--   1. v_actions' direct-caller backstop default array (constants.ts's own
--      comment: "Kept in sync BY HAND with that SQL literal") gains the 4 new
--      actions — the API route already passes p_actions explicitly so this
--      is belt-and-suspenders, not the enforcement point.
--   2. The per-row `case (k.action)` projection gains 4 branches, each
--      projecting EXACTLY the fields 0054 writes for that action (never more):
--        bug.assigned / bug.reassigned / bug.unassigned:
--          previous_assignee_user_id, assignee_user_id
--        bug.status_changed:
--          previous_status, status, assignee_user_id
--      No free-text field exists in any of these payloads (unlike
--      run.aborted's `reason`), so there is no Risk-R3-shaped leak to guard
--      against here — every projected value is either a uuid already
--      resolved elsewhere in this same response (actor_user_id) or a
--      closed-set status enum.

create or replace function public.bunkai_list_activity(
  p_workspace_id      uuid,
  p_limit             int default 30,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null,
  p_actions           text[] default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit       int;
  v_actions     text[];
  v_items       jsonb;
  v_fetched     int;
  v_next_cursor jsonb;
  v_last        jsonb;
begin
  -- 1. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  -- 2. Allowlist backstop: the route always passes it explicitly (Decision 2);
  --    a direct/PAT caller that omits it gets the same MVP set, not "all".
  v_actions := coalesce(
    p_actions,
    array[
      'module.renamed', 'module.description_updated', 'module.moved', 'module.archived',
      'atc.created', 'test.created', 'run.finished', 'run.aborted',
      'bug.assigned', 'bug.reassigned', 'bug.unassigned', 'bug.status_changed'
    ]::text[]
  );

  -- 3. Cursor backstop: the keyset position is a PAIR. Exactly one half is not
  --    a position — raise rather than silently degrade to the first page.
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'activity_cursor_invalid' using errcode = '45214';
  end if;

  -- 4-5. One keyset page (limit+1 probe) + per-row positive projection.
  with page as (
    select a.id, a.entity_type, a.entity_id, a.action, a.actor_user_id, a.created_at, a.payload
      from public.activity_log a
      where a.workspace_id = p_workspace_id
        and a.action = any(v_actions)
        and (
          p_cursor_created_at is null
          or p_cursor_id is null
          or (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id)
        )
      order by a.created_at desc, a.id desc
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
                 'entity_type', k.entity_type,
                 'entity_id', k.entity_id,
                 'action', k.action,
                 'actor_user_id', k.actor_user_id,
                 'created_at', k.created_at,
                 'payload', case (k.action)
                   when 'module.renamed' then
                     jsonb_build_object('name', k.payload -> 'name', 'new_path', k.payload -> 'new_path')
                   when 'module.description_updated' then
                     -- source payload is always {} (0023) — no content leak.
                     '{}'::jsonb
                   when 'module.moved' then
                     jsonb_build_object('new_path', k.payload -> 'new_path')
                   when 'module.archived' then
                     jsonb_build_object(
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'atc.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'test.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'run.finished' then
                     jsonb_build_object('verdict', k.payload -> 'verdict', 'skipped_steps', k.payload -> 'skipped_steps')
                   when 'run.aborted' then
                     -- reason is DELIBERATELY excluded (Decision 3, Risk R3) —
                     -- free-text, unredacted operator input never leaves the
                     -- DB via this feed. Only skipped_steps is projected.
                     jsonb_build_object('skipped_steps', k.payload -> 'skipped_steps')
                   when 'bug.assigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.reassigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.unassigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.status_changed' then
                     jsonb_build_object(
                       'previous_status', k.payload -> 'previous_status',
                       'status', k.payload -> 'status',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   else '{}'::jsonb
                 end
               ) order by k.created_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- 6. next_cursor: NULL when the probe row was absent (no further page).
  --    Otherwise the (created_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next_cursor);
end;
$$;

revoke execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) from public, anon;
grant execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) to authenticated, service_role;
