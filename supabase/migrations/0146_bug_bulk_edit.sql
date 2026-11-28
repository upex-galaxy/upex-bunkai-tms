-- =============================================================================
-- 0146_bug_bulk_edit
-- BK-2098 : bulk-edit status or severity on up to 200 Bugs of one Project.
-- =============================================================================
--
-- WHY. The single-Bug status route advances one Bug per call and the severity
-- correction route corrects one Bug per call. A triage pass over many defects
-- needs one confirmed action with one outcome per Bug, which a loop of the
-- single-Bug functions cannot report. Contract: the AI Product Owner (P1 to P10)
-- and AI Tech Lead (T1 to T6) rulings on BK-2098, mirroring ADR-0027. Record:
-- ADR-0029.
--
-- WHAT.
--   1. bunkai_list_bugs: body copied forward from 0054 plus content_version in
--      every row (T6), so the list can send the version the user saw. Same
--      signature, same SECURITY INVOKER, same grants.
--   2. bunkai_bulk_edit_bugs: ONE new function. Nothing else is redefined.
--
--   * ONE field per call: status or severity.
--   * Status: per Bug, the requested stage already held is unchanged, the next
--     stage changes, anything further ahead is refused status_transition_skipped
--     and anything behind is refused status_transition_backward (P2). The sent
--     version is ignored for status (AC10).
--   * Severity: any of P1 to P4. Equal is unchanged and is evaluated BEFORE the
--     stale check (AC09); a sent version that differs from content_version is
--     refused stale_version (P5); no version skips the check (AC10).
--   * Per-Bug subtransaction: one Bug failing rolls back that Bug's write and
--     its event, never the others (T2). 42501 and 45701 are re-raised, never
--     turned into write_failed: they abort the whole call.
--   * Bugs are locked FOR NO KEY UPDATE one at a time in id order; no member row
--     is locked. After each lock the write gate is re-checked (T2).
--   * A duplicate id is evaluated once with the lowest version sent (AC14).
--   * p_dry_run evaluates with no lock, write or event. It runs the read-only
--     check itself, because the project write trigger never fires (T4).
--   * Status writes bug.status_changed with the single-Bug payload plus
--     bulk: true, so the notification trigger notifies exactly as a single
--     change does (P4). Severity bumps content_version and writes bug.corrected
--     with title, changes.severity and bulk: true, which notifies nobody (T3).
--
-- AUTHORIZATION (ADR-0012, rpc-authorization.md section 4).
--   1. SECURITY DEFINER with p_actor_user_id: the route uses the admin client
--      and PAT callers have no auth.uid() (T1).
--   2. Actor bind at step 0, before any table read. A spoofed actor gets the
--      same P0002 as an unknown project.
--   3. Gate order (T4): unknown project, deleted workspace or no active
--      membership is P0002; a viewer is 42501; a read-only project is 45701.
--      The route binds a workspace-scoped token to the project's workspace
--      before calling (403 token_workspace_mismatch).
--   4. Every Bug read or written is constrained to p_project_id, so a Bug of
--      another Project or workspace is not_found exactly like a missing id (P6).
--   5. Execute for service_role only; both QA inspector roles revoked explicitly
--      (0085 default privileges, 0086 rule).
--
-- Request-level errors (nothing is written):
--   45319 bug_bulk_selection_invalid  not an array, empty, over 200 items, or an
--                                     item without a valid id or version
--   45320 bug_bulk_change_invalid     unknown field, a change object with other
--                                     keys, or a value outside the vocabulary
--
-- Failpoints use the ADR-0022 table (0114). bug_bulk_edit.before_event, with an
-- optional ":<bug id>" suffix, fails one Bug's event (write_failed);
-- bug_bulk_edit.forbidden:<bug id> raises 42501 after that Bug's write, so a test
-- can prove a lost write gate aborts the whole call.
--
-- Additive and idempotent: no column, no row rewritten.
-- =============================================================================

-- ============================================================================
-- 1. bunkai_list_bugs: 0054's body plus content_version
-- ============================================================================

