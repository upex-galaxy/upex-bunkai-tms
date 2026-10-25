-- Migration: 0101 — activity feed surfaces atc.updated with affected Tests (BK-268)
--
-- create or replace of bunkai_list_activity (same signature; full body copied
-- forward from 0083, append-only precedent). Changes:
--   1. 'atc.updated' joins the direct-caller backstop default allowlist
--      (kept in sync BY HAND with lib/activity/constants.ts).
--   2. Per-row projection gains an 'atc.updated' branch: title,
--      affected_test_count and up to 3 resolved Test titles (RLS-scoped).
-- Additive and idempotent.

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
      'bug.assigned', 'bug.reassigned', 'bug.unassigned', 'bug.status_changed',
      'export.requested', 'export.downloaded',
      'atc.updated'
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
                   when 'atc.updated' then
                     -- BK-268: positive projection. Only the title, the TRUE
                     -- affected count and up to 3 Test titles ever leave the
                     -- DB. Titles resolve under the CALLER's RLS (function is
                     -- SECURITY INVOKER; tests_select_workspace_member), so a
                     -- Test the caller cannot see (or that was deleted after
                     -- the edit) simply does not resolve and folds into the
                     -- count remainder.
                     jsonb_build_object(
                       'title', k.payload -> 'title',
                       'affected_test_count',
                         case when jsonb_typeof(k.payload -> 'affected_test_ids') = 'array'
                              then jsonb_array_length(k.payload -> 'affected_test_ids') else 0 end,
                       'affected_tests', coalesce((
                         select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title) order by r.title, r.id)
                           from (
                             select t.id, t.title
                               from public.tests t
                              where t.workspace_id = p_workspace_id
                                and jsonb_typeof(k.payload -> 'affected_test_ids') = 'array'
                                and t.id in (
                                  select e.value::uuid
                                    from jsonb_array_elements_text(k.payload -> 'affected_test_ids') e
                                )
                              order by t.title, t.id
                              limit 3
                           ) r
                       ), '[]'::jsonb)
                     )
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
                   when 'export.requested' then
                     '{}'::jsonb
                   when 'export.downloaded' then
                     '{}'::jsonb
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
