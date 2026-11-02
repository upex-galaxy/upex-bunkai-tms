-- Migration: 0114 — remove a teammate from a workspace (BK-572)
-- Authored: 2026-11-02
--
-- Governing record: ADR-0022 (workspace membership authorization ladder and
-- member-removal semantics), the BK-572 AI Tech Lead ruling of 2026-08-21 and
-- the decision of 2026-11-02 (Jira comment 13350). Additive and idempotent:
-- every object is `create or replace`, `create ... if not exists`, or a
-- `drop policy if exists` + `create policy` pair.
--
-- What it does:
--   1. Two ladder helpers: bunkai_workspace_role_rank(text) and
--      bunkai_caller_workspace_rank(uuid).
--   2. Narrows the three write policies of workspace_members (DELETE, UPDATE,
--      INSERT) to the ladder plus self-protection. Before this migration an
--      Admin could delete or demote an Owner's row, or promote their own row to
--      owner, through PostgREST (0005_rls_helpers.sql only asked "is admin").
--   3. bunkai_test_failpoints: a service-role-only table the removal RPC reads
--      so a DB-integration test can force a failure after every other write.
--   4. bunkai_remove_workspace_member(p_workspace_id, p_user_id): the one
--      transaction that ends a teammate's membership.
--   5. bunkai_list_activity: `member.removed` joins the backstop allowlist and
--      gets a positive projection (body copied forward from 0101 unchanged
--      otherwise).
--   6. bunkai_resolve_activity_actors: an id also resolves when it is the
--      entity_id of a `member.removed` row in the same workspace (body copied
--      forward from 0047 otherwise).
--
-- Error codes, re-verified on 2026-11-02 against the repo, the remote ledger
-- and the open PRs (`grep -rhoE "errcode = '452[0-9]{2}'"`): 45215-45219 are
-- taken (0075, 0097), 45220/45221 had no hit.
--   45220 cannot_remove_self   (409, self-removal belongs to Leave, 0044)
--   45221 cannot_remove_owner  (403, an Admin targeting an Owner)
--   45213 sole_owner           (409, reused from 0044; a backstop the ladder
--                               makes unreachable today; shared with 0042's
--                               step_status_invalid, so callers match message)

-- ============================================================================
-- 1. Ladder helpers
-- ============================================================================

