-- Migration: 0054 — BK-264 Slice 1: TMS-Defect Triage — assignment + status lifecycle
-- Authored: 2026-08-03
--
-- Adds an owner to a Bug (assign/reassign/unassign) and lets a Bug move
-- forward through its existing status lifecycle (open -> in_progress ->
-- resolved -> closed, one stage at a time, never backward). Bugs already
-- have a `status` column (0046_bugs.sql) but nothing writes to it, and no
-- column attaches an owner. This is the direct prerequisite for BK-212
-- (Notifications), which has no event to subscribe to until this ships.
--
-- NOTE ON NUMBERING: 0053_notifications.sql belongs to BK-209
-- (feat/BK-209-notifications-inbox), branched off origin/staging at 0052 and
-- not yet merged to staging. This branch (feat/BK-264-defect-triage) is also
-- off origin/staging at 0052, so 0054 is the next free number here — verified
-- against both the local migrations directory and the live project's
-- migration ledger (mcp__supabase__list_migrations, project fmbpikzpkafptqximhxn)
-- at Stage 2 start.
--
-- Authorization model (ADR-0012 / rpc-authorization.md): both new RPCs below
-- are SECURITY DEFINER, and NEITHER takes an explicit actor parameter — both
-- read auth.uid() directly, mirroring bunkai_update_module/bunkai_move_module/
-- bunkai_archive_module_subtree (0023_module_activity_log.sql), the pattern
-- ADR-0012 cites as its own worked example of deleting the identity parameter
-- instead of guarding it. DEFINER is needed here (not INVOKER) because the
-- assignee-eligibility check reads a workspace_members row for a user OTHER
-- than the caller, hidden from a non-admin caller by that table's own SELECT
-- policy (0001_tenancy.sql / 0005_rls_helpers.sql) — the sanctioned "reading a
-- table the caller's role legitimately cannot see" DEFINER case, not an
-- actor-spoofing shape. With no actor parameter, both RPCs are callable only
-- through a real user session — a service_role caller's auth.uid() is NULL,
-- which always fails bunkai_can_write_workspace — so `grant execute` below
-- goes to `authenticated` only, not `service_role` (matches 0023).
--
-- Non-disclosure boundary (both RPCs): a bug that does not exist AND a bug
-- whose workspace the caller is not even a member of collapse into the SAME
-- `bug_not_found` (P0002) — bunkai_is_workspace_member is checked before
-- anything else. Only once the caller is confirmed a member of the bug's own
-- workspace does insufficient write role raise the DISTINCT `forbidden`
-- (42501) — that distinction is safe to disclose because a member can already
-- SELECT this bug via `bugs_select_workspace_member` (0046), so "you can see
-- it but can't write to it" reveals nothing a non-member's P0002 would leak.
--
-- Status adjacency (open -> in_progress -> resolved -> closed, one stage at a
-- time, never backward) is enforced procedurally in two layers, since a plain
-- CHECK constraint cannot see the previous row:
--   1. Primary (friendly, AC-specific messages): inside
--      bunkai_transition_bug_status, which holds OLD status in the same call.
--   2. Backstop: the EXISTING bunkai_bugs_check_consistency BEFORE INSERT OR
--      UPDATE trigger (0046_bugs.sql) is extended via `create or replace
--      function` (append-only — 0046 untouched, mirrors 0039's precedent of
--      amending 0038's function later) with the same status-adjacency +
--      assignee-eligibility checks, same SQLSTATEs, as defense in depth
--      against a future direct-table write bypassing both RPCs. `security
--      definer` is added explicitly this time (0046's original omitted it,
--      relying on its only caller — bunkai_create_bug — already running in a
--      DEFINER context); this trigger's own assignee-eligibility check needs
--      the SAME cross-user workspace_members read the RPC does, independent
--      of whatever context invoked it.
--
-- Custom SQLSTATE codes allocated for the bugs domain (class 45xxx, 453xx
-- block — highest allocated so far is 45308, 0051_bugs_list.sql):
--   45310  bug_status_transition_skipped      (target status is more than one
--                                               stage ahead of the current one)
--   45311  bug_status_transition_backward      (target status is not ahead of
--                                               the current one — includes a
--                                               same-status no-move and any
--                                               unrecognized status value)
--   45312  bug_assignee_not_workspace_member   (no active workspace_members row
--                                               for the target user in THIS
--                                               bug's workspace)
--   45313  bug_assignee_view_only              (active row, but role = 'viewer')
-- (45309 intentionally left unallocated per the ratified Stage 1 plan.)

-- ============================================================================
-- 1. bugs — new column + index
-- ============================================================================

alter table public.bugs
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null;

create index if not exists bugs_assignee_user_id_idx
  on public.bugs (assignee_user_id);

-- ============================================================================
-- 2. bunkai_bugs_check_consistency — extend the EXISTING trigger (0046) with
--    the status-adjacency + assignee-eligibility backstop checks
-- ============================================================================

create or replace function public.bunkai_bugs_check_consistency()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_project_workspace uuid;
  v_module_project    uuid;
  v_old_rank          int;
  v_new_rank          int;
  v_assignee_status   text;
  v_assignee_role     text;
begin
  select workspace_id into v_project_workspace
    from public.projects
    where id = new.project_id;
  if v_project_workspace is null or v_project_workspace <> new.workspace_id then
    raise exception 'bugs_project_outside_workspace' using errcode = '45304';
  end if;

  select project_id into v_module_project
    from public.modules
    where id = new.module_id;
  if v_module_project is null or v_module_project <> new.project_id then
    raise exception 'bugs_module_outside_project' using errcode = '45300';
  end if;

  if new.run_id is not null and not exists (
    select 1 from public.runs where id = new.run_id and project_id = new.project_id
  ) then
    raise exception 'bugs_run_outside_project' using errcode = '45305';
  end if;

  if new.run_step_id is not null and not exists (
    select 1
      from public.run_steps rs
      join public.run_atcs ra on ra.id = rs.run_atc_id
      where rs.id = new.run_step_id and ra.run_id = new.run_id
  ) then
    raise exception 'bugs_run_step_outside_run' using errcode = '45306';
  end if;

  if new.atc_id is not null and not exists (
    select 1 from public.atcs where id = new.atc_id and project_id = new.project_id
  ) then
    raise exception 'bugs_atc_outside_project' using errcode = '45307';
  end if;

  -- Status-adjacency backstop (BK-264). Only re-checked when status actually
  -- changes on UPDATE — INSERT never changes status (bunkai_create_bug always
  -- defaults 'open'), so this is a no-op on the insert path. Same rank-based
  -- comparison bunkai_transition_bug_status itself uses, so the two layers
  -- can never disagree about what counts as adjacent.
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_old_rank := case old.status
      when 'open' then 1 when 'in_progress' then 2
      when 'resolved' then 3 when 'closed' then 4 else 0 end;
    v_new_rank := case new.status
      when 'open' then 1 when 'in_progress' then 2
      when 'resolved' then 3 when 'closed' then 4 else 0 end;
    if v_new_rank > v_old_rank + 1 then
      raise exception 'bug_status_transition_skipped' using errcode = '45310';
    end if;
    if v_new_rank <= v_old_rank then
      raise exception 'bug_status_transition_backward' using errcode = '45311';
    end if;
  end if;

  -- Assignee-eligibility backstop (BK-264). Only re-checked when the assignee
  -- actually changes (INSERT with a non-null assignee, or UPDATE where it
  -- differs from OLD) — mirrors bunkai_assign_bug's own eligibility check,
  -- same SQLSTATEs, scoped to THIS row's own already-validated workspace_id.
  if new.assignee_user_id is not null
     and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id) then
    select status, role into v_assignee_status, v_assignee_role
      from public.workspace_members
      where workspace_id = new.workspace_id
        and user_id = new.assignee_user_id;
    if v_assignee_status is distinct from 'active' then
      raise exception 'bug_assignee_not_workspace_member' using errcode = '45312';
    end if;
    if v_assignee_role = 'viewer' then
      raise exception 'bug_assignee_view_only' using errcode = '45313';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 3. bunkai_bug_json — add assignee_user_id to the composed JSON
-- ============================================================================

create or replace function public.bunkai_bug_json(p_bug_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'workspace_id', b.workspace_id,
    'project_id', b.project_id,
    'module_id', b.module_id,
    'module', (
      select jsonb_build_object('id', m.id, 'name', m.name, 'path', m.path)
        from public.modules m
        where m.id = b.module_id
    ),
    'run_id', b.run_id,
    'run_step_id', b.run_step_id,
    'atc_id', b.atc_id,
    'title', b.title,
    'severity', b.severity,
    'status', b.status,
    'description', b.description,
    'steps_to_reproduce', b.steps_to_reproduce,
    'evidence_urls', to_jsonb(b.evidence_urls),
    'assignee_user_id', b.assignee_user_id,
    'created_by', b.created_by,
    'created_at', b.created_at,
    'updated_at', b.updated_at
  )
  from public.bugs b
  where b.id = p_bug_id;
$$;

revoke execute on function public.bunkai_bug_json(uuid) from public, anon;
grant execute on function public.bunkai_bug_json(uuid) to authenticated, service_role;

-- ============================================================================
-- 4. bunkai_list_project_bugs — add assignee_user_id to the composed JSON
-- ============================================================================

create or replace function public.bunkai_list_project_bugs(
  p_actor_user_id uuid,
  p_project_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which
  --    the parameter IS the identity; a present-but-different uid is a spoof
  --    and collapses into the missing-Project answer (non-disclosure).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Project, then re-check READ membership (any active role).
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', b.id,
                 'workspace_id', b.workspace_id,
                 'project_id', b.project_id,
                 'module_id', b.module_id,
                 'module', jsonb_build_object('id', m.id, 'name', m.name, 'path', m.path),
                 'run_id', b.run_id,
                 'run_step_id', b.run_step_id,
                 'atc_id', b.atc_id,
                 'title', b.title,
                 'severity', b.severity,
                 'status', b.status,
                 'description', b.description,
                 'steps_to_reproduce', b.steps_to_reproduce,
                 'evidence_urls', to_jsonb(b.evidence_urls),
                 'assignee_user_id', b.assignee_user_id,
                 'created_by', b.created_by,
                 'created_at', b.created_at,
                 'updated_at', b.updated_at
               ) order by b.created_at desc, b.id desc)
        from (
          select *
            from public.bugs
            where project_id = p_project_id
            order by created_at desc, id desc
            limit 200
        ) b
        join public.modules m on m.id = b.module_id
      ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.bunkai_list_project_bugs(uuid, uuid) from public, anon;
grant execute on function public.bunkai_list_project_bugs(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 5. bunkai_list_bugs — add assignee_user_id to the composed JSON
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
           b.assignee_user_id, b.created_by, b.created_at, b.updated_at,
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
-- 6. bunkai_assign_bug — assign / reassign / unassign. SECURITY DEFINER.
-- ============================================================================
--
-- No p_actor_user_id: auth.uid() is read directly (step 1). Non-disclosure:
-- a bug that does not exist and a bug in a workspace the caller is not even a
-- member of BOTH raise the same bug_not_found (P0002) — checked via
-- bunkai_is_workspace_member BEFORE the write-role check, so "forbidden" is
-- only ever disclosed to a caller who is already a genuine member (and could
-- already SELECT this bug via bugs_select_workspace_member regardless).

create or replace function public.bunkai_assign_bug(
  p_bug_id           uuid,
  p_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id      uuid;
  v_previous_assignee uuid;
  v_assignee_status   text;
  v_assignee_role     text;
  v_action            text;
begin
  -- 1. Resolve the bug. A nonexistent bug OR one in a workspace the caller
  --    isn't even a member of both raise the SAME not-found (non-disclosure).
  select workspace_id, assignee_user_id
    into v_workspace_id, v_previous_assignee
    from public.bugs
    where id = p_bug_id;
  if v_workspace_id is null or not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'bug_not_found' using errcode = 'P0002';
  end if;

  -- 2. Write-role gate. Disclosed as a DISTINCT error from not-found — safe,
  --    since the caller (a genuine member) can already SELECT this bug.
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. No-op: identical assign/unassign — silent, no audit row (mirrors
  --    0023's no-op convention for a same-parent module move).
  if p_assignee_user_id is not distinct from v_previous_assignee then
    return public.bunkai_bug_json(p_bug_id);
  end if;

  -- 4. Assignee eligibility (only when assigning/reassigning to someone, not
  --    on unassign) — the ONE cross-user read this function needs: a
  --    workspace_members row for a user OTHER than the caller, scoped to the
  --    bug's OWN already-authorized workspace_id.
  if p_assignee_user_id is not null then
    select status, role into v_assignee_status, v_assignee_role
      from public.workspace_members
      where workspace_id = v_workspace_id
        and user_id = p_assignee_user_id;
    if v_assignee_status is distinct from 'active' then
      raise exception 'bug_assignee_not_workspace_member' using errcode = '45312';
    end if;
    if v_assignee_role = 'viewer' then
      raise exception 'bug_assignee_view_only' using errcode = '45313';
    end if;
  end if;

  -- 5. Mutation, re-scoped to THIS bug only (never a broader WHERE).
  update public.bugs
    set assignee_user_id = p_assignee_user_id
    where id = p_bug_id;

  -- 6. Audit — action depends on the old/new assignment state.
  v_action := case
    when v_previous_assignee is null then 'bug.assigned'
    when p_assignee_user_id is null then 'bug.unassigned'
    else 'bug.reassigned'
  end;
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'bug', p_bug_id, v_action,
    jsonb_build_object(
      'previous_assignee_user_id', v_previous_assignee,
      'assignee_user_id', p_assignee_user_id
    )
  );

  -- 7. Return the composed bug json.
  return public.bunkai_bug_json(p_bug_id);
end;
$$;

revoke execute on function public.bunkai_assign_bug(uuid, uuid) from public, anon;
grant execute on function public.bunkai_assign_bug(uuid, uuid) to authenticated;

-- ============================================================================
-- 7. bunkai_transition_bug_status — advance status one stage at a time.
--    SECURITY DEFINER.
-- ============================================================================
--
-- Same shape as bunkai_assign_bug: no p_actor_user_id, auth.uid() read
-- directly, same non-disclosure boundary (not-a-member collapses into the
-- bug's own not-found; insufficient write role is the distinct, disclosed
-- forbidden). Adjacency uses a fixed rank so "skip" and "backward" are two
-- distinct, AC-mandated messages rather than one generic rejection.

create or replace function public.bunkai_transition_bug_status(
  p_bug_id     uuid,
  p_new_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id     uuid;
  v_assignee_user_id uuid;
  v_old_status       text;
  v_old_rank         int;
  v_new_rank         int;
begin
  -- 1. Resolve the bug. A nonexistent bug OR one in a workspace the caller
  --    isn't even a member of both raise the SAME not-found (non-disclosure).
  select workspace_id, status, assignee_user_id
    into v_workspace_id, v_old_status, v_assignee_user_id
    from public.bugs
    where id = p_bug_id;
  if v_workspace_id is null or not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'bug_not_found' using errcode = 'P0002';
  end if;

  -- 2. Write-role gate. Disclosed as a DISTINCT error from not-found — safe,
  --    since the caller (a genuine member) can already SELECT this bug.
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Adjacency check (Primary, friendly AC-specific messages) — holds OLD
  --    status in the same call. An unrecognized p_new_status ranks 0, which
  --    always falls into the "backward" bucket below (never the "skip" one).
  v_old_rank := case v_old_status
    when 'open' then 1 when 'in_progress' then 2
    when 'resolved' then 3 when 'closed' then 4 else 0 end;
  v_new_rank := case p_new_status
    when 'open' then 1 when 'in_progress' then 2
    when 'resolved' then 3 when 'closed' then 4 else 0 end;

  if v_new_rank > v_old_rank + 1 then
    raise exception 'bug_status_transition_skipped' using errcode = '45310';
  end if;
  if v_new_rank <= v_old_rank then
    raise exception 'bug_status_transition_backward' using errcode = '45311';
  end if;

  -- 4. Mutation, re-scoped to THIS bug only (never a broader WHERE).
  update public.bugs
    set status = p_new_status
    where id = p_bug_id;

  -- 5. Audit. assignee_user_id is snapshotted at write time so BK-212's
  --    future consumer knows WHO to notify without a live join (mirrors
  --    0053's own reason for snapshotting payload at write time).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'bug', p_bug_id, 'bug.status_changed',
    jsonb_build_object(
      'previous_status', v_old_status,
      'status', p_new_status,
      'assignee_user_id', v_assignee_user_id
    )
  );

  -- 6. Return the composed bug json.
  return public.bunkai_bug_json(p_bug_id);
end;
$$;

revoke execute on function public.bunkai_transition_bug_status(uuid, text) from public, anon;
grant execute on function public.bunkai_transition_bug_status(uuid, text) to authenticated;
