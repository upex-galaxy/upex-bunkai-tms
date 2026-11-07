-- 0120_workspace_jira_connection_activity.sql — BK-1619: audit the Jira connection
--
-- Connecting, changing and disconnecting a workspace's Jira connection (0119) now
-- write an activity_log row in the SAME transaction as the change.
--
-- Events (entity_type 'workspace_jira_connection', entity_id = the workspace id):
--   jira_connection.connected     first save (no stored connection yet)
--   jira_connection.changed       a save on an existing connection that changed
--                                 the site, the email or the token (a save that
--                                 changes nothing writes nothing)
--   jira_connection.disconnected  the delete removed a stored connection
-- Payload: {"site_host": "<name>.atlassian.net"} and nothing else. NEVER the
-- token, the Vault secret id or the email.
--
-- Changes (everything else is copied forward unchanged):
--   * bunkai_upsert_workspace_jira_connection   body of 0119 + audit insert
--   * bunkai_delete_workspace_jira_connection   body of 0119 + audit insert
--   * bunkai_list_activity                      body of 0117 + the three events
--                                               in the backstop allowlist and a
--                                               positive {site_host} projection
-- Signatures, SECURITY INVOKER, search_path = '' and the service_role-only grants
-- are as in 0119. activity_log has no CHECK on entity_type or action, so no
-- constraint is widened. Idempotent: create or replace plus idempotent grants.

-- ============================================================================
-- 1. bunkai_upsert_workspace_jira_connection (+ audit)
-- ============================================================================

