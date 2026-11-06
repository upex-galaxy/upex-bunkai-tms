-- 0119_workspace_jira_connections.sql — BK-1170: a Jira connection per workspace
--
-- Replaces the deployment-wide Jira credentials (ATLASSIAN_URL / ATLASSIAN_EMAIL /
-- ATLASSIAN_API_TOKEN) with a connection owned by each workspace: site URL, email
-- and API token. The Jira import worker and the tracker-settings connection check
-- read it at run time; there is NO environment fallback.
--
-- This REVERSES BK-43 ruling 12177 D6 ("no credential in the database") for
-- workspace credentials only. The reason is tenancy: one deployment now serves many
-- workspaces, each with its own Jira site, so a deployment-level secret cannot
-- identify whose Jira to call. project_tracker_settings (0091) is unchanged and
-- still holds no secret.
--
-- WHY VAULT. The API token is stored in Supabase Vault (supabase_vault), which
-- encrypts it at rest with a key the database role never sees. This table keeps
-- only token_secret_id, an id into vault.secrets (intentionally NO foreign key:
-- the vault schema is not ours to reference). The token is write-only: no RPC
-- returns it to a client and no route echoes it. The single reader is
-- bunkai_get_workspace_jira_credentials, called by lib/jira/credentials.ts with the
-- admin client after the caller has been authorised.
--
-- ACCESS MODEL.
--   * Table: RLS enabled and NO client policy, every privilege revoked from public,
--     anon and authenticated. Only service_role (BYPASSRLS) reads or writes it.
--   * Writes: bunkai_upsert_workspace_jira_connection and
--     bunkai_delete_workspace_jira_connection, granted to service_role ONLY. Both
--     follow the ADR-0012 pattern of 0091: SECURITY INVOKER, search_path = '',
--     actor bind at step 0, live workspace plus ACTIVE role resolved in the
--     function, owner / admin required (42501), missing workspace and non-member
--     indistinguishable (P0002).
--   * Vault: service_role holds USAGE on schema vault, EXECUTE on
--     vault.create_secret / vault.update_secret and SELECT on
--     vault.decrypted_secrets. authenticated and anon hold nothing there.
--   * Cleanup: a BEFORE DELETE trigger (SECURITY DEFINER, owner postgres) deletes the
--     Vault secret, so removing a connection, or deleting its workspace (cascade),
--     never leaves an orphan secret behind.
--
-- Custom SQLSTATE codes (class 45xxx; 45400 notifications/0053, 4541x tracker/0091):
--   45420  invalid_site_url   (not https://<name>.atlassian.net after normalising)
--   45421  invalid_email      (empty, > 254 chars, no '@' shape, whitespace or ':')
--   45422  token_required     (no stored connection or the site changed, and no
--                              usable token was sent; also a token outside 1..2048)
--
-- Why a token is REQUIRED when the site changes: otherwise an admin could repoint
-- an already stored token at a different host and make the server send it there.
--
-- Qualification of QA roles (0085 / 0086 / 0088): the three functions are not
-- granted to qa_inspector_ro (explicit revoke below, 0088 mechanism). The table
-- gets the 0085 default privileges for qa_inspector_*, which are revoked here.

-- ============================================================================
-- 1. workspace_jira_connections
-- ============================================================================

create table if not exists public.workspace_jira_connections (
  workspace_id    uuid primary key references public.workspaces(id) on delete cascade,
  site_url        text not null
                    check (site_url ~ '^https://[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$'),
  email           text not null
                    check (email = btrim(email)
                           and char_length(email) between 3 and 254
                           and email like '%_@_%'),
  token_secret_id uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

drop trigger if exists workspace_jira_connections_set_updated_at on public.workspace_jira_connections;
create trigger workspace_jira_connections_set_updated_at
  before update on public.workspace_jira_connections
  for each row
  execute function public.bunkai_set_updated_at();

alter table public.workspace_jira_connections enable row level security;

-- No policy on purpose: a signed-in client can neither read nor write this table.
revoke all on public.workspace_jira_connections from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on public.workspace_jira_connections from qa_inspector_ro;
  end if;
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke all on public.workspace_jira_connections from qa_inspector_rw;
  end if;
end
$$;
grant select, insert, update, delete on public.workspace_jira_connections to service_role;

-- ============================================================================
-- 2. Purge the Vault secret together with the row
-- ============================================================================

create or replace function public.bunkai_workspace_jira_connections_purge_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.token_secret_id;
  return old;
end;
$$;

alter function public.bunkai_workspace_jira_connections_purge_secret() owner to postgres;

revoke execute on function public.bunkai_workspace_jira_connections_purge_secret()
  from public, anon, authenticated;

drop trigger if exists workspace_jira_connections_purge_secret on public.workspace_jira_connections;
create trigger workspace_jira_connections_purge_secret
  before delete on public.workspace_jira_connections
  for each row
  execute function public.bunkai_workspace_jira_connections_purge_secret();

-- ============================================================================
-- 3. bunkai_upsert_workspace_jira_connection — the single write path
-- ============================================================================
-- Order of operations:
--   0. Actor bind (auth.uid() is not null and differs from p_actor_user_id).
--   1. Resolve the live workspace and the actor's ACTIVE role. Missing workspace
--      or non-member -> P0002; a member below owner/admin -> 42501.
--   1b. Per-workspace advisory lock, taken only after authorization.
--   2. Normalise (btrim, lower-case, strip trailing slashes) and validate the site
--      (45420) and the email (45421).
--   3. Read the stored row FOR UPDATE. A token is required (45422) when no row
--      exists or the site changed; optional when only the email changes.
--   4. Token given: update the existing Vault secret, or create one.
--   5. Upsert the row. Return site_url, email, updated_at, updated_by. NEVER the
--      token and never the secret id.

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

  return jsonb_build_object(
    'site_url', v_row.site_url,
    'email', v_row.email,
    'updated_at', v_row.updated_at,
    'updated_by', v_row.updated_by
  );
end;
$$;

-- ============================================================================
-- 4. bunkai_get_workspace_jira_credentials — the single reader of the token
-- ============================================================================
-- The ONLY caller is lib/jira/credentials.ts, with the admin client, after the
-- request (or the import job that was enqueued by an authorised member) has been
-- authorised. It performs no actor check by design: it is granted to service_role
-- only and never exposed to a route as-is.

create or replace function public.bunkai_get_workspace_jira_credentials(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
           'site_url', c.site_url,
           'email', c.email,
           'token', s.decrypted_secret
         )
    into v_result
    from public.workspace_jira_connections c
    join public.workspaces w
      on w.id = c.workspace_id
     and w.deleted_at is null
    join vault.decrypted_secrets s
      on s.id = c.token_secret_id
   where c.workspace_id = p_workspace_id;

  return v_result;
end;
$$;

-- ============================================================================
-- 5. bunkai_delete_workspace_jira_connection
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
   where c.workspace_id = p_workspace_id;
  get diagnostics v_deleted = row_count;

  return v_deleted > 0;
end;
$$;

-- ============================================================================
-- 6. Grants
-- ============================================================================
-- service_role ONLY. Supabase default privileges grant EXECUTE on every new public
-- function to anon and authenticated, so both are revoked explicitly.

revoke all on function public.bunkai_upsert_workspace_jira_connection(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.bunkai_get_workspace_jira_credentials(uuid)
  from public, anon, authenticated;
revoke all on function public.bunkai_delete_workspace_jira_connection(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.bunkai_upsert_workspace_jira_connection(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.bunkai_get_workspace_jira_credentials(uuid)
  to service_role;
grant execute on function public.bunkai_delete_workspace_jira_connection(uuid, uuid)
  to service_role;

-- INVOKER runs with service_role's own privileges (all idempotent).
grant select on public.workspaces, public.workspace_members to service_role;

-- 0088 mechanism: the 0085 default privilege hands every new function to BOTH QA
-- roles. These touch credentials, so neither keeps them.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_upsert_workspace_jira_connection(uuid, uuid, text, text, text) from qa_inspector_ro;
    revoke all on function public.bunkai_get_workspace_jira_credentials(uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_delete_workspace_jira_connection(uuid, uuid) from qa_inspector_ro;
  end if;
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke all on function public.bunkai_get_workspace_jira_credentials(uuid) from qa_inspector_rw;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('authenticated', 'public.bunkai_get_workspace_jira_credentials(uuid)', 'EXECUTE');  -- false
--   select has_function_privilege('anon',          'public.bunkai_get_workspace_jira_credentials(uuid)', 'EXECUTE');  -- false
--   select has_function_privilege('service_role',  'public.bunkai_get_workspace_jira_credentials(uuid)', 'EXECUTE');  -- true
--   select has_table_privilege('authenticated', 'public.workspace_jira_connections', 'SELECT');                      -- false
--   select has_function_privilege('service_role', 'vault.create_secret(text,text,text,uuid)', 'EXECUTE');            -- true
