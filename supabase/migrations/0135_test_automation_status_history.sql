-- =============================================================================
-- 0135_test_automation_status_history
-- BK-227 : track the automation status of a Test.
-- =============================================================================
--
-- WHY. 0106 (BK-218) persisted tests.automation_status ('manual-only' default,
-- 'candidate', 'automated') for the chat card, with no writer and no history.
-- BK-227 lets a member or higher change it and keeps an append-only history of
-- every change (author, time, from, to).
--
-- WHAT.
--   1. test_automation_status_history: one row per real change. Append-only:
--      no client role may insert, update or delete a row, and an UPDATE
--      trigger refuses every session, owner included. Rows leave only by
--      cascade when their Test or workspace is hard-deleted.
--   2. Guard on tests: no PostgREST role (anon, authenticated, service_role)
--      may change automation_status, nor create a Test with another value
--      than the default. The writer below is the only path, so a change can
--      never skip its history entry (authenticated holds member-plus UPDATE
--      on tests since 0026).
--   3. bunkai_set_test_automation_status: the writer.
--   4. bunkai_get_test_automation_status: the reader (status + history).
--
-- AUTHORIZATION (ADR-0012, rpc-authorization.md section 4).
--   Writer: SECURITY DEFINER with p_actor_user_id, like every Test writer: the
--   API route uses the admin client and PAT callers have no auth.uid(). Actor
--   bind at step 0, workspace write gate (member, admin, owner; the live
--   membership row, so a role downgraded mid-session is refused) before any
--   lock, then the Test row FOR UPDATE so concurrent changes serialize and the
--   second entry's from equals the first entry's to. It returns only the Test
--   it was asked about. Execute: service_role only.
--   Reader: SECURITY DEFINER with p_actor_user_id, same contract as
--   bunkai_get_test_expanded (the Test page calls it with the cookie client).
--   Actor bind at step 0, read gate (any active member, P0002 otherwise, non
--   disclosing), and every returned row is scoped to p_test_id, whose
--   workspace is the one the gate checked. Execute: authenticated and
--   service_role.
--   qa_inspector_ro is revoked explicitly on both (0085 default privileges,
--   0086 rule).
--
-- Error codes: 42501 not a writer, P0002 missing / not visible Test, 45127
-- archived Test (BK-596), 45128 automation_status_invalid (new).
--
-- Additive and idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. History table
-- -----------------------------------------------------------------------------
create table if not exists public.test_automation_status_history (
  id            uuid primary key default gen_random_uuid(),
  seq           bigint generated always as identity,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  test_id       uuid not null references public.tests(id) on delete cascade,
  from_status   text not null check (from_status in ('manual-only', 'candidate', 'automated')),
  to_status     text not null check (to_status in ('manual-only', 'candidate', 'automated')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name    text not null,
  changed_at    timestamptz not null default now(),
  constraint test_automation_status_history_real_change check (from_status <> to_status)
);

comment on table public.test_automation_status_history is
  'BK-227: append-only history of tests.automation_status. One row per real change, written only by bunkai_set_test_automation_status.';
comment on column public.test_automation_status_history.seq is
  'BK-227: write order. Breaks a tie between two entries with the same changed_at.';
comment on column public.test_automation_status_history.actor_name is
  'BK-227: the author''s name when the change was made (own display name, else email). Kept when the author is deactivated or removed.';

create index if not exists test_automation_status_history_test_idx
  on public.test_automation_status_history (test_id, changed_at desc, seq desc);
create index if not exists test_automation_status_history_workspace_idx
  on public.test_automation_status_history (workspace_id);

alter table public.test_automation_status_history enable row level security;

drop policy if exists test_automation_status_history_select_workspace_member on public.test_automation_status_history;
create policy test_automation_status_history_select_workspace_member
  on public.test_automation_status_history
  for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

revoke all on public.test_automation_status_history from public, anon, authenticated, service_role;
grant select on public.test_automation_status_history to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke insert, update, delete, truncate on public.test_automation_status_history from qa_inspector_rw;
  end if;
end;
$$;

create or replace function public.bunkai_guard_automation_status_history_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'automation_status_history_immutable' using errcode = '42501';
end;
$$;

revoke execute on function public.bunkai_guard_automation_status_history_immutable() from public, anon, authenticated;

drop trigger if exists test_automation_status_history_immutable on public.test_automation_status_history;
create trigger test_automation_status_history_immutable
  before update on public.test_automation_status_history
  for each row
  execute function public.bunkai_guard_automation_status_history_immutable();

-- -----------------------------------------------------------------------------
-- 2. Guard on tests.automation_status
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_guard_test_automation_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Runs as the caller: the DEFINER writer arrives as the function owner, a
  -- PostgREST request as anon, authenticated or service_role. Only a request
  -- is refused.
  if current_user not in ('authenticated', 'anon', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.automation_status is distinct from 'manual-only' then
      raise exception 'automation_status_read_only' using errcode = '42501';
    end if;
  elsif old.automation_status is distinct from new.automation_status then
    raise exception 'automation_status_read_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.bunkai_guard_test_automation_status() from public, anon, authenticated;

drop trigger if exists tests_guard_automation_status on public.tests;
create trigger tests_guard_automation_status
  before insert or update on public.tests
  for each row
  execute function public.bunkai_guard_test_automation_status();

-- -----------------------------------------------------------------------------
-- 3. Writer
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_set_test_automation_status(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_status        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_current      text;
  v_archived_at  timestamptz;
  v_actor_name   text;
  v_entry        public.test_automation_status_history;
begin
  -- 0. Actor bind, before any table read.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- Member, admin or owner, read from the live membership row.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  if p_status is null or p_status not in ('manual-only', 'candidate', 'automated') then
    raise exception 'automation_status_invalid' using errcode = '45128';
  end if;

  -- FOR UPDATE: a concurrent change waits here and then reads the status the
  -- first one wrote, so its entry's from equals the first entry's to.
  select automation_status, archived_at
    into v_current, v_archived_at
    from public.tests
    where id = p_test_id
    for update;

  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- The current status selected again: nothing changes, no entry.
  if p_status = v_current then
    return jsonb_build_object(
      'test_id', p_test_id,
      'automation_status', v_current,
      'changed', false,
      'entry', null
    );
  end if;

  -- The version is the lock of the chain, tags and title; the status is
  -- independent of them, so it is not bumped.
  update public.tests
    set automation_status = p_status
    where id = p_test_id;

  select coalesce(
           nullif(btrim(u.raw_app_meta_data ->> 'display_name'), ''),
           nullif(btrim(u.email::text), '')
         )
    into v_actor_name
    from auth.users u
    where u.id = p_actor_user_id;

  insert into public.test_automation_status_history
    (workspace_id, test_id, from_status, to_status, actor_user_id, actor_name)
  values
    (v_workspace_id, p_test_id, v_current, p_status, p_actor_user_id, coalesce(v_actor_name, 'Former member'))
  returning * into v_entry;

  return jsonb_build_object(
    'test_id', p_test_id,
    'automation_status', p_status,
    'changed', true,
    'entry', jsonb_build_object(
      'id', v_entry.id,
      'from_status', v_entry.from_status,
      'to_status', v_entry.to_status,
      'actor_user_id', v_entry.actor_user_id,
      'actor_name', v_entry.actor_name,
      'changed_at', v_entry.changed_at
    )
  );
end;
$$;

revoke execute on function public.bunkai_set_test_automation_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bunkai_set_test_automation_status(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Reader
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_get_test_automation_status(
  p_actor_user_id uuid,
  p_test_id       uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status       text;
  v_history      jsonb;
begin
  -- 0. Actor bind, before any table read.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  select workspace_id, automation_status
    into v_workspace_id, v_status
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- Any active member reads; anyone else gets the same P0002 as a missing Test.
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', h.id,
             'from_status', h.from_status,
             'to_status', h.to_status,
             'actor_user_id', h.actor_user_id,
             'actor_name', h.actor_name,
             'changed_at', h.changed_at
           )
           order by h.changed_at desc, h.seq desc
         ), '[]'::jsonb)
    into v_history
    from public.test_automation_status_history h
    where h.test_id = p_test_id;

  return jsonb_build_object(
    'test_id', p_test_id,
    'automation_status', v_status,
    'history', v_history
  );
end;
$$;

revoke execute on function public.bunkai_get_test_automation_status(uuid, uuid) from public, anon;
grant execute on function public.bunkai_get_test_automation_status(uuid, uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_set_test_automation_status(uuid, uuid, text) from qa_inspector_ro;
    revoke all on function public.bunkai_get_test_automation_status(uuid, uuid) from qa_inspector_ro;
  end if;
end;
$$;
