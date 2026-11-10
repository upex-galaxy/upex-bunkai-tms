-- ============================================================================
-- 0123_chat_mentions
--
-- BK-217 — Team Chat: mention a teammate to get their attention (builds on
-- 0104 BK-215, 0105 BK-219 and the BK-209 notifications inbox, 0053/0107).
--
-- Decisions (AI Product Owner D1-D6 and AI Tech Lead T1-T7, BK-217 Jira
-- comments of 2026-11-10; implemented here, not re-decided):
--   * T1: mentions live in `chat_message_mentions` (message_id, workspace_id,
--     mentioned_user_id), the source of truth for pills and notifications. The
--     message body keeps the readable "@Name" text. RLS select = workspace
--     member, exactly like the messages; no client insert/update/delete.
--   * T2: a SECURITY DEFINER RPC wraps message send and message edit. The
--     actor is auth.uid(), never a parameter. Mention ids are validated
--     server-side: an id that is not an ACTIVE member of the message's
--     workspace is dropped silently (no error, so membership never leaks),
--     duplicates collapse, and at most 50 ids are considered.
--   * Self-mention: the author's own mention row is kept (the pill renders
--     with the "self" style) but never produces a notification.
--   * T3: one inbox notification per mentioned member per message, event_type
--     `mentions` (the type 0062 reserved for this story), entity_type
--     `chat_message`, entity_id = message id, payload {message_id, channel_id,
--     channel_name, author_user_id, author_name, snippet (140 chars)}.
--     Mentions are always delivered in-app (D4): no preference gate, the
--     `mentions` preference cells stay locked as 0062 left them.
--   * T4: an edit diffs old vs new mention set. Only ADDED members are
--     notified, removed mentions delete their row (past notifications stay),
--     re-saving the same set never re-notifies. Deleting a message (tombstone)
--     removes its mention rows.
--   * T5: bunkai_chat_resolve_authors also resolves mentioned users, so a
--     member who left still shows a name on old pills.
--
-- Authorization (ADR-0012-rpc-authorization-invariant, rpc-authorization.md):
--   * bunkai_chat_send_message / bunkai_chat_edit_message: step 0 binds
--     auth.uid() (null -> not_workspace_member), then the workspace membership
--     assert, then the write-capability assert (a viewer cannot send or edit),
--     before any table read of chat data. `p_workspace_id` / `p_message_id`
--     are scope parameters: the workspace is asserted, the message must belong
--     to a workspace the caller is a member of, and every row leaving the
--     function is the message the function itself wrote (result scoping).
--     `p_mention_ids` is untrusted input and is filtered to active members of
--     THAT workspace before it touches a table.
--   * bunkai_chat_sync_mentions is an internal helper: it takes an identity
--     set and writes notifications, so it is callable by NO client role (revoke
--     from public, anon, authenticated, service_role); only the two DEFINER
--     functions above, running as the owner, reach it.
--   * qa_inspector_ro must not hold EXECUTE on write-capable functions: the
--     0085 default privileges re-grant it to every freshly created function,
--     so a guarded revoke follows (BK-223 lesson). Applies to every function
--     created or re-created here.
--
-- Compatibility: bunkai_chat_edit_message gains a third, defaulted parameter
-- and one result column (mention_user_ids). A two-argument call keeps working
-- and leaves the mention set untouched (null = no change). The old two-argument
-- signature is dropped first: the result row type changes, which
-- `create or replace` cannot do.
-- Idempotent: every statement is guarded or `create or replace`; a re-apply is
-- a no-op.
-- ============================================================================

-- ============================================================================
-- 1. chat_message_mentions
-- ============================================================================

create table if not exists public.chat_message_mentions (
  message_id        uuid not null references public.chat_messages(id) on delete cascade,
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (message_id, mentioned_user_id)
);

create index if not exists chat_message_mentions_workspace_user_idx
  on public.chat_message_mentions (workspace_id, mentioned_user_id);

alter table public.chat_message_mentions enable row level security;

drop policy if exists chat_message_mentions_select_member on public.chat_message_mentions;
create policy chat_message_mentions_select_member on public.chat_message_mentions
  for select using ( public.bunkai_is_workspace_member(workspace_id) );

-- Written only by the DEFINER functions below.
revoke all on table public.chat_message_mentions from anon;
revoke insert, update, delete, truncate on table public.chat_message_mentions from authenticated;

