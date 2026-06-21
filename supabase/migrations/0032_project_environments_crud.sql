-- 0032_project_environments_crud.sql — BK-148: Project Environments CRUD
--
-- BK-34 (migration 0031_runs.sql) created the `project_environments` table,
-- its case-insensitive unique index, the SELECT RLS policy, and seeded
-- Staging/Production. It deliberately shipped NO client write path (default-deny
-- on INSERT/UPDATE/DELETE) and deferred env-management to a later story — that
-- story is BK-148 (see ADR-0004 §47). This migration is ADDITIVE only: it does
-- NOT recreate the table. It adds:
--   * write RLS policies (INSERT / UPDATE / DELETE) gated by member+ write access
--   * three SECURITY DEFINER RPCs the routes call with an explicit actor id:
--       - bunkai_create_environment  (add)
--       - bunkai_rename_environment  (rename)
--       - bunkai_delete_environment  (remove, BLOCKED when a run references it)
--
-- Conventions mirror 0021_atc_create_update.sql (explicit-actor write gate via
-- bunkai_assert_actor_can_write_project, which resolves project -> workspace and
-- raises project_not_found/P0002 + forbidden/42501) and 0031_runs.sql (custom
-- SQLSTATE block, `set search_path = ''`, schema-qualified, DEFINER grants).
--
-- Length contract: the table CHECK is the wider 1..60 (0031); the app layer
-- (zod + these RPCs) enforces the tighter AC rule of 1..50. 50 <= 60, so the
-- table CHECK stays a harmless outer bound — no migration churn on it.
--
-- Custom SQLSTATE codes allocated for the environments domain (class 45xxx,
-- 452xx block; 45200-45203 are taken by the runs domain in 0031):
--   45210  environment_name_length   (name empty or > 50 chars after btrim)
--   45211  environment_in_use        (>= 1 run references the env; message carries the count)
-- Case-insensitive name collisions reuse the native unique_violation (23505)
-- raised by project_environments_project_name_idx.

-- ============================================================================
-- 1. Write RLS policies (defense-in-depth — the RPCs are SECURITY DEFINER, but
--    keep the table's policy surface consistent with the module precedent in
--    0002_projects_modules.sql). Member+ write access via the project's workspace.
-- ============================================================================

drop policy if exists project_environments_insert_workspace_role_member_plus on public.project_environments;
create policy project_environments_insert_workspace_role_member_plus
  on public.project_environments
  for insert
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_environments.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists project_environments_update_workspace_role_member_plus on public.project_environments;
create policy project_environments_update_workspace_role_member_plus
  on public.project_environments
  for update
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_environments.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_environments.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists project_environments_delete_workspace_role_member_plus on public.project_environments;
create policy project_environments_delete_workspace_role_member_plus
  on public.project_environments
  for delete
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_environments.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

-- ============================================================================
-- 2. bunkai_create_environment — add a project environment. SECURITY DEFINER.
-- ============================================================================
--
-- Validation order (observable behavior):
--   1. AuthZ: actor must have member+ write access on the project's workspace
--      (bunkai_assert_actor_can_write_project: project_not_found/P0002 for a
--      missing project, forbidden/42501 for a non-member).
--   2. btrim the name; enforce length 1..50 else environment_name_length (45210).
--   3. Insert. The unique (project_id, lower(name)) index enforces the
--      case-insensitive uniqueness; a collision raises 23505 (unique_violation)
--      which the route maps to 409.

create or replace function public.bunkai_create_environment(
  p_actor_user_id uuid,
  p_project_id    uuid,
  p_name          text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_row  public.project_environments%rowtype;
begin
  -- 1. AuthZ gate (resolves project -> workspace; raises P0002 / 42501).
  perform public.bunkai_assert_actor_can_write_project(p_actor_user_id, p_project_id);

  -- 2. Trim + length 1..50 (app-authoritative; tighter than the table's 1..60 CHECK).
  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'environment_name_length' using errcode = '45210';
  end if;

  -- 3. Insert (case-insensitive uniqueness enforced by the unique index -> 23505).
  insert into public.project_environments (project_id, name)
  values (p_project_id, v_name)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'project_id', v_row.project_id,
    'name', v_row.name,
    'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_create_environment(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_create_environment(uuid, uuid, text) to authenticated, service_role;

-- ============================================================================
-- 3. bunkai_rename_environment — rename a project environment. SECURITY DEFINER.
-- ============================================================================
--
-- Resolves the project from the env row, applies the same write gate + trim +
-- length rules, then updates the name. The row id is unchanged, so any runs that
-- reference it keep referencing it (rename != new row). A collision with a
-- sibling env in the same project trips the unique index -> 23505 -> 409.
-- A missing / cross-workspace env id resolves to no project -> P0002 (not_found,
-- non-disclosing).

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
  v_project_id uuid;
  v_name       text;
  v_row        public.project_environments%rowtype;
begin
  -- Resolve the env's project. A missing/invisible env yields NULL -> not_found.
  select project_id into v_project_id
    from public.project_environments
    where id = p_environment_id;
  if v_project_id is null then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- AuthZ gate on the resolved project (P0002 / 42501).
  perform public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  -- Trim + length 1..50.
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
-- 4. bunkai_delete_environment — remove a project environment. SECURITY DEFINER.
-- ============================================================================
--
-- PO-pending default (BK-148 business-rules / AC): the delete guard BLOCKS a
-- removal when >= 1 run references the environment, preserving run history. The
-- RPC PRE-COUNTS referencing runs and raises environment_in_use (45211) WITH the
-- count in the message BEFORE attempting the delete, so the common path surfaces
-- a clean "N run(s) reference this environment" message rather than a raw FK
-- error. NOTE: the pre-count is NOT fully race-free — a run inserted in the
-- TOCTOU window between the count and the DELETE slips past the 45211 guard. That
-- residual race is caught by the runs.environment_id ... ON DELETE RESTRICT FK
-- backstop (23503), which carries no count, so the frontend falls back to the
-- generic in-use message (no "N run(s)"). The row lock above narrows but does not
-- eliminate the window, hence the FK backstop is load-bearing, not decorative.

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
  v_project_id uuid;
  v_run_count  int;
begin
  -- Resolve the env's project. A missing/invisible env yields NULL -> not_found.
  select project_id into v_project_id
    from public.project_environments
    where id = p_environment_id;
  if v_project_id is null then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- AuthZ gate on the resolved project (P0002 / 42501).
  perform public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  -- Delete-guard: BLOCK when any run references this environment. Pre-count so
  -- the message carries the exact count (AC "Block removal …"). Take a row lock
  -- on the env first so a concurrent run insert + this count serialize against
  -- the same row the delete will target.
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
