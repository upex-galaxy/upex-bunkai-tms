-- 0053_environment_cross_workspace_404.sql — BK-200: non-disclosing 404 for
-- cross-workspace environment PATCH/DELETE
--
-- Root cause (verified against the live migration ledger + pg_roles, not just
-- the 0032 prose): bunkai_rename_environment / bunkai_delete_environment
-- resolve the environment's project with a SECURITY DEFINER query against
-- project_environments. RLS is enabled on that table but never FORCE'd, and
-- both functions are owned by `postgres`, which carries the `bypassrls` role
-- attribute (confirmed live: select rolbypassrls from pg_roles where
-- rolname = 'postgres' -> true). That means FORCE ROW LEVEL SECURITY on
-- project_environments — the other fix this ticket considered — would NOT
-- have closed this gap: a BYPASSRLS role bypasses RLS unconditionally,
-- FORCE or not. So the resolution query already sees every workspace's rows,
-- and a foreign-workspace environment id resolves to a real, non-null
-- project_id. Control then reached bunkai_assert_actor_can_write_project,
-- which raised 42501 (forbidden) for the non-member actor — mapped to 403 by
-- lib/environments/errors.ts — disclosing that the id belongs to a real
-- environment in another workspace. The RPCs' own pre-existing comments
-- (0032_project_environments_crud.sql:145-146,163) already document the
-- intended contract: "A missing / cross-workspace env id resolves to no
-- project -> P0002 (not_found, non-disclosing)." This migration makes the
-- code match that already-ratified contract; it does not invent new security
-- posture.
--
-- Fix (scoped, not the shared gate): inline the membership check in these two
-- RPCs instead of delegating to bunkai_assert_actor_can_write_project. Both
-- "environment row does not exist" and "environment exists but the actor
-- cannot write its project's workspace" now raise the SAME P0002 (not_found).
-- bunkai_assert_actor_can_write_project itself (0021_atc_create_update.sql) is
-- left untouched — it is shared by the ATC / tests / bugs RPCs, all of which
-- take a caller-supplied p_project_id the caller already knows from the URL,
-- so a 403 there discloses nothing new. The environment RPCs are the odd ones
-- out: p_environment_id is the only caller-supplied identifier, and the
-- project it maps to is derived server-side, which is exactly the shape
-- rpc-authorization.md calls out — a WHERE clause inside a DEFINER function is
-- a selection filter, not an authorization check.

create or replace function public.bunkai_rename_environment(
  p_actor_user_id  uuid,
  p_environment_id uuid,
  p_name           text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_name         text;
  v_row          public.project_environments%rowtype;
begin
  -- Resolve the env's project + workspace together. project_environments.project_id
  -- is NOT NULL with an ON DELETE CASCADE FK to projects, so the join can only miss
  -- when the environment row itself does not exist -> NULL -> not_found.
  select pe.project_id, p.workspace_id
    into v_project_id, v_workspace_id
    from public.project_environments pe
    join public.projects p on p.id = pe.project_id
    where pe.id = p_environment_id;

  if v_project_id is null then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- BK-200: non-disclosing 404. A foreign-workspace environment id resolves to a
  -- real project above (this query bypasses RLS as the postgres/DEFINER owner),
  -- so the only way to honor the RPC's own documented contract is to raise the
  -- SAME not_found error for "actor cannot write this workspace" as for a
  -- genuinely missing row. Never 42501/forbidden here — that would re-disclose
  -- existence through the mapped 403.
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = p_actor_user_id
      and status = 'active'
      and role in ('member', 'admin', 'owner')
  ) then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- Trim + length 1..50 (unchanged from 0032).
  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'environment_name_length' using errcode = '45210';
  end if;

  -- Update (case-insensitive uniqueness enforced by the unique index -> 23505).
  update public.project_environments
    set name = v_name
    where id = p_environment_id
    returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'project_id', v_row.project_id,
    'name', v_row.name,
    'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_rename_environment(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_rename_environment(uuid, uuid, text) to authenticated, service_role;

-- ============================================================================
-- bunkai_delete_environment — same BK-200 fix: inline non-disclosing 404.
-- ============================================================================

create or replace function public.bunkai_delete_environment(
  p_actor_user_id  uuid,
  p_environment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_run_count    int;
begin
  select pe.project_id, p.workspace_id
    into v_project_id, v_workspace_id
    from public.project_environments pe
    join public.projects p on p.id = pe.project_id
    where pe.id = p_environment_id;

  if v_project_id is null then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- BK-200: same non-disclosing 404 fix as bunkai_rename_environment above.
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = p_actor_user_id
      and status = 'active'
      and role in ('member', 'admin', 'owner')
  ) then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- Delete-guard: BLOCK when any run references this environment (unchanged from
  -- 0032). Pre-count so the message carries the exact count; row-lock first so a
  -- concurrent run insert + this count serialize against the same row the
  -- delete will target.
  perform 1 from public.project_environments where id = p_environment_id for update;

  select count(*) into v_run_count
    from public.runs
    where environment_id = p_environment_id;
  if v_run_count > 0 then
    raise exception 'environment_in_use: % run(s) reference this environment', v_run_count
      using errcode = '45211';
  end if;

  -- Hard delete (the FK ON DELETE RESTRICT is the backstop -> 23503 if a run
  -- raced in after the count above).
  delete from public.project_environments where id = p_environment_id;

  return jsonb_build_object('deleted', true, 'id', p_environment_id);
end;
$$;

revoke execute on function public.bunkai_delete_environment(uuid, uuid) from public, anon;
grant execute on function public.bunkai_delete_environment(uuid, uuid) to authenticated, service_role;