create or replace function public.bunkai_list_bugs(
  p_project_id        uuid,
  p_module_id         uuid default null,
  p_statuses          text[] default null,
  p_severities        text[] default null,
  p_limit             int default 30,
  p_cursor_severity   text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit        int;
  v_module_path  text;
  v_cursor_parts int;
  v_items        jsonb;
  v_fetched      int;
  v_aggregates   jsonb;
  v_next_cursor  jsonb;
  v_last         jsonb;
begin
  -- 1. Page size: clamp into 1..50, never unbounded (mirrors bunkai_list_activity;
  --    Decision 4's wire contract, honored here at the decoded-params layer).
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  -- 2. Cursor backstop: the keyset position is a TRIPLE. Zero supplied = first
  --    page; anything other than exactly zero or exactly three is not a
  --    position — raise rather than silently degrade to the first page
  --    (mirrors 0045's activity_cursor_invalid, 45214).
  v_cursor_parts := (case when p_cursor_severity is not null then 1 else 0 end)
    + (case when p_cursor_created_at is not null then 1 else 0 end)
    + (case when p_cursor_id is not null then 1 else 0 end);
  if v_cursor_parts not in (0, 3) then
    raise exception 'bugs_list_cursor_invalid' using errcode = '45308';
  end if;

  -- 3. Resolve the module subtree filter (when provided) to a path prefix,
  --    scoped to THIS project — a p_module_id belonging to another project
  --    (or that does not exist) leaves v_module_path null, which the
  --    predicate below turns into zero rows rather than a disclosed error.
  --    Not filtered on archived_at here on purpose — an archived ANCESTOR
  --    must not prune its still-active descendants out of the subtree; the
  --    per-row archived exclusion below (Decision 12) is scoped to each
  --    bug's OWN module only.
  if p_module_id is not null then
    select m.path into v_module_path
      from public.modules m
      where m.id = p_module_id and m.project_id = p_project_id;
  end if;

  -- 4-6. Full filtered set (no limit, no cursor) -> one keyset page (limit+1
  --      probe) -> aggregates computed over the FULL filtered set, all in one
  --      query so the aggregates and the page can never drift apart.
  with filtered as (
    select b.id, b.workspace_id, b.project_id, b.module_id, b.run_id,
           b.run_step_id, b.atc_id, b.title, b.severity, b.status,
           b.description, b.steps_to_reproduce, b.evidence_urls,
           b.assignee_user_id, b.content_version, b.created_by, b.created_at, b.updated_at,
           m.id as module_row_id, m.name as module_name, m.path as module_path
      from public.bugs b
      join public.modules m on m.id = b.module_id
      where b.project_id = p_project_id
        and m.archived_at is null
        and (
          p_module_id is null
          or (
            v_module_path is not null
            and (m.path = v_module_path or m.path like v_module_path || '/%')
          )
        )
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
                 'module_id', k.module_id,
                 'module', jsonb_build_object('id', k.module_row_id, 'name', k.module_name, 'path', k.module_path),
                 'run_id', k.run_id,
                 'run_step_id', k.run_step_id,
                 'atc_id', k.atc_id,
                 'title', k.title,
                 'severity', k.severity,
                 'status', k.status,
                 'description', k.description,
                 'steps_to_reproduce', k.steps_to_reproduce,
                 'evidence_urls', to_jsonb(k.evidence_urls),
                 'assignee_user_id', k.assignee_user_id,
                 'content_version', k.content_version,
                 'created_by', k.created_by,
                 'created_at', k.created_at,
                 'updated_at', k.updated_at
               ) order by k.severity asc, k.created_at desc, k.id desc)
        from kept k), '[]'::jsonb),
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

  -- 7. next_cursor: NULL when the probe row was absent (no further page).
  --    Otherwise the (severity, created_at, id) of the LAST row actually
  --    returned (mirrors 0045's own probe-based next_cursor shape).
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

revoke execute on function public.bunkai_list_bugs(uuid, uuid, text[], text[], int, text, timestamptz, uuid) from public, anon;
grant execute on function public.bunkai_list_bugs(uuid, uuid, text[], text[], int, text, timestamptz, uuid) to authenticated, service_role;

-- ============================================================================
-- 2. bunkai_bulk_edit_bugs
-- ============================================================================

create or replace function public.bunkai_bulk_edit_bugs(
  p_actor_user_id uuid,
  p_project_id    uuid,
  p_items         jsonb,
  p_field         text,
  p_change        jsonb,
  p_dry_run       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_ceiling      constant int := 200;
  v_workspace_id uuid;
  v_role         text;
  v_target       text;
  v_target_rank  int;
  v_row          record;
  v_bug          record;
  v_old_rank     int;
  v_outcome      text;
  v_reason       text;
  v_title        text;
  v_status       text;
  v_severity     text;
  v_version      int;
  v_orig_status   text;
  v_orig_severity text;
  v_orig_version  int;
  v_outcomes     jsonb := '[]'::jsonb;
  v_requested    int := 0;
  v_changed      int := 0;
  v_unchanged    int := 0;
  v_refused      int := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  p_dry_run := coalesce(p_dry_run, false);

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > c_ceiling then
    raise exception 'bug_bulk_selection_invalid' using errcode = '45319';
  end if;
  begin
    if exists (
      select 1
        from jsonb_array_elements(p_items) as e(item)
        left join lateral jsonb_to_record(
          case when jsonb_typeof(e.item) = 'object' then e.item else null end
        ) as x(id uuid, version int) on true
        where jsonb_typeof(e.item) <> 'object'
           or x.id is null
           or (x.version is not null and x.version < 1)
    ) then
      raise exception 'bug_bulk_selection_invalid' using errcode = '45319';
    end if;
  exception
    when sqlstate '45319' then raise;
    when others then
      raise exception 'bug_bulk_selection_invalid' using errcode = '45319';
  end;

  if p_change is null or jsonb_typeof(p_change) <> 'object'
     or p_field is null or p_field not in ('status', 'severity')
     or (select count(*) from jsonb_object_keys(p_change)) <> 1
     or not (p_change ? p_field)
     or jsonb_typeof(p_change -> p_field) <> 'string' then
    raise exception 'bug_bulk_change_invalid' using errcode = '45320';
  end if;
  v_target := p_change ->> p_field;
  if p_field = 'status' then
    v_target_rank := case v_target
      when 'open' then 1 when 'in_progress' then 2
      when 'resolved' then 3 when 'closed' then 4 else 0 end;
    if v_target_rank = 0 then
      raise exception 'bug_bulk_change_invalid' using errcode = '45320';
    end if;
  elsif v_target not in ('P1', 'P2', 'P3', 'P4') then
    raise exception 'bug_bulk_change_invalid' using errcode = '45320';
  end if;

  select p.workspace_id, wm.role
    into v_workspace_id, v_role
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id and w.deleted_at is null
    join public.workspace_members wm
      on wm.workspace_id = p.workspace_id
     and wm.user_id = p_actor_user_id
     and wm.status = 'active'
    where p.id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_role not in ('member', 'admin', 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.bunkai_read_only_project_ids(v_workspace_id) as r(id)
     where r.id = p_project_id
  ) then
    raise exception 'project_read_only' using errcode = '45701';
  end if;

  for v_row in
    select distinct on (x.id) x.id, x.version
      from jsonb_to_recordset(p_items) as x(id uuid, version int)
      order by x.id, x.version asc nulls last
  loop
    v_requested := v_requested + 1;
    v_outcome := null;
    v_reason := null;
    v_title := null;
    v_status := null;
    v_severity := null;
    v_version := null;
    v_orig_status := null;
    v_orig_severity := null;
    v_orig_version := null;

    begin
      if p_dry_run then
        select b.id, b.title, b.status, b.severity, b.content_version, b.assignee_user_id
          into v_bug
          from public.bugs b
          where b.id = v_row.id and b.project_id = p_project_id;
      else
        select b.id, b.title, b.status, b.severity, b.content_version, b.assignee_user_id
          into v_bug
          from public.bugs b
          where b.id = v_row.id and b.project_id = p_project_id
          for no key update;
      end if;

      if not found then
        v_outcome := 'refused';
        v_reason := 'not_found';
      else
        v_title := v_bug.title;
        v_status := v_bug.status;
        v_severity := v_bug.severity;
        v_version := v_bug.content_version;
        v_orig_status := v_bug.status;
        v_orig_severity := v_bug.severity;
        v_orig_version := v_bug.content_version;

        if not p_dry_run and not exists (
          select 1
            from public.workspace_members wm
            join public.workspaces w on w.id = wm.workspace_id and w.deleted_at is null
            where wm.workspace_id = v_workspace_id
              and wm.user_id = p_actor_user_id
              and wm.status = 'active'
              and wm.role in ('member', 'admin', 'owner')
        ) then
          raise exception 'forbidden' using errcode = '42501';
        end if;

        if p_field = 'status' then
          v_old_rank := case v_bug.status
            when 'open' then 1 when 'in_progress' then 2
            when 'resolved' then 3 when 'closed' then 4 else 0 end;
          if v_target_rank = v_old_rank then
            v_outcome := 'unchanged';
          elsif v_target_rank > v_old_rank + 1 then
            v_outcome := 'refused';
            v_reason := 'status_transition_skipped';
          elsif v_target_rank < v_old_rank then
            v_outcome := 'refused';
            v_reason := 'status_transition_backward';
          else
            if not p_dry_run then
              update public.bugs
                set status = v_target
                where id = v_bug.id;

              if exists (
                select 1 from public.bunkai_test_failpoints f
                 where f.name in ('bug_bulk_edit.before_event', 'bug_bulk_edit.before_event:' || v_bug.id::text)
                   and f.workspace_id = v_workspace_id
              ) then
                raise exception 'bug_failpoint' using errcode = 'P0001';
              end if;

              insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
              values (
                v_workspace_id, p_actor_user_id, 'bug', v_bug.id, 'bug.status_changed',
                jsonb_build_object(
                  'previous_status', v_bug.status,
                  'status', v_target,
                  'assignee_user_id', v_bug.assignee_user_id,
                  'bulk', true
                )
              );
            end if;
            v_outcome := 'changed';
            v_status := v_target;
          end if;
        else
          if v_bug.severity = v_target then
            v_outcome := 'unchanged';
          elsif v_row.version is not null and v_row.version <> v_bug.content_version then
            v_outcome := 'refused';
            v_reason := 'stale_version';
          else
            if not p_dry_run then
              update public.bugs
                set severity = v_target,
                    content_version = v_bug.content_version + 1
                where id = v_bug.id;

              if exists (
                select 1 from public.bunkai_test_failpoints f
                 where f.name in ('bug_bulk_edit.before_event', 'bug_bulk_edit.before_event:' || v_bug.id::text)
                   and f.workspace_id = v_workspace_id
              ) then
                raise exception 'bug_failpoint' using errcode = 'P0001';
              end if;

              insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
              values (
                v_workspace_id, p_actor_user_id, 'bug', v_bug.id, 'bug.corrected',
                jsonb_build_object(
                  'title', v_bug.title,
                  'changes', jsonb_build_object(
                    'severity', jsonb_build_object('from', v_bug.severity, 'to', v_target)
                  ),
                  'bulk', true
                )
              );
            end if;
            v_outcome := 'changed';
            v_severity := v_target;
            v_version := v_bug.content_version + 1;
          end if;
        end if;

        if not p_dry_run and v_outcome = 'changed' and exists (
          select 1 from public.bunkai_test_failpoints f
           where f.name = 'bug_bulk_edit.forbidden:' || v_bug.id::text
             and f.workspace_id = v_workspace_id
        ) then
          raise exception 'forbidden' using errcode = '42501';
        end if;
      end if;
    exception
      when sqlstate '42501' or sqlstate '45701' then
        raise;
      when others then
        v_outcome := 'refused';
        v_reason := 'write_failed';
        v_status := v_orig_status;
        v_severity := v_orig_severity;
        v_version := v_orig_version;
    end;

    if v_outcome = 'changed' then
      v_changed := v_changed + 1;
    elsif v_outcome = 'unchanged' then
      v_unchanged := v_unchanged + 1;
    else
      v_refused := v_refused + 1;
    end if;

    v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
      'bug_id', v_row.id,
      'title', v_title,
      'outcome', v_outcome,
      'reason', v_reason,
      'status', v_status,
      'severity', v_severity,
      'version', v_version
    ));
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'field', p_field,
    'requested', v_requested,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'refused', v_refused,
    'outcomes', v_outcomes
  );
end;
$$;

comment on function public.bunkai_bulk_edit_bugs(uuid, uuid, jsonb, text, jsonb, boolean) is
  'BK-2098: bulk-edit status (one stage forward) or severity on up to 200 Bugs of one Project. Per-Bug outcomes, partial success, no-op before stale. ADR-0029. service_role only.';

revoke execute on function public.bunkai_bulk_edit_bugs(uuid, uuid, jsonb, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.bunkai_bulk_edit_bugs(uuid, uuid, jsonb, text, jsonb, boolean)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_bulk_edit_bugs(uuid, uuid, jsonb, text, jsonb, boolean)
      from qa_inspector_ro;
  end if;
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke all on function public.bunkai_bulk_edit_bugs(uuid, uuid, jsonb, text, jsonb, boolean)
      from qa_inspector_rw;
  end if;
end;
$$;