create or replace function public.bunkai_upsert_workspace_jira_connection(
  p_actor_user_id uuid,
  p_workspace_id  uuid,
  p_site_url      text,
  p_email         text,
  p_api_token     text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role      text;
  v_site      text;
  v_email     text;
  v_token     text;
  v_old       public.workspace_jira_connections%rowtype;
  v_had_row   boolean;
  v_secret_id uuid;
  v_row       public.workspace_jira_connections%rowtype;
  v_action    text;
begin
  -- 0. Actor bind (see 0091 step 0).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  -- 1. Live workspace and the actor's active role.
  select wm.role
    into v_role
    from public.workspaces w
    join public.workspace_members wm
      on wm.workspace_id = w.id
     and wm.user_id = p_actor_user_id
     and wm.status = 'active'
   where w.id = p_workspace_id
     and w.deleted_at is null;

  if v_role is null then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 1b. Serialise every save of this workspace's connection.
  perform pg_advisory_xact_lock(hashtextextended('bunkai_workspace_jira_connection:' || p_workspace_id::text, 0));

  -- 2. Normalise and validate.
  v_site := regexp_replace(lower(btrim(coalesce(p_site_url, ''), E' \t\r\n')), '/+$', '');
  if v_site !~ '^https://[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$' then
    raise exception 'invalid_site_url' using errcode = '45420';
  end if;

  v_email := btrim(coalesce(p_email, ''), E' \t\r\n');
  if char_length(v_email) < 3
     or char_length(v_email) > 254
     or v_email not like '%_@_%'
     or v_email ~ '[\s:]' then
    raise exception 'invalid_email' using errcode = '45421';
  end if;

  v_token := case
               when p_api_token is null then null
               else btrim(p_api_token, E' \t\r\n')
             end;
  if v_token is not null and (char_length(v_token) < 1 or char_length(v_token) > 2048) then
    raise exception 'token_required' using errcode = '45422';
  end if;

  -- 3. Stored row (locked).
  select * into v_old
    from public.workspace_jira_connections c
   where c.workspace_id = p_workspace_id
     for update;
  v_had_row := found;

  if v_token is null and (not v_had_row or v_old.site_url is distinct from v_site) then
    raise exception 'token_required' using errcode = '45422';
  end if;

  -- 4. Vault. The secret value never leaves this function.
  if v_token is not null then
    if v_had_row then
      perform vault.update_secret(v_old.token_secret_id, v_token);
      v_secret_id := v_old.token_secret_id;
    else
      v_secret_id := vault.create_secret(
        v_token,
        'jira_ws_' || p_workspace_id::text,
        'Jira API token'
      );
    end if;
  else
    v_secret_id := v_old.token_secret_id;
  end if;

  -- 5. Upsert.
  insert into public.workspace_jira_connections
    (workspace_id, site_url, email, token_secret_id, updated_by)
  values
    (p_workspace_id, v_site, v_email, v_secret_id, p_actor_user_id)
  on conflict (workspace_id) do update
    set site_url        = excluded.site_url,
        email           = excluded.email,
        token_secret_id = excluded.token_secret_id,
        updated_by      = excluded.updated_by,
        updated_at      = now()
  returning * into v_row;

  -- 6. Audit (BK-1619): connect, or a save that really changed something. A
  --    save that changes nothing writes nothing. The payload carries the site
  --    HOST only: never the token, the secret id or the email.
  v_action := case
                when not v_had_row then 'jira_connection.connected'
                when v_token is not null
                  or v_old.site_url is distinct from v_row.site_url
                  or v_old.email is distinct from v_row.email then 'jira_connection.changed'
                else null
              end;
  if v_action is not null then
    insert into public.activity_log
      (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values
      (p_workspace_id, p_actor_user_id, 'workspace_jira_connection', p_workspace_id, v_action,
       jsonb_build_object('site_host', regexp_replace(v_row.site_url, '^https://', '')));
  end if;

  return jsonb_build_object(
    'site_url', v_row.site_url,
    'email', v_row.email,
    'updated_at', v_row.updated_at,
    'updated_by', v_row.updated_by
  );
end;
$$;

-- ============================================================================
-- 2. bunkai_delete_workspace_jira_connection (+ audit)
-- ============================================================================

create or replace function public.bunkai_delete_workspace_jira_connection(
  p_actor_user_id uuid,
  p_workspace_id  uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role    text;
  v_deleted int;
  v_site    text;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  select wm.role
    into v_role
    from public.workspaces w
    join public.workspace_members wm
      on wm.workspace_id = w.id
     and wm.user_id = p_actor_user_id
     and wm.status = 'active'
   where w.id = p_workspace_id
     and w.deleted_at is null;

  if v_role is null then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bunkai_workspace_jira_connection:' || p_workspace_id::text, 0));

  -- The BEFORE DELETE trigger removes the Vault secret.
  delete from public.workspace_jira_connections c
   where c.workspace_id = p_workspace_id
  returning c.site_url into v_site;
  get diagnostics v_deleted = row_count;

  -- Audit (BK-1619): only a real disconnect. Site host only, never a secret.
  if v_deleted > 0 then
    insert into public.activity_log
      (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values
      (p_workspace_id, p_actor_user_id, 'workspace_jira_connection', p_workspace_id,
       'jira_connection.disconnected',
       jsonb_build_object('site_host', regexp_replace(v_site, '^https://', '')));
  end if;

  return v_deleted > 0;
end;
$$;

-- ============================================================================
-- 3. bunkai_list_activity (the three events join the feed)
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
      'jira_connection.connected', 'jira_connection.changed', 'jira_connection.disconnected'
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

revoke execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) from public, anon;
grant execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) to authenticated, service_role;

-- ============================================================================
-- Grants (re-stated; same as 0119)
-- ============================================================================

revoke all on function public.bunkai_upsert_workspace_jira_connection(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.bunkai_delete_workspace_jira_connection(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.bunkai_upsert_workspace_jira_connection(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.bunkai_delete_workspace_jira_connection(uuid, uuid)
  to service_role;

-- INVOKER runs with service_role's own privileges (all idempotent).
grant select on public.workspaces, public.workspace_members to service_role;
grant insert on public.activity_log to service_role;

-- 0088 mechanism: the 0085 default privilege hands every new function to BOTH QA
-- roles. CREATE OR REPLACE keeps existing ACLs, but the revokes are re-stated.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_upsert_workspace_jira_connection(uuid, uuid, text, text, text) from qa_inspector_ro;
    revoke all on function public.bunkai_delete_workspace_jira_connection(uuid, uuid) from qa_inspector_ro;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('authenticated', 'public.bunkai_upsert_workspace_jira_connection(uuid,uuid,text,text,text)', 'EXECUTE'); -- false
--   select has_function_privilege('service_role',  'public.bunkai_delete_workspace_jira_connection(uuid,uuid)', 'EXECUTE');                -- true
--   select pg_get_functiondef('public.bunkai_upsert_workspace_jira_connection(uuid,uuid,text,text,text)'::regprocedure) like '%jira_connection.connected%'; -- true