-- ============================================================================
-- 2. bunkai_chat_sync_mentions — internal helper (no client role can call it)
-- ============================================================================
--
-- Makes the message's mention set equal to the validated `p_ids`, and
-- notifies only the members that were not already mentioned. The caller has
-- already asserted that the actor may write in the message's workspace.

create or replace function public.bunkai_chat_sync_mentions(p_message_id uuid, p_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg          public.chat_messages%rowtype;
  v_valid        uuid[];
  v_added        uuid;
  v_author_name  text;
  v_channel_name text;
  v_snippet      text;
begin
  select * into v_msg from public.chat_messages m where m.id = p_message_id;
  if not found then
    return array[]::uuid[];
  end if;

  -- Untrusted ids -> distinct, active members of THIS workspace, capped.
  select coalesce(array_agg(x.uid), array[]::uuid[])
    into v_valid
    from (
      select distinct i.uid
        from unnest(coalesce(p_ids, array[]::uuid[])) as i(uid)
       where exists (
         select 1 from public.workspace_members wm
          where wm.workspace_id = v_msg.workspace_id
            and wm.user_id = i.uid
            and wm.status = 'active'
       )
       order by i.uid
       limit 50
    ) x;

  delete from public.chat_message_mentions cmm
   where cmm.message_id = v_msg.id
     and not (cmm.mentioned_user_id = any (v_valid));

  select (
           select string_agg(upper(left(w, 1)) || substr(w, 2), ' ')
             from unnest(regexp_split_to_array(split_part(u.email::text, '@', 1), '[._\-+\s]+')) as w
            where w <> ''
         )
    into v_author_name
    from auth.users u where u.id = v_msg.author_user_id;
  v_author_name := coalesce(nullif(v_author_name, ''), 'Former member');

  select c.name into v_channel_name
    from public.chat_channels c where c.id = v_msg.channel_id;

  v_snippet := left(regexp_replace(v_msg.body, '\s+', ' ', 'g'), 140);

  for v_added in
    insert into public.chat_message_mentions (message_id, workspace_id, mentioned_user_id)
    select v_msg.id, v_msg.workspace_id, v.uid
      from unnest(v_valid) as v(uid)
    on conflict (message_id, mentioned_user_id) do nothing
    returning mentioned_user_id
  loop
    -- No self-notification: the pill exists, the inbox row does not.
    if v_added is distinct from v_msg.author_user_id then
      insert into public.notifications (
        workspace_id, recipient_user_id, event_type, entity_type, entity_id, payload
      )
      values (
        v_msg.workspace_id, v_added, 'mentions', 'chat_message', v_msg.id,
        jsonb_build_object(
          'message_id', v_msg.id,
          'channel_id', v_msg.channel_id,
          'channel_name', coalesce(v_channel_name, 'general'),
          'author_user_id', v_msg.author_user_id,
          'author_name', v_author_name,
          'snippet', v_snippet
        )
      );
    end if;
  end loop;

  return v_valid;
end;
$$;

revoke all on function public.bunkai_chat_sync_mentions(uuid, uuid[]) from public, anon, authenticated, service_role;

-- ============================================================================
-- 3. bunkai_chat_send_message — send + mentions in one transaction
-- ============================================================================

create or replace function public.bunkai_chat_send_message(
  p_workspace_id uuid,
  p_body text,
  p_mention_ids uuid[] default null
)
returns table(
  id uuid, seq bigint, channel_id uuid, workspace_id uuid, author_user_id uuid,
  body text, created_at timestamptz, edited_at timestamptz, deleted_at timestamptz,
  mention_user_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_body    text := btrim(coalesce(p_body, ''));
  v_channel uuid;
  v_msg     public.chat_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not_workspace_member' using errcode = '42501';
  end if;
  if not public.bunkai_is_workspace_member(p_workspace_id) then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(p_workspace_id) then
    raise exception 'read_only' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 4000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select c.id into v_channel
    from public.chat_channels c
   where c.workspace_id = p_workspace_id and c.kind = 'general';
  if v_channel is null then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  insert into public.chat_messages (channel_id, workspace_id, author_user_id, body)
  values (v_channel, p_workspace_id, v_uid, v_body)
  returning * into v_msg;

  perform public.bunkai_chat_sync_mentions(v_msg.id, p_mention_ids);

  return query
    select m.id, m.seq, m.channel_id, m.workspace_id, m.author_user_id,
           m.body, m.created_at, m.edited_at, m.deleted_at,
           coalesce((select array_agg(x.mentioned_user_id order by x.mentioned_user_id)
                       from public.chat_message_mentions x where x.message_id = m.id),
                    array[]::uuid[])
      from public.chat_messages m where m.id = v_msg.id;
end;
$$;

-- ============================================================================
-- 4. bunkai_chat_edit_message — restated from 0105 + the mention diff
-- ============================================================================

drop function if exists public.bunkai_chat_edit_message(uuid, text);

create or replace function public.bunkai_chat_edit_message(
  p_message_id uuid,
  p_body text,
  p_mention_ids uuid[] default null
)
returns table(
  id uuid, seq bigint, channel_id uuid, workspace_id uuid, author_user_id uuid,
  body text, created_at timestamptz, edited_at timestamptz, deleted_at timestamptz,
  mention_user_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.chat_messages%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_msg from public.chat_messages m where m.id = p_message_id;
  if not found or not public.bunkai_is_workspace_member(v_msg.workspace_id) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  if v_msg.author_user_id is distinct from auth.uid() then
    raise exception 'not_author' using errcode = '42501';
  end if;
  if not public.bunkai_can_write_workspace(v_msg.workspace_id) then
    raise exception 'read_only' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'message_deleted' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 4000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if clock_timestamp() - v_msg.created_at > interval '15 minutes' then
    raise exception 'edit_window_closed' using errcode = 'P0001';
  end if;

  if v_body is distinct from v_msg.body then
    update public.chat_messages m
       set body = v_body, edited_at = clock_timestamp()
     where m.id = p_message_id;
  end if;

  -- null = "mentions unchanged" (a caller that predates BK-217); an array is
  -- the complete new set and is diffed against the stored one.
  if p_mention_ids is not null then
    perform public.bunkai_chat_sync_mentions(p_message_id, p_mention_ids);
  end if;

  return query
    select m.id, m.seq, m.channel_id, m.workspace_id, m.author_user_id,
           m.body, m.created_at, m.edited_at, m.deleted_at,
           coalesce((select array_agg(x.mentioned_user_id order by x.mentioned_user_id)
                       from public.chat_message_mentions x where x.message_id = m.id),
                    array[]::uuid[])
      from public.chat_messages m where m.id = p_message_id;
end;
$$;

-- ============================================================================
-- 5. bunkai_chat_delete_message — restated from 0105 + mention cleanup
-- ============================================================================

create or replace function public.bunkai_chat_delete_message(p_message_id uuid)
returns table(
  id uuid, seq bigint, channel_id uuid, workspace_id uuid, author_user_id uuid,
  body text, created_at timestamptz, edited_at timestamptz, deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.chat_messages%rowtype;
begin
  select * into v_msg from public.chat_messages m where m.id = p_message_id;
  if not found or not public.bunkai_is_workspace_member(v_msg.workspace_id) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  if v_msg.author_user_id is distinct from auth.uid()
     and not public.bunkai_is_workspace_admin(v_msg.workspace_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_msg.deleted_at is null then
    update public.chat_messages m
       set body = '', deleted_at = clock_timestamp()
     where m.id = p_message_id;
  end if;

  -- The tombstone has an empty body: its pills go with it (past
  -- notifications stay, they resolve to "message no longer available").
  delete from public.chat_message_mentions cmm where cmm.message_id = p_message_id;

  return query
    select m.id, m.seq, m.channel_id, m.workspace_id, m.author_user_id,
           m.body, m.created_at, m.edited_at, m.deleted_at
      from public.chat_messages m where m.id = p_message_id;
end;
$$;

-- ============================================================================
-- 6. bunkai_chat_resolve_authors — restated from 0104, also resolves the
--    users mentioned in this workspace's messages
-- ============================================================================

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
       and (
         exists (
           select 1 from public.chat_messages m
            where m.workspace_id = p_workspace_id and m.author_user_id = u.id
         )
         or exists (
           select 1 from public.chat_message_mentions cmm
            where cmm.workspace_id = p_workspace_id and cmm.mentioned_user_id = u.id
         )
       );
end;
$$;

-- ============================================================================
-- 7. bunkai_list_notifications — restated from 0057 + the chat_message arm
-- ============================================================================
--
-- Only change: `entity_available` resolves `chat_message` (see the CASE).
-- Stays SECURITY INVOKER, so the probe runs under the caller's RLS.

create or replace function public.bunkai_list_notifications(
  p_workspace_id      uuid,
  p_limit             int default 30,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit       int;
  v_items       jsonb;
  v_fetched     int;
  v_unread      int;
  v_next_cursor jsonb;
  v_last        jsonb;
begin
  -- 1. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  -- 2. Cursor backstop: the keyset position is a PAIR. Exactly one half is
  --    not a position — raise rather than silently degrade to the first page.
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'notification_cursor_invalid' using errcode = '45400';
  end if;

  -- 3-4. One keyset page (limit+1 probe) + per-row entity availability.
  with page as (
    select n.id, n.workspace_id, n.event_type, n.entity_type, n.entity_id,
           n.payload, n.read_at, n.created_at
      from public.notifications n
      where n.workspace_id = p_workspace_id
        and (
          p_cursor_created_at is null
          or p_cursor_id is null
          or (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
        )
      order by n.created_at desc, n.id desc
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
                 'workspace_id', k.workspace_id,
                 'event_type', k.event_type,
                 'entity_type', k.entity_type,
                 'entity_id', k.entity_id,
                 'payload', k.payload,
                 'read_at', k.read_at,
                 'created_at', k.created_at,
                 'entity_available', case k.entity_type
                   when 'run' then exists (select 1 from public.runs r where r.id = k.entity_id)
                   when 'test' then exists (select 1 from public.tests t where t.id = k.entity_id)
                   -- BK-212 Slice 2: a bug now has an addressable deep link
                   -- (entity-routes.ts's `bug` case, below `run_id` in
                   -- payload) — resolves the same way run/test do, RLS-scoped
                   -- for free via bugs_select_workspace_member.
                   when 'bug' then exists (select 1 from public.bugs b where b.id = k.entity_id)
                   -- BK-217: a chat mention resolves while its message row is
                   -- still visible to the caller. A tombstone still counts:
                   -- the chat opens on it and shows "message no longer
                   -- available" there, rather than the inbox dead-ending.
                   when 'chat_message' then exists (select 1 from public.chat_messages cm where cm.id = k.entity_id)
                   else false
                 end
               ) order by k.created_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- next_cursor: NULL when the probe row was absent (no further page).
  -- Otherwise the (created_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  -- 5. unread_count: RLS-scoped the same way the list page is (recipient +
  --    membership + retention), independent of pagination.
  select count(*) into v_unread
    from public.notifications n
    where n.workspace_id = p_workspace_id
      and n.read_at is null;

  return jsonb_build_object('items', v_items, 'unread_count', v_unread, 'next_cursor', v_next_cursor);
end;
$$;

revoke execute on function public.bunkai_list_notifications(uuid, int, timestamptz, uuid) from public, anon;
grant execute on function public.bunkai_list_notifications(uuid, int, timestamptz, uuid) to authenticated, service_role;

-- ============================================================================
-- 8. Grants (ADR-0012-rpc-authorization-invariant: nothing client-callable
--    beyond the actor-bound RPCs; the read-only QA role holds no write RPC)
-- ============================================================================

revoke all on function public.bunkai_chat_send_message(uuid, text, uuid[]) from public, anon;
revoke all on function public.bunkai_chat_edit_message(uuid, text, uuid[]) from public, anon;
revoke all on function public.bunkai_chat_delete_message(uuid) from public, anon;
grant execute on function public.bunkai_chat_send_message(uuid, text, uuid[]) to authenticated, service_role;
grant execute on function public.bunkai_chat_edit_message(uuid, text, uuid[]) to authenticated, service_role;
grant execute on function public.bunkai_chat_delete_message(uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_chat_send_message(uuid, text, uuid[]) from qa_inspector_ro;
    revoke all on function public.bunkai_chat_edit_message(uuid, text, uuid[]) from qa_inspector_ro;
    revoke all on function public.bunkai_chat_delete_message(uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_chat_sync_mentions(uuid, uuid[]) from qa_inspector_ro;
  end if;
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke all on function public.bunkai_chat_sync_mentions(uuid, uuid[]) from qa_inspector_rw;
  end if;
end
$$;
