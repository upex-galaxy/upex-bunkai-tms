-- Migration: 0003 — authoring (user_stories, acceptance_criteria)
-- Authored: 2026-05-19
--
-- Stories are the unit of business intent anchored to a Module. Each story has
-- N sortable acceptance criteria (AC). ATCs in 0004 link to AC via a M:N table
-- to satisfy the anchoring moat (an ATC must reference at least one AC).
--
-- RLS strategy: workspace is resolved via modules.project_id -> projects.workspace_id.
-- SELECT requires active membership; mutations require role >= member.

-- =============================================================================
-- user_stories
-- =============================================================================

create table if not exists public.user_stories (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules(id) on delete cascade,
  title         text not null,
  description   text,
  external_id   text,
  external_url  text,
  created_at    timestamptz not null default now()
);

create index if not exists user_stories_module_id_idx
  on public.user_stories (module_id);

alter table public.user_stories enable row level security;

-- SELECT: active member of the workspace owning the story's module
drop policy if exists user_stories_select_workspace_member on public.user_stories;
create policy user_stories_select_workspace_member
  on public.user_stories
  for select
  using (
    exists (
      select 1
      from public.modules m
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where m.id = user_stories.module_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT: active member with role >= member
drop policy if exists user_stories_insert_workspace_role_member_plus on public.user_stories;
create policy user_stories_insert_workspace_role_member_plus
  on public.user_stories
  for insert
  with check (
    exists (
      select 1
      from public.modules m
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where m.id = user_stories.module_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE: active member with role >= member
drop policy if exists user_stories_update_workspace_role_member_plus on public.user_stories;
create policy user_stories_update_workspace_role_member_plus
  on public.user_stories
  for update
  using (
    exists (
      select 1
      from public.modules m
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where m.id = user_stories.module_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  )
  with check (
    exists (
      select 1
      from public.modules m
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where m.id = user_stories.module_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE: active member with role >= member
drop policy if exists user_stories_delete_workspace_role_member_plus on public.user_stories;
create policy user_stories_delete_workspace_role_member_plus
  on public.user_stories
  for delete
  using (
    exists (
      select 1
      from public.modules m
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where m.id = user_stories.module_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- =============================================================================
-- acceptance_criteria
-- =============================================================================

create table if not exists public.acceptance_criteria (
  id              uuid primary key default gen_random_uuid(),
  user_story_id   uuid not null references public.user_stories(id) on delete cascade,
  title           text not null,
  description     text,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  unique (user_story_id, position)
);

create index if not exists acceptance_criteria_user_story_id_idx
  on public.acceptance_criteria (user_story_id);

alter table public.acceptance_criteria enable row level security;

-- SELECT: active member of the workspace owning the AC's story
drop policy if exists acceptance_criteria_select_workspace_member on public.acceptance_criteria;
create policy acceptance_criteria_select_workspace_member
  on public.acceptance_criteria
  for select
  using (
    exists (
      select 1
      from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where us.id = acceptance_criteria.user_story_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT: active member with role >= member
drop policy if exists acceptance_criteria_insert_workspace_role_member_plus on public.acceptance_criteria;
create policy acceptance_criteria_insert_workspace_role_member_plus
  on public.acceptance_criteria
  for insert
  with check (
    exists (
      select 1
      from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where us.id = acceptance_criteria.user_story_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE: active member with role >= member
drop policy if exists acceptance_criteria_update_workspace_role_member_plus on public.acceptance_criteria;
create policy acceptance_criteria_update_workspace_role_member_plus
  on public.acceptance_criteria
  for update
  using (
    exists (
      select 1
      from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where us.id = acceptance_criteria.user_story_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  )
  with check (
    exists (
      select 1
      from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where us.id = acceptance_criteria.user_story_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE: active member with role >= member
drop policy if exists acceptance_criteria_delete_workspace_role_member_plus on public.acceptance_criteria;
create policy acceptance_criteria_delete_workspace_role_member_plus
  on public.acceptance_criteria
  for delete
  using (
    exists (
      select 1
      from public.user_stories us
      join public.modules m on m.id = us.module_id
      join public.projects p on p.id = m.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where us.id = acceptance_criteria.user_story_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );
