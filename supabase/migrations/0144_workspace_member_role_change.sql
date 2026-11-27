-- Migration: 0144 — change a teammate's role (BK-2542)
-- Authored: 2026-11-27
--
-- Governing record: ADR-0022 (ADR-0022-workspace-membership-ladder-and-removal.md),
-- the BK-2542 AI Product Owner and AI Tech Lead rulings of 2026-11-26 and
-- 2026-11-27 (Jira comments 14087 and 14088). Additive and idempotent: every
-- object is `create or replace`, a `revoke` or a `grant`. No table changes.
--
-- What it does:
--   1. bunkai_change_workspace_member_role(p_workspace_id, p_user_id, p_role):
--      the one writer of a membership role. No user session writes
--      workspace_members (0118 G1), and this adds no grant on the table.
--   2. bunkai_list_activity: 'member.role_changed' joins the backstop allowlist
--      with a positive projection. Body copied forward from 0134, which matched
--      the live definition byte for byte on 2026-11-27.
--   3. bunkai_resolve_activity_actors: the target of a 'member.role_changed'
--      row resolves too. Body copied forward from 0114 (live match verified).
--
-- Check order of 1 (identical in the PATCH route):
--   0. no session                          -> 42501 not_authenticated
--   1. p_role not viewer, member or admin  -> 45227 invalid_member_role
--   2. caller has no active row in a live
--      workspace                           -> P0002 not_found
--   3. caller is not admin or owner        -> 42501 not_an_admin
--   4. target is the caller                -> 45225 cannot_change_own_role
--   5. lock caller, target and active owner rows FOR UPDATE in user_id order
--      (0114's order; Bugs after members, as 0118 G2), then re-check 2 and 3
--   6. target has no active row            -> P0002 not_found
--   7. target is an owner, or outranks the
--      caller                              -> 45226 cannot_change_owner_role
--   8. same role                           -> no write, changed = false
--   9. writes: the role; to viewer, every Bug of the target in this workspace
--      is unassigned through bunkai_assign_bug (one bug.unassigned each);
--      failpoint member_role_change.before_event; member.role_changed.
--
-- Error codes 45225-45227, checked on 2026-11-27 against the repo migrations,
-- the remote function sources, the remote ledger (last 0143) and the open PRs:
-- no hit. Tokens are not revoked: a PAT runs as its holder's session, so the
-- current role decides what it may do.

-- ============================================================================
-- 1. bunkai_change_workspace_member_role — SECURITY DEFINER (ADR-0012)
-- ============================================================================

create or replace function public.bunkai_change_workspace_member_role(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_role         text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller      uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
  v_bug_id      uuid;
  v_unassigned  int := 0;
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('viewer', 'member', 'admin') then
    raise exception 'invalid_member_role' using errcode = '45227';
  end if;

  select wm.role into v_caller_role
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
   where wm.workspace_id = p_workspace_id
     and wm.user_id = v_caller
     and wm.status = 'active'
     and w.deleted_at is null;
  if v_caller_role is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_caller_role not in ('admin', 'owner') then
    raise exception 'not_an_admin' using errcode = '42501';
  end if;

  if p_user_id = v_caller then
    raise exception 'cannot_change_own_role' using errcode = '45225';
  end if;

  perform 1
     from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and (wm.user_id in (v_caller, p_user_id) or (wm.role = 'owner' and wm.status = 'active'))
    order by wm.user_id
    for update;

  v_caller_role := null;
  select wm.role into v_caller_role
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
   where wm.workspace_id = p_workspace_id
     and wm.user_id = v_caller
     and wm.status = 'active'
     and w.deleted_at is null;
  if v_caller_role is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_caller_role not in ('admin', 'owner') then
    raise exception 'not_an_admin' using errcode = '42501';
  end if;

  select wm.role into v_target_role
    from public.workspace_members wm
   where wm.workspace_id = p_workspace_id
     and wm.user_id = p_user_id
     and wm.status = 'active';
  if v_target_role is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_target_role = 'owner'
     or public.bunkai_workspace_role_rank(v_target_role) > public.bunkai_workspace_role_rank(v_caller_role) then
    raise exception 'cannot_change_owner_role' using errcode = '45226';
  end if;

  if v_target_role = p_role then
    return jsonb_build_object(
      'user_id', p_user_id,
      'previous_role', v_target_role,
      'role', p_role,
      'changed', false,
      'unassigned_bug_count', 0
    );
  end if;

  update public.workspace_members
     set role = p_role
   where workspace_id = p_workspace_id
     and user_id = p_user_id;

  if p_role = 'viewer' then
    for v_bug_id in
      select b.id
        from public.bugs b
       where b.workspace_id = p_workspace_id
         and b.assignee_user_id = p_user_id
       order by b.id
       for update
    loop
      perform public.bunkai_assign_bug(v_bug_id, null);
      v_unassigned := v_unassigned + 1;
    end loop;
  end if;

  if exists (
    select 1 from public.bunkai_test_failpoints f
     where f.name = 'member_role_change.before_event'
       and f.workspace_id = p_workspace_id
  ) then
    raise exception 'test_failpoint' using errcode = 'P0001';
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    p_workspace_id, v_caller, 'workspace_member', p_user_id, 'member.role_changed',
    jsonb_build_object('user_id', p_user_id, 'previous_role', v_target_role, 'role', p_role)
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'previous_role', v_target_role,
    'role', p_role,
    'changed', true,
    'unassigned_bug_count', v_unassigned
  );
end;
$$;

revoke execute on function public.bunkai_change_workspace_member_role(uuid, uuid, text) from public, anon;
grant  execute on function public.bunkai_change_workspace_member_role(uuid, uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_change_workspace_member_role(uuid, uuid, text) from qa_inspector_ro;
  end if;
end;
$$;

-- ============================================================================
-- 2. bunkai_list_activity — member.role_changed joins the feed (body from 0134)
-- ============================================================================

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
      'atc.updated',
      'member.removed',
      'atc.archived', 'atc.restored',
      'module.restored',
      'jira_connection.connected', 'jira_connection.changed', 'jira_connection.disconnected',
      'bug.corrected',
      'milestone.archived', 'milestone.restored',
      'test.renamed', 'test.archived', 'test.restored',
      'member.role_changed'
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
                       'name', (select m.name from public.modules m where m.id = k.entity_id),
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'module.restored' then
                     jsonb_build_object(
                       'name', (select m.name from public.modules m where m.id = k.entity_id),
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
                   when 'atc.archived' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'atc.restored' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'test.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'test.renamed' then
                     -- BK-596: the name before and after.
                     jsonb_build_object('old_title', k.payload -> 'old_title', 'new_title', k.payload -> 'new_title')
                   when 'test.archived' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'test.restored' then
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
                   when 'bug.corrected' then
                     -- BK-1835 (P6): the defect's title after the correction,
                     -- the names of the changed fields, and the previous/new
                     -- pairs of title and severity only. Description and steps
                     -- are free text: their values stay in activity_log.
                     jsonb_build_object(
                       'title', k.payload -> 'title',
                       'changed_fields', coalesce((
                         select jsonb_agg(f.key order by f.key)
                           from jsonb_object_keys(
                             case when jsonb_typeof(k.payload -> 'changes') = 'object'
                                  then k.payload -> 'changes' else '{}'::jsonb end
                           ) as f(key)
                       ), '[]'::jsonb),
                       'title_change', k.payload -> 'changes' -> 'title',
                       'severity_change', k.payload -> 'changes' -> 'severity'
                     )
                   when 'milestone.archived' then
                     -- BK-1899: the Milestone's name at the time of the change.
                     jsonb_build_object('name', k.payload -> 'name')
                   when 'milestone.restored' then
                     jsonb_build_object('name', k.payload -> 'name')
                   when 'export.requested' then
                     '{}'::jsonb
                   when 'export.downloaded' then
                     '{}'::jsonb
                   when 'member.removed' then
                     -- BK-572: who was removed and the role they held.
                     jsonb_build_object(
                       'removed_user_id', k.payload -> 'removed_user_id',
                       'removed_role', k.payload -> 'removed_role'
                     )
                   when 'member.role_changed' then
                     -- BK-2542: whose role changed, from what, to what.
                     jsonb_build_object(
                       'user_id', k.payload -> 'user_id',
                       'previous_role', k.payload -> 'previous_role',
                       'role', k.payload -> 'role'
                     )
                   when 'jira_connection.connected' then
                     -- BK-1619: the site host only. Never the token, the
                     -- secret id or the email.
                     jsonb_build_object('site_host', k.payload -> 'site_host')
                   when 'jira_connection.changed' then
                     jsonb_build_object('site_host', k.payload -> 'site_host')
                   when 'jira_connection.disconnected' then
                     jsonb_build_object('site_host', k.payload -> 'site_host')
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

-- ============================================================================
-- 3. bunkai_resolve_activity_actors — the target of a role change resolves (body from 0114)
-- ============================================================================

create or replace function public.bunkai_resolve_activity_actors(
  p_workspace_id uuid,
  p_user_ids     uuid[]
)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.bunkai_is_workspace_member(p_workspace_id) then
    raise exception 'not_workspace_member' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text
      from auth.users u
      where u.id = any(p_user_ids)
        and (
          exists (
            select 1
              from public.activity_log al
             where al.workspace_id = p_workspace_id
               and al.actor_user_id = u.id
          )
          or exists (
            select 1
              from public.activity_log al
             where al.workspace_id = p_workspace_id
               and al.action in ('member.removed', 'member.role_changed')
               and al.entity_type = 'workspace_member'
               and al.entity_id = u.id
          )
        );
end;
$$;

-- Verification (run after apply):
--   select has_function_privilege('authenticated', 'public.bunkai_change_workspace_member_role(uuid,uuid,text)', 'EXECUTE');   -- true
--   select has_function_privilege('anon', 'public.bunkai_change_workspace_member_role(uuid,uuid,text)', 'EXECUTE');            -- false
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_change_workspace_member_role(uuid,uuid,text)', 'EXECUTE'); -- false
--   select has_table_privilege('authenticated', 'public.workspace_members', 'UPDATE');                                       -- false