-- viewer 1 < member 2 < admin 3 < owner 4; anything else 0. Pure.
create or replace function public.bunkai_workspace_role_rank(p_role text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'viewer' then 1
    when 'member' then 2
    when 'admin'  then 3
    when 'owner'  then 4
    else 0
  end;
$$;

-- The caller's rank in a LIVE workspace, from their ACTIVE row; 0 when they
-- have none. SECURITY DEFINER for the same reason as bunkai_is_workspace_admin:
-- a raw read of workspace_members inside one of its own policies trips 42P17
-- (0084a). Reads only the caller's own row (auth.uid()), discloses nothing.
create or replace function public.bunkai_caller_workspace_rank(ws_id uuid)
returns int
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((
    select public.bunkai_workspace_role_rank(wm.role)
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
     where wm.workspace_id = ws_id
       and wm.user_id = auth.uid()
       and wm.status = 'active'
       and w.deleted_at is null
  ), 0);
$$;

revoke execute on function public.bunkai_workspace_role_rank(text) from public, anon;
grant  execute on function public.bunkai_workspace_role_rank(text) to authenticated, service_role;
revoke execute on function public.bunkai_caller_workspace_rank(uuid) from public, anon;
grant  execute on function public.bunkai_caller_workspace_rank(uuid) to authenticated, service_role;

-- ============================================================================
-- 2. workspace_members write policies — the ladder at the data layer
-- ============================================================================
-- A caller may write a membership row only when they administer the live
-- workspace, the row is not their own, and the row's role does not outrank
-- theirs. For UPDATE both the old row (`using`) and the new row (`with check`)
-- must pass, so an Admin can neither touch an Owner row nor promote anyone
-- (themselves included) above admin. No shipped flow writes this table
-- through a user session: invite accept uses the service role, bootstrap
-- (0006) and leave (0044) are SECURITY DEFINER. SELECT is unchanged (0084a).

drop policy if exists workspace_members_delete_admin on public.workspace_members;
create policy workspace_members_delete_admin on public.workspace_members
  for delete using (
    user_id <> auth.uid()
    and public.bunkai_is_workspace_admin(workspace_id)
    and public.bunkai_workspace_role_rank(role) <= public.bunkai_caller_workspace_rank(workspace_id)
  );

drop policy if exists workspace_members_update_admin on public.workspace_members;
create policy workspace_members_update_admin on public.workspace_members
  for update
  using (
    user_id <> auth.uid()
    and public.bunkai_is_workspace_admin(workspace_id)
    and public.bunkai_workspace_role_rank(role) <= public.bunkai_caller_workspace_rank(workspace_id)
  )
  with check (
    user_id <> auth.uid()
    and public.bunkai_is_workspace_admin(workspace_id)
    and public.bunkai_workspace_role_rank(role) <= public.bunkai_caller_workspace_rank(workspace_id)
  );

drop policy if exists workspace_members_insert_admin on public.workspace_members;
create policy workspace_members_insert_admin on public.workspace_members
  for insert
  with check (
    user_id <> auth.uid()
    and public.bunkai_is_workspace_admin(workspace_id)
    and public.bunkai_workspace_role_rank(role) <= public.bunkai_caller_workspace_rank(workspace_id)
  );

-- ============================================================================
-- 3. Test failpoints (ADR-0022 point 5)
-- ============================================================================
-- Armed ONLY by the service role, ONLY per workspace. RLS on with no policy,
-- and no privilege for any user role or QA database role, so no session can
-- read or arm it. The removal RPC (SECURITY DEFINER, owner postgres) reads it.

create table if not exists public.bunkai_test_failpoints (
  name         text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (name, workspace_id)
);

alter table public.bunkai_test_failpoints enable row level security;

revoke all on public.bunkai_test_failpoints from public, anon, authenticated;
grant select, insert, delete on public.bunkai_test_failpoints to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on public.bunkai_test_failpoints from qa_inspector_ro;
  end if;
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke all on public.bunkai_test_failpoints from qa_inspector_rw;
  end if;
end;
$$;

-- ============================================================================
-- 4. bunkai_remove_workspace_member — SECURITY DEFINER (ADR-0012)
-- ============================================================================
-- AUTHORIZATION. No actor parameter: the actor is auth.uid(), bound at step 0.
-- p_user_id is the TARGET, authorized by the ladder (not an unbound actor).
-- Every write below is scoped to p_workspace_id and the target.
--
-- Check order (BK-572 Q-D2, identical in the route):
--   0. no session                         -> 42501 not_authenticated
--   1. caller has no active row in a live
--      workspace (incl. deleted / unknown) -> P0002 not_found
--   2. caller is not admin/owner          -> 42501 not_a_member
--   3. target is the caller               -> 45220 cannot_remove_self
--   4. lock caller, target and active owner rows FOR UPDATE, in user_id
--      order (two crossing removals cannot deadlock), then re-validate the
--      caller: gone -> P0002, demoted -> 42501 (a caller removed while
--      waiting cannot complete a removal)
--   5. target has no active row           -> P0002 not_found (same text as 1)
--   6. target outranks the caller         -> 45221 cannot_remove_owner
--   7. no owner would remain              -> 45213 sole_owner (backstop)
--   8. writes: unassign the target's Bugs through bunkai_assign_bug (each
--      emits bug.unassigned with previous_assignee_user_id; 0056 defines no
--      recipient for it), soft-revoke the target's PATs scoped to this
--      workspace (global PATs untouched), revoke pending invites addressed to
--      the target's email, delete the row, failpoint check, member.removed.
create or replace function public.bunkai_remove_workspace_member(
  p_workspace_id uuid,
  p_user_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller          uuid := auth.uid();
  v_caller_role     text;
  v_target_role     text;
  v_target_email    text;
  v_other_owners    int;
  v_bug_id          uuid;
  v_unassigned      int := 0;
  v_revoked_tokens  int := 0;
  v_revoked_invites int := 0;
begin
  -- 0. Actor bind.
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- 1-2. Visibility, then caller role.
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
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  -- 3. Self-removal is Leave's job (0044), with Leave's own guards.
  if p_user_id = v_caller then
    raise exception 'cannot_remove_self' using errcode = '45220';
  end if;

  -- 4. Lock, then re-validate the caller against committed state.
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
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  -- 5. Target.
  select wm.role into v_target_role
    from public.workspace_members wm
   where wm.workspace_id = p_workspace_id
     and wm.user_id = p_user_id
     and wm.status = 'active';
  if v_target_role is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- 6. Ladder.
  if public.bunkai_workspace_role_rank(v_target_role) > public.bunkai_workspace_role_rank(v_caller_role) then
    raise exception 'cannot_remove_owner' using errcode = '45221';
  end if;

  -- 7. A workspace never reaches zero active owners (backstop).
  if v_target_role = 'owner' then
    select count(*) into v_other_owners
      from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.user_id <> p_user_id
       and wm.role = 'owner'
       and wm.status = 'active';
    if v_other_owners = 0 then
      raise exception 'sole_owner' using errcode = '45213';
    end if;
  end if;

  -- 8. Writes, one transaction. The Bugs are locked FOR UPDATE: a concurrent
  --    reassignment that commits first is re-checked against the WHERE
  --    (READ COMMITTED re-evaluation) and drops out, so a Bug that just moved
  --    to someone else is never unassigned by this removal.
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

  update public.access_tokens
     set revoked_at = now()
   where user_id = p_user_id
     and workspace_id = p_workspace_id
     and revoked_at is null;
  get diagnostics v_revoked_tokens = row_count;

  select u.email::text into v_target_email
    from auth.users u
   where u.id = p_user_id;
  if v_target_email is not null then
    update public.workspace_invites
       set revoked_at = now()
     where workspace_id = p_workspace_id
       and lower(email) = lower(v_target_email)
       and accepted_at is null
       and revoked_at is null;
    get diagnostics v_revoked_invites = row_count;
  end if;

  delete from public.workspace_members
   where workspace_id = p_workspace_id
     and user_id = p_user_id;

  if exists (
    select 1 from public.bunkai_test_failpoints f
     where f.name = 'member_remove.before_event'
       and f.workspace_id = p_workspace_id
  ) then
    raise exception 'test_failpoint' using errcode = 'P0001';
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    p_workspace_id, v_caller, 'workspace_member', p_user_id, 'member.removed',
    jsonb_build_object('removed_user_id', p_user_id, 'removed_role', v_target_role)
  );

  return jsonb_build_object(
    'removed_user_id', p_user_id,
    'removed_role', v_target_role,
    'revoked_token_count', v_revoked_tokens,
    'unassigned_bug_count', v_unassigned,
    'revoked_invite_count', v_revoked_invites
  );
