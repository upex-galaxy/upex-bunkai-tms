-- 0132_workspace_bugs_index.sql — BK-555: the workspace-wide Bug Reports index.
--
-- WHAT
-- ----
-- One read function, `bunkai_list_workspace_bugs`. It returns one page of a
-- workspace's defects across every Project, most severe first and then most
-- recently filed, keyset paginated on (severity asc, created_at desc, id desc),
-- plus severity and status counts over the WHOLE filtered set. Filters
-- AND-compose: one Project, statuses (OR within), severities (OR within).
--
-- WHY A NEW FUNCTION (AI Tech Lead ruling on BK-555, 2026-08-19)
-- -------------------------------------------------------------
-- `bunkai_list_bugs` (0051, last redefined in 0054) pins `p_project_id` as a
-- required first parameter and its grant names that exact signature. Widening
-- it would mint a second overload on the function BK-41 depends on. This is an
-- additive sibling instead: `bunkai_list_bugs` is not touched. The predicates
-- that matter are carried over from 0054 verbatim, not re-derived:
--   * archived-module exclusion (0051 Decision 12): a defect whose OWN module
--     is archived is not listed and not counted, so this index is never a back
--     door to what the Project list hides;
--   * aggregates over the full filtered set, never the page;
--   * the (severity, created_at, id) keyset and the 45308 partial-cursor guard.
--
-- WHY SECURITY INVOKER (ADR-0012)
-- -------------------------------
-- ADR-0012's first question is whether the identity parameter can be deleted
-- instead of guarded. It can: there is no `p_actor_user_id`. Every table read
-- runs under the CALLER's RLS (`bugs_select_workspace_member` in 0046,
-- `modules` and `projects` policies), so a forged or foreign `p_workspace_id`
-- selects nothing. `p_workspace_id` is a scope, not an authorization: it pins
-- every row to the active workspace, so a caller who belongs to two
-- workspaces never sees the other one's defects here (AC-20).
--
-- It writes nothing (`stable`). Grants: revoked from public and anon, granted
-- to authenticated and service_role. The 0085 default privileges also give
-- EXECUTE to the QA inspector roles, the same basis `bunkai_list_bugs` holds
-- live; safe for an INVOKER function, which runs with the caller's own table
-- grants, so `qa_inspector_ro` reads only what it can already SELECT.
--
-- NO NEW INDEX
-- ------------
-- The aggregates must read the whole filtered set anyway, so the read is
-- bounded by the workspace's defect count, and `bugs_workspace_id_idx` (0046)
-- serves the workspace predicate.
--
-- Additive only, re-runnable: `create or replace function`, grants re-asserted.

create or replace function public.bunkai_list_workspace_bugs(
  p_workspace_id      uuid,
  p_project_id        uuid default null,
  p_statuses          text[] default null,
  p_severities        text[] default null,
  p_limit             int default 50,
  p_cursor_severity   text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit        int;
  v_cursor_parts int;
  v_items        jsonb;
  v_fetched      int;
  v_aggregates   jsonb;
  v_next_cursor  jsonb;
  v_last         jsonb;
begin
  -- Page size: clamp into 1..50, never unbounded. The API refuses an
  -- out-of-range limit before it gets here; the clamp is for direct callers.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  -- The keyset position is a TRIPLE: zero parts = first page, anything other
  -- than zero or three is not a position (same guard and code as 0051).
  v_cursor_parts := (case when p_cursor_severity is not null then 1 else 0 end)
    + (case when p_cursor_created_at is not null then 1 else 0 end)
    + (case when p_cursor_id is not null then 1 else 0 end);
  if v_cursor_parts not in (0, 3) then
    raise exception 'bugs_list_cursor_invalid' using errcode = '45308';
  end if;

  -- Full filtered set -> one keyset page (limit + 1 probe) -> aggregates over
  -- the FULL filtered set, in one statement so the two cannot drift apart.
  with filtered as (
    select b.id, b.workspace_id, b.project_id, b.module_id, b.run_id,
           b.title, b.severity, b.status, b.assignee_user_id, b.created_at,
           m.name as module_name, m.path as module_path
      from public.bugs b
      join public.modules m on m.id = b.module_id
      where b.workspace_id = p_workspace_id
        and m.archived_at is null
        and (p_project_id is null or b.project_id = p_project_id)
        and (p_statuses is null or b.status = any(p_statuses))
        and (p_severities is null or b.severity = any(p_severities))
  ),
  page as (
    select *
      from filtered
      where (
        v_cursor_parts = 0
        or severity > p_cursor_severity
        or (severity = p_cursor_severity and created_at < p_cursor_created_at)
        or (severity = p_cursor_severity and created_at = p_cursor_created_at and id < p_cursor_id)
      )
      order by severity asc, created_at desc, id desc
      limit v_limit + 1
  ),
  kept as (
    select * from page order by severity asc, created_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'workspace_id', k.workspace_id,
                 'project_id', k.project_id,
                 'project_slug', p.slug,
                 'project_name', p.name,
                 'module', jsonb_build_object('id', k.module_id, 'name', k.module_name, 'path', k.module_path),
                 'run_id', k.run_id,
                 'title', k.title,
                 'severity', k.severity,
                 'status', k.status,
                 'assignee_user_id', k.assignee_user_id,
                 'created_at', k.created_at
               ) order by k.severity asc, k.created_at desc, k.id desc)
        from kept k
        left join public.projects p on p.id = k.project_id
    ), '[]'::jsonb),
    (select count(*) from page),
    (select jsonb_build_object(
       'by_severity', jsonb_build_object(
         'P1', count(*) filter (where severity = 'P1'),
         'P2', count(*) filter (where severity = 'P2'),
         'P3', count(*) filter (where severity = 'P3'),
         'P4', count(*) filter (where severity = 'P4')
       ),
       'by_status', jsonb_build_object(
         'open', count(*) filter (where status = 'open'),
         'in_progress', count(*) filter (where status = 'in_progress'),
         'resolved', count(*) filter (where status = 'resolved'),
         'closed', count(*) filter (where status = 'closed')
       )
     ) from filtered)
    into v_items, v_fetched, v_aggregates;

  -- next_cursor: NULL when the probe row was absent (no further page).
  -- Otherwise the (severity, created_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'severity', v_last -> 'severity',
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object('data', v_items, 'aggregates', v_aggregates, 'next_cursor', v_next_cursor);
end;
$$;

revoke execute on function public.bunkai_list_workspace_bugs(
  uuid, uuid, text[], text[], int, text, timestamptz, uuid
) from public, anon;
grant execute on function public.bunkai_list_workspace_bugs(
  uuid, uuid, text[], text[], int, text, timestamptz, uuid
) to authenticated, service_role;

-- Verification (run after apply):
--   select has_function_privilege('anon', 'public.bunkai_list_workspace_bugs(uuid,uuid,text[],text[],int,text,timestamptz,uuid)', 'EXECUTE'); -- false
--   select has_function_privilege('authenticated', 'public.bunkai_list_workspace_bugs(uuid,uuid,text[],text[],int,text,timestamptz,uuid)', 'EXECUTE'); -- true
