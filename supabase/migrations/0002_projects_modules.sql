-- Migration: 0002 — projects & modules
-- Authored: 2026-05-19
--
-- `projects` is the app-under-test, scoped to a single workspace. `modules` is
-- a self-referential tree (max depth 6) keyed by a materialized `path` column
-- (slash-separated). The depth constraint is enforced via CHECK so the tree
-- view's recursive CTE has a bounded fan-out.
--
-- RLS strategy: both tables resolve their workspace via projects.workspace_id.
-- SELECT requires active membership; mutations additionally require role ∈
-- (member, admin, owner) — viewers are strictly read-only.

-- =============================================================================
-- projects
-- =============================================================================

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  slug          text not null,
  name          text not null,
  description   text,
  created_at    timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists projects_workspace_id_idx
  on public.projects (workspace_id);

alter table public.projects enable row level security;

-- SELECT: caller is an active member of the project's workspace
drop policy if exists projects_select_workspace_member on public.projects;
create policy projects_select_workspace_member
  on public.projects
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT: active member with role >= member in the target workspace
drop policy if exists projects_insert_workspace_role_member_plus on public.projects;
create policy projects_insert_workspace_role_member_plus
  on public.projects
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE: active member with role >= member
drop policy if exists projects_update_workspace_role_member_plus on public.projects;
create policy projects_update_workspace_role_member_plus
  on public.projects
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE: active member with role >= member
drop policy if exists projects_delete_workspace_role_member_plus on public.projects;
create policy projects_delete_workspace_role_member_plus
  on public.projects
  for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- =============================================================================
-- modules
-- =============================================================================

create table if not exists public.modules (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  parent_module_id  uuid references public.modules(id) on delete cascade,
  path              text not null,
  name              text not null,
  position          int not null default 0,
  created_at        timestamptz not null default now(),
  unique (project_id, path),
  -- Depth ≤ 6 — split path by '/'; segment count must be 1..6 inclusive.
  constraint modules_path_depth_max_6
    check (array_length(string_to_array(path, '/'), 1) between 1 and 6)
);

create index if not exists modules_project_id_idx
  on public.modules (project_id);

create index if not exists modules_parent_module_id_idx
  on public.modules (parent_module_id);

alter table public.modules enable row level security;

-- SELECT: caller is an active member of the workspace owning this module's project
drop policy if exists modules_select_workspace_member on public.modules;
create policy modules_select_workspace_member
  on public.modules
  for select
  using (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = modules.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT: active member with role >= member
drop policy if exists modules_insert_workspace_role_member_plus on public.modules;
create policy modules_insert_workspace_role_member_plus
  on public.modules
  for insert
  with check (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = modules.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE: active member with role >= member
drop policy if exists modules_update_workspace_role_member_plus on public.modules;
create policy modules_update_workspace_role_member_plus
  on public.modules
  for update
  using (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = modules.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = modules.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE: active member with role >= member
drop policy if exists modules_delete_workspace_role_member_plus on public.modules;
create policy modules_delete_workspace_role_member_plus
  on public.modules
  for delete
  using (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = modules.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );
