-- Migration: 0005 — RLS helper functions + policy refactor
-- Authored: 2026-05-19
--
-- Fixes 42P17 infinite recursion in `workspace_members.SELECT` policy
-- (and would-be recursion in every downstream policy that subqueries
-- workspace_members from inside RLS evaluation).
--
-- Strategy: encapsulate the membership checks in SECURITY DEFINER functions
-- that bypass RLS internally. All policies then call these helpers instead
-- of inlining EXISTS subqueries against workspace_members.
--
-- Helpers are STABLE (per-statement result), set search_path = '' (Supabase
-- security linter requirement; pg_catalog symbols resolve regardless).

-- =============================================================================
-- helpers
-- =============================================================================

create or replace function public.bunkai_is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.bunkai_can_write_workspace(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('member','admin','owner')
  );
$$;

create or replace function public.bunkai_is_workspace_admin(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('admin','owner')
  );
$$;

create or replace function public.bunkai_is_workspace_owner(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and status = 'active'
      and role = 'owner'
  );
$$;

-- Permission shape:
--   * anon: REVOKE EXECUTE — anonymous callers cannot hit /rest/rpc/bunkai_*
--   * authenticated: KEEP EXECUTE — required because RLS evaluates these
--     helpers as the calling role, NOT as table owner. Removing EXECUTE here
--     breaks every policy with "permission denied for function".
--   * public: REVOKE — closes the legacy implicit grant.
-- The remaining lint 0029 (authenticated_security_definer_function_executable)
-- is an acceptable WARN: the helpers return booleans, never row data, and
-- their /rpc surface is read-only membership probing already authorized by
-- the JWT. Migrate to a separate `bunkai_internal` schema in Phase E if the
-- warn becomes noise.
revoke execute on function public.bunkai_is_workspace_member(uuid) from public, anon;
revoke execute on function public.bunkai_can_write_workspace(uuid) from public, anon;
revoke execute on function public.bunkai_is_workspace_admin(uuid) from public, anon;
revoke execute on function public.bunkai_is_workspace_owner(uuid) from public, anon;

-- =============================================================================
-- workspaces — replace policies
-- =============================================================================

drop policy if exists workspaces_select_active_member on public.workspaces;
create policy workspaces_select_active_member on public.workspaces
  for select using ( public.bunkai_is_workspace_member(id) );

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner on public.workspaces
  for update
  using ( public.bunkai_is_workspace_owner(id) )
  with check ( public.bunkai_is_workspace_owner(id) );

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
  for delete using ( public.bunkai_is_workspace_owner(id) );

-- workspaces_insert_self_owner stays unchanged (no workspace_members lookup).

-- =============================================================================
-- workspace_members — replace policies
-- =============================================================================

drop policy if exists workspace_members_select_self_or_admin on public.workspace_members;
create policy workspace_members_select_self_or_admin on public.workspace_members
  for select using (
    user_id = auth.uid()
    or public.bunkai_is_workspace_admin(workspace_id)
  );

drop policy if exists workspace_members_insert_admin on public.workspace_members;
create policy workspace_members_insert_admin on public.workspace_members
  for insert
  with check ( public.bunkai_is_workspace_admin(workspace_id) );

drop policy if exists workspace_members_update_admin on public.workspace_members;
create policy workspace_members_update_admin on public.workspace_members
  for update
  using ( public.bunkai_is_workspace_admin(workspace_id) )
  with check ( public.bunkai_is_workspace_admin(workspace_id) );

drop policy if exists workspace_members_delete_admin on public.workspace_members;
create policy workspace_members_delete_admin on public.workspace_members
  for delete using ( public.bunkai_is_workspace_admin(workspace_id) );

-- =============================================================================
-- projects — replace policies
-- =============================================================================

drop policy if exists projects_select_workspace_member on public.projects;
create policy projects_select_workspace_member on public.projects
  for select using ( public.bunkai_is_workspace_member(workspace_id) );

drop policy if exists projects_insert_workspace_role_member_plus on public.projects;
create policy projects_insert_workspace_role_member_plus on public.projects
  for insert with check ( public.bunkai_can_write_workspace(workspace_id) );

drop policy if exists projects_update_workspace_role_member_plus on public.projects;
create policy projects_update_workspace_role_member_plus on public.projects
  for update
  using ( public.bunkai_can_write_workspace(workspace_id) )
  with check ( public.bunkai_can_write_workspace(workspace_id) );

drop policy if exists projects_delete_workspace_role_member_plus on public.projects;
create policy projects_delete_workspace_role_member_plus on public.projects
  for delete using ( public.bunkai_can_write_workspace(workspace_id) );

-- =============================================================================
-- modules — replace policies (workspace resolved via projects)
-- =============================================================================

drop policy if exists modules_select_workspace_member on public.modules;
create policy modules_select_workspace_member on public.modules
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = modules.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists modules_insert_workspace_role_member_plus on public.modules;
create policy modules_insert_workspace_role_member_plus on public.modules
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = modules.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists modules_update_workspace_role_member_plus on public.modules;
create policy modules_update_workspace_role_member_plus on public.modules
  for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = modules.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = modules.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists modules_delete_workspace_role_member_plus on public.modules;
create policy modules_delete_workspace_role_member_plus on public.modules
  for delete using (
    exists (
      select 1 from public.projects p
      where p.id = modules.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

-- =============================================================================
-- user_stories — replace policies
-- =============================================================================

drop policy if exists user_stories_select_workspace_member on public.user_stories;
create policy user_stories_select_workspace_member on public.user_stories
  for select using (
    exists (
      select 1 from public.modules m
      join public.projects p on p.id = m.project_id
      where m.id = user_stories.module_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists user_stories_insert_workspace_role_member_plus on public.user_stories;
create policy user_stories_insert_workspace_role_member_plus on public.user_stories
  for insert with check (
    exists (
      select 1 from public.modules m
      join public.projects p on p.id = m.project_id
      where m.id = user_stories.module_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists user_stories_update_workspace_role_member_plus on public.user_stories;
create policy user_stories_update_workspace_role_member_plus on public.user_stories
  for update
  using (
    exists (
      select 1 from public.modules m
      join public.projects p on p.id = m.project_id
      where m.id = user_stories.module_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.modules m
      join public.projects p on p.id = m.project_id
      where m.id = user_stories.module_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists user_stories_delete_workspace_role_member_plus on public.user_stories;
create policy user_stories_delete_workspace_role_member_plus on public.user_stories
  for delete using (
    exists (
      select 1 from public.modules m
      join public.projects p on p.id = m.project_id
      where m.id = user_stories.module_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

-- =============================================================================
-- acceptance_criteria — replace policies
-- =============================================================================

drop policy if exists acceptance_criteria_select_workspace_member on public.acceptance_criteria;
create policy acceptance_criteria_select_workspace_member on public.acceptance_criteria
  for select using (
    exists (
      select 1 from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      where us.id = acceptance_criteria.user_story_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists acceptance_criteria_insert_workspace_role_member_plus on public.acceptance_criteria;
create policy acceptance_criteria_insert_workspace_role_member_plus on public.acceptance_criteria
  for insert with check (
    exists (
      select 1 from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      where us.id = acceptance_criteria.user_story_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists acceptance_criteria_update_workspace_role_member_plus on public.acceptance_criteria;
create policy acceptance_criteria_update_workspace_role_member_plus on public.acceptance_criteria
  for update
  using (
    exists (
      select 1 from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      where us.id = acceptance_criteria.user_story_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      where us.id = acceptance_criteria.user_story_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists acceptance_criteria_delete_workspace_role_member_plus on public.acceptance_criteria;
create policy acceptance_criteria_delete_workspace_role_member_plus on public.acceptance_criteria
  for delete using (
    exists (
      select 1 from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      where us.id = acceptance_criteria.user_story_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

-- =============================================================================
-- atcs — replace policies
-- =============================================================================

drop policy if exists atcs_select_workspace_member on public.atcs;
create policy atcs_select_workspace_member on public.atcs
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = atcs.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists atcs_insert_workspace_role_member_plus on public.atcs;
create policy atcs_insert_workspace_role_member_plus on public.atcs
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = atcs.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atcs_update_workspace_role_member_plus on public.atcs;
create policy atcs_update_workspace_role_member_plus on public.atcs
  for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = atcs.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = atcs.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atcs_delete_workspace_role_member_plus on public.atcs;
create policy atcs_delete_workspace_role_member_plus on public.atcs
  for delete using (
    exists (
      select 1 from public.projects p
      where p.id = atcs.project_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

-- =============================================================================
-- atc_steps — replace policies (workspace resolved via atcs -> projects)
-- =============================================================================

drop policy if exists atc_steps_select_workspace_member on public.atc_steps;
create policy atc_steps_select_workspace_member on public.atc_steps
  for select using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_steps.atc_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists atc_steps_insert_workspace_role_member_plus on public.atc_steps;
create policy atc_steps_insert_workspace_role_member_plus on public.atc_steps
  for insert with check (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_steps.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atc_steps_update_workspace_role_member_plus on public.atc_steps;
create policy atc_steps_update_workspace_role_member_plus on public.atc_steps
  for update
  using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_steps.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_steps.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atc_steps_delete_workspace_role_member_plus on public.atc_steps;
create policy atc_steps_delete_workspace_role_member_plus on public.atc_steps
  for delete using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_steps.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

-- =============================================================================
-- atc_assertions — replace policies
-- =============================================================================

drop policy if exists atc_assertions_select_workspace_member on public.atc_assertions;
create policy atc_assertions_select_workspace_member on public.atc_assertions
  for select using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_assertions.atc_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists atc_assertions_insert_workspace_role_member_plus on public.atc_assertions;
create policy atc_assertions_insert_workspace_role_member_plus on public.atc_assertions
  for insert with check (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_assertions.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atc_assertions_update_workspace_role_member_plus on public.atc_assertions;
create policy atc_assertions_update_workspace_role_member_plus on public.atc_assertions
  for update
  using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_assertions.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_assertions.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atc_assertions_delete_workspace_role_member_plus on public.atc_assertions;
create policy atc_assertions_delete_workspace_role_member_plus on public.atc_assertions
  for delete using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_assertions.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

-- =============================================================================
-- atc_acceptance_criteria — replace policies
-- =============================================================================

drop policy if exists atc_acceptance_criteria_select_workspace_member on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_select_workspace_member on public.atc_acceptance_criteria
  for select using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_acceptance_criteria.atc_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists atc_acceptance_criteria_insert_workspace_role_member_plus on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_insert_workspace_role_member_plus on public.atc_acceptance_criteria
  for insert with check (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_acceptance_criteria.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atc_acceptance_criteria_update_workspace_role_member_plus on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_update_workspace_role_member_plus on public.atc_acceptance_criteria
  for update
  using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_acceptance_criteria.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_acceptance_criteria.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );

drop policy if exists atc_acceptance_criteria_delete_workspace_role_member_plus on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_delete_workspace_role_member_plus on public.atc_acceptance_criteria
  for delete using (
    exists (
      select 1 from public.atcs a
      join public.projects p on p.id = a.project_id
      where a.id = atc_acceptance_criteria.atc_id
        and public.bunkai_can_write_workspace(p.workspace_id)
    )
  );