end;
$$;

revoke execute on function public.bunkai_remove_workspace_member(uuid, uuid) from public, anon;
grant  execute on function public.bunkai_remove_workspace_member(uuid, uuid) to authenticated;

-- 0085 hands every new function to the QA roles; this one is a writer, so the
-- read-only role must not keep it (0088 mechanism, as 0112).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_remove_workspace_member(uuid, uuid) from qa_inspector_ro;
  end if;
end;
$$;

-- ============================================================================
-- 5. bunkai_list_activity — member.removed joins the feed
-- ============================================================================
-- Same signature; body copied forward from 0101. Changes: 'member.removed' in
-- the backstop allowlist (kept in sync BY HAND with lib/activity/constants.ts)
-- and a positive projection of its payload (removed_user_id, removed_role).

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
      'member.removed'
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
                   when 'member.removed' then
                     -- BK-572: who was removed and the role they held.
                     jsonb_build_object(
                       'removed_user_id', k.payload -> 'removed_user_id',
                       'removed_role', k.payload -> 'removed_role'
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

-- ============================================================================
-- 6. bunkai_resolve_activity_actors — the removed teammate resolves too
-- ============================================================================
-- Body copied forward from 0047. One added rule (ADR-0022 point 4): an id
-- also resolves when it is the entity_id of a `member.removed` row in THIS
-- workspace, so the entry names the removed teammate even if they never acted
-- here. Everything else (the membership guard, silent exclusion of any other
-- id) is unchanged.

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
               and al.action = 'member.removed'
               and al.entity_type = 'workspace_member'
               and al.entity_id = u.id
          )
        );
end;
$$;

revoke all on function public.bunkai_resolve_activity_actors(uuid, uuid[]) from public, anon;
grant execute on function public.bunkai_resolve_activity_actors(uuid, uuid[]) to authenticated, service_role;

-- Verification (run after apply):
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_remove_workspace_member(uuid,uuid)', 'EXECUTE'); -- false
--   select has_table_privilege('authenticated', 'public.bunkai_test_failpoints', 'SELECT');                           -- false
