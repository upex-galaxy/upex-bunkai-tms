-- ============================================================================
-- 0105_team_chat_edit_delete
--
-- BK-219 — Team Chat: edit and delete my own messages (builds on 0104).
--
-- Decisions (AI Tech Lead, BK-219 Jira comment):
--   * Soft delete + body scrub: a deleted message keeps its row (tombstone,
--     reply context and seq order survive) but `body` is overwritten with ''
--     so the original text is gone for every reader, Realtime payload included.
--   * Tombstone is identical for author and moderator deletion (PO ratification
--     C5): no `deleted_by` column is stored, so nothing in a row or a Realtime
--     payload can reveal who removed it.
--   * Writes go ONLY through two SECURITY DEFINER RPCs that assert ownership,
--     role and the 15-minute edit window server-side. Direct UPDATE/DELETE on
--     chat_messages stays revoked from clients (0104).
--   * Edits and deletes propagate through the existing Realtime publication as
--     UPDATE events (RLS-gated like SELECT).
-- ============================================================================

alter table public.chat_messages
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz;

-- A tombstone has an empty body; a live message keeps the 1..4000 rule.
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_body_live_check;
alter table public.chat_messages add constraint chat_messages_body_live_check
  check (
    (deleted_at is not null and body = '')
    or (deleted_at is null and char_length(btrim(body)) between 1 and 4000)
  );

-- Edit: author only, live message only, within 15 minutes of sending, and the
-- caller must still be allowed to write (a demoted viewer cannot edit).
create or replace function public.bunkai_chat_edit_message(p_message_id uuid, p_body text)
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

  return query
    select m.id, m.seq, m.channel_id, m.workspace_id, m.author_user_id,
           m.body, m.created_at, m.edited_at, m.deleted_at
      from public.chat_messages m where m.id = p_message_id;
end;
$$;

-- Delete: the author at any time, or any admin/owner of the workspace
-- (moderation). Idempotent. The body is scrubbed; nobody can tell who deleted.
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

  return query
    select m.id, m.seq, m.channel_id, m.workspace_id, m.author_user_id,
           m.body, m.created_at, m.edited_at, m.deleted_at
      from public.chat_messages m where m.id = p_message_id;
end;
$$;

revoke all on function public.bunkai_chat_edit_message(uuid, text) from public, anon;
revoke all on function public.bunkai_chat_delete_message(uuid) from public, anon;
grant execute on function public.bunkai_chat_edit_message(uuid, text) to authenticated, service_role;
grant execute on function public.bunkai_chat_delete_message(uuid) to authenticated, service_role;
