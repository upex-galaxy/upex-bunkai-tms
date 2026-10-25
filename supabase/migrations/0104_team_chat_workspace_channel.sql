-- ============================================================================
-- 0104_team_chat_workspace_channel
--
-- BK-215 — Team Chat: the workspace general channel (cluster root of BK-210).
--
-- Decisions (AI Tech Lead, BK-215 Jira comment):
--   * Channel model: a real `chat_channels` table with `kind = 'general'`
--     (one per workspace, created by trigger + backfilled), NOT a special-case
--     "no channel row" design — BK-216 (per-project channels) adds a `project`
--     kind to the same table instead of reshaping messages.
--   * Ordering: `chat_messages.seq` is a bigint identity — a total order that
--     is stable under concurrent sends (created_at alone can tie). Pagination
--     and reconnect catch-up are both keyset on `seq`.
--   * Access: visibility = active membership (RLS select); write = member,
--     admin or owner via bunkai_can_write_workspace (viewers are read-only).
--     No UPDATE/DELETE policy — edit/delete is BK-219.
--   * Names: auth.users is not exposed to PostgREST, so the roster (with the
--     email used to derive a display name) comes from a membership-asserting
--     SECURITY DEFINER RPC, the ADR-0011 pattern.
--   * Realtime: chat_messages joins the supabase_realtime publication; RLS
--     gates postgres_changes delivery like SELECT (ADR-0010).
-- ============================================================================

create table if not exists public.chat_channels (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  kind          text not null default 'general' check (kind in ('general')),
  name          text not null default 'general',
  created_at    timestamptz not null default now(),
  unique (id, workspace_id)
);

-- One general channel per workspace.
create unique index if not exists chat_channels_workspace_general_uidx
  on public.chat_channels (workspace_id) where kind = 'general';

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,
  channel_id      uuid not null,
  workspace_id    uuid not null,
  author_user_id  uuid references auth.users(id) on delete set null,
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default clock_timestamp(),
  foreign key (channel_id, workspace_id)
    references public.chat_channels (id, workspace_id) on delete cascade
);

create unique index if not exists chat_messages_seq_uidx on public.chat_messages (seq);
create index if not exists chat_messages_channel_seq_idx
  on public.chat_messages (channel_id, seq desc);
create index if not exists chat_messages_workspace_idx on public.chat_messages (workspace_id);

alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_channels_select_member on public.chat_channels;
create policy chat_channels_select_member on public.chat_channels
  for select using ( public.bunkai_is_workspace_member(workspace_id) );

drop policy if exists chat_messages_select_member on public.chat_messages;
create policy chat_messages_select_member on public.chat_messages
  for select using ( public.bunkai_is_workspace_member(workspace_id) );

drop policy if exists chat_messages_insert_writer on public.chat_messages;
create policy chat_messages_insert_writer on public.chat_messages
  for insert with check (
    author_user_id = auth.uid()
    and public.bunkai_can_write_workspace(workspace_id)
  );

-- Channels are created only by the trigger below; messages are append-only in
-- this story. Table grants stay at the Supabase defaults narrowed to what the
-- policies allow.
revoke all on table public.chat_channels from anon;
revoke all on table public.chat_messages from anon;
revoke insert, update, delete on table public.chat_channels from authenticated;
revoke update, delete on table public.chat_messages from authenticated;

-- General channel is created automatically with the workspace and cannot be
-- deleted or renamed by clients (no write policies on chat_channels).
create or replace function public.bunkai_create_general_chat_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_channels (workspace_id, kind, name)
  values (new.id, 'general', 'general')
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.bunkai_create_general_chat_channel() from public, anon, authenticated;

drop trigger if exists workspaces_create_general_chat_channel on public.workspaces;
create trigger workspaces_create_general_chat_channel
  after insert on public.workspaces
  for each row execute function public.bunkai_create_general_chat_channel();

-- Backfill existing workspaces.
insert into public.chat_channels (workspace_id, kind, name)
select w.id, 'general', 'general' from public.workspaces w
where not exists (
  select 1 from public.chat_channels c where c.workspace_id = w.id and c.kind = 'general'
);

-- Roster: active members with role + email (display name derived client-side).
create or replace function public.bunkai_chat_roster(p_workspace_id uuid)
returns table(user_id uuid, email text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.bunkai_is_workspace_member(p_workspace_id) then
    raise exception 'not_workspace_member' using errcode = '42501';
  end if;

  return query
    select wm.user_id, u.email::text, wm.role
      from public.workspace_members wm
      join auth.users u on u.id = wm.user_id
     where wm.workspace_id = p_workspace_id
       and wm.status = 'active'
     order by wm.joined_at asc, wm.user_id asc;
end;
$$;

revoke all on function public.bunkai_chat_roster(uuid) from public, anon;
grant execute on function public.bunkai_chat_roster(uuid) to authenticated, service_role;

-- Author emails for message rendering, including authors who have since left
-- (history of a workspace stays visible to its current members).
create or replace function public.bunkai_chat_resolve_authors(p_workspace_id uuid, p_user_ids uuid[])
returns table(user_id uuid, email text)
language plpgsql
stable
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
       and exists (
         select 1 from public.chat_messages m
          where m.workspace_id = p_workspace_id and m.author_user_id = u.id
       );
end;
$$;

revoke all on function public.bunkai_chat_resolve_authors(uuid, uuid[]) from public, anon;
grant execute on function public.bunkai_chat_resolve_authors(uuid, uuid[]) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
