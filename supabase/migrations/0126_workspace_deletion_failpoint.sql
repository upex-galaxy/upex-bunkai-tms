-- ============================================================================
-- 0126_workspace_deletion_failpoint.sql (BK-1736, BK-512 testability)
-- ============================================================================
-- BK-512 TC48 asserts that a workspace deletion which fails halfway leaves the
-- workspace intact (AC-18). Nothing could make the server-side request fail on
-- the shared database, so this migration gives bunkai_request_workspace_deletion
-- a test failpoint, the pattern of ADR-0022 point 5 (table created in 0114,
-- read by 0114, 0116, 0117 and 0124).
--
-- WHAT CHANGES. One block, and only that. The body below is the 0084
-- definition byte for byte (no later migration redefines this function; the
-- live prosrc matched 0084 before this apply), plus a read of
-- public.bunkai_test_failpoints for the name 'workspace_delete.before_return'
-- scoped to p_workspace_id. It sits after every write of the request (the
-- deleted_at stamp, the PAT and pending-invite revocations, and the
-- workspace_deletions tombstone) and before the recipients read and the
-- return, so a raise rolls back the whole transaction: the workspace is not
-- deleted, its PATs and invites stay live, its members are untouched and no
-- tombstone is left. The error is the house shape of every failpoint reader:
-- 'test_failpoint', SQLSTATE P0001, which the route maps to 500 internal_error.
--
-- WHY THE NAME IS NOT '<op>.before_event'. The other readers fire just before
-- their activity_log insert. This RPC writes no activity event (the tombstone
-- is its audit record, ADR-0015 point 8), so the name says where it fires.
--
-- ARMING. Only the service role can arm or clear it, only per workspace (the
-- table has RLS on, no policy, no privilege for any user or QA role):
--   insert into public.bunkai_test_failpoints (name, workspace_id)
--   values ('workspace_delete.before_return', '<workspace-id>');
--   delete from public.bunkai_test_failpoints
--    where name = 'workspace_delete.before_return' and workspace_id = '<workspace-id>';
-- With no row armed the function behaves exactly as in 0084; the cost is one
-- primary-key lookup per request.
--
-- UNCHANGED. SECURITY DEFINER (it reads auth.users and writes the tombstone),
-- set search_path = '', no actor parameter (auth.uid() bound at step 0,
-- ADR-0012), the owner check and the error vocabulary (42501, P0002, 45900,
-- 45901). create or replace keeps the existing ACL; the grants of 0084 are
-- restated below and nothing else is granted. qa_inspector_rw and _ro stay
-- without EXECUTE, as 0086 decided for every function that reads auth.users.
-- ============================================================================

create or replace function public.bunkai_request_workspace_deletion(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_deleted_at timestamptz;
  v_workspace_name text;
  v_workspace_slug text;
  v_other_active_owners int;
  v_other_member_count int;
  v_purge_deadline timestamptz;
  v_digest jsonb;
  v_recipients jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select role into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = v_user_id
    and status = 'active';

  if v_role is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  if v_role <> 'owner' then
    raise exception 'owner_only' using errcode = '45900';
  end if;

  select deleted_at, name, slug into v_deleted_at, v_workspace_name, v_workspace_slug
  from public.workspaces
  where id = p_workspace_id
  for update;

  if v_workspace_name is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  if v_deleted_at is not null then
    raise exception 'already_deleted' using errcode = '45901';
  end if;

  -- Cheap invariant, currently unreachable (see header comment).
  select count(*) into v_other_active_owners
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id <> v_user_id
    and status = 'active'
    and role = 'owner';

  v_purge_deadline := now() + interval '30 days';

  update public.workspaces
  set deleted_at = now(),
      deletion_requested_by = v_user_id
  where id = p_workspace_id;

  update public.access_tokens
  set revoked_at = now()
  where workspace_id = p_workspace_id
    and revoked_at is null;

  update public.workspace_invites
  set revoked_at = now()
  where workspace_id = p_workspace_id
    and accepted_at is null
    and revoked_at is null;

  select count(*) into v_other_member_count
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id <> v_user_id
    and status = 'active';

  v_digest := jsonb_build_object(
    'projects', (select count(*) from public.projects where workspace_id = p_workspace_id),
    'tests', (select count(*) from public.tests where workspace_id = p_workspace_id),
    'runs', (select count(*) from public.runs where workspace_id = p_workspace_id),
    'bugs', (select count(*) from public.bugs where workspace_id = p_workspace_id),
    'workspace_members', (select count(*) from public.workspace_members where workspace_id = p_workspace_id and status = 'active')
  );

  insert into public.workspace_deletions (
    workspace_id, workspace_name, workspace_slug, requested_by,
    requested_at, purge_deadline, member_count, row_count_digest
  )
  values (
    p_workspace_id, v_workspace_name, v_workspace_slug, v_user_id,
    now(), v_purge_deadline, v_other_member_count + 1, v_digest
  );

  -- BK-1736: test failpoint (ADR-0022 point 5). Every write of the request has
  -- run by here, the tombstone included, so raising rolls all of them back.
  if exists (
    select 1 from public.bunkai_test_failpoints f
     where f.name = 'workspace_delete.before_return'
       and f.workspace_id = p_workspace_id
  ) then
    raise exception 'test_failpoint' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('email', u.email)), '[]'::jsonb)
  into v_recipients
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id and u.email is not null
  where wm.workspace_id = p_workspace_id
    and wm.status = 'active';

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'workspace_name', v_workspace_name,
    'workspace_slug', v_workspace_slug,
    'deleted_at', now(),
    'purge_deadline', v_purge_deadline,
    'other_member_count', v_other_member_count,
    'recipients', v_recipients
  );
end;
$$;

revoke execute on function public.bunkai_request_workspace_deletion(uuid) from public, anon;
grant execute on function public.bunkai_request_workspace_deletion(uuid) to authenticated;
