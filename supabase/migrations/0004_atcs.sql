-- Migration: 0004 — ATCs (atcs, atc_steps, atc_assertions, atc_acceptance_criteria)
-- Authored: 2026-05-19
--
-- ATC = Acceptance Test Case. Anchored to a project + module + user story and
-- bound to ≥1 acceptance criterion via `atc_acceptance_criteria` (the anchoring
-- moat — enforced at the application layer in MVP, made structural by FK).
--
-- Search: `atcs.tsv` is a STORED generated column over title + flattened tags;
-- a GIN index on it backs the search UI's tag-prefix / fuzzy queries.
-- Trigger: `bunkai_set_updated_at()` keeps atcs.updated_at fresh on UPDATE.
--
-- RLS strategy: workspace resolved via project_id -> projects.workspace_id for
-- the parent ATC; child tables (steps, assertions, m2m) resolve through atcs.
-- SELECT requires active membership; mutations require role >= member.

-- =============================================================================
-- shared helpers: trigger functions (idempotent)
-- =============================================================================

-- Pinned empty search_path is the Supabase linter requirement
-- (lint=0011_function_search_path_mutable). pg_catalog symbols resolve regardless.
create or replace function public.bunkai_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- to_tsvector(regconfig, text) is not IMMUTABLE enough for a GENERATED column,
-- so atcs.tsv is a regular column populated by this trigger on INSERT/UPDATE.
create or replace function public.bunkai_atcs_refresh_tsv()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tsv := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' || coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$;

-- =============================================================================
-- atcs
-- =============================================================================

create table if not exists public.atcs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  module_id       uuid not null references public.modules(id) on delete cascade,
  user_story_id   uuid not null references public.user_stories(id) on delete restrict,
  slug            text not null,
  title           text not null,
  layer           text not null check (layer in ('UI','API','Unit')),
  version         int not null default 1,
  status          text not null default 'unrun'
                    check (status in ('pass','fail','blocked','skipped','running','unrun')),
  tags            text[] not null default '{}',
  tsv             tsvector,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, slug)
);

create index if not exists atcs_project_id_idx       on public.atcs (project_id);
create index if not exists atcs_module_id_idx        on public.atcs (module_id);
create index if not exists atcs_user_story_id_idx    on public.atcs (user_story_id);
create index if not exists atcs_tsv_gin_idx          on public.atcs using gin (tsv);

-- updated_at trigger
drop trigger if exists atcs_set_updated_at on public.atcs;
create trigger atcs_set_updated_at
  before update on public.atcs
  for each row
  execute function public.bunkai_set_updated_at();

-- tsv refresh trigger (BEFORE INSERT OR UPDATE OF title, tags)
drop trigger if exists atcs_refresh_tsv on public.atcs;
create trigger atcs_refresh_tsv
  before insert or update of title, tags on public.atcs
  for each row
  execute function public.bunkai_atcs_refresh_tsv();

alter table public.atcs enable row level security;

-- SELECT: active member of the project's workspace
drop policy if exists atcs_select_workspace_member on public.atcs;
create policy atcs_select_workspace_member
  on public.atcs
  for select
  using (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = atcs.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT: role >= member
drop policy if exists atcs_insert_workspace_role_member_plus on public.atcs;
create policy atcs_insert_workspace_role_member_plus
  on public.atcs
  for insert
  with check (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = atcs.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE: role >= member
drop policy if exists atcs_update_workspace_role_member_plus on public.atcs;
create policy atcs_update_workspace_role_member_plus
  on public.atcs
  for update
  using (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = atcs.project_id
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
      where p.id = atcs.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE: role >= member
drop policy if exists atcs_delete_workspace_role_member_plus on public.atcs;
create policy atcs_delete_workspace_role_member_plus
  on public.atcs
  for delete
  using (
    exists (
      select 1
      from public.projects p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = atcs.project_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- =============================================================================
-- atc_steps
-- =============================================================================

create table if not exists public.atc_steps (
  id          uuid primary key default gen_random_uuid(),
  atc_id      uuid not null references public.atcs(id) on delete cascade,
  position    int not null default 0,
  content     text not null,
  input_data  text,
  expected    text,
  unique (atc_id, position)
);

create index if not exists atc_steps_atc_id_idx on public.atc_steps (atc_id);

alter table public.atc_steps enable row level security;

-- SELECT: active member of the workspace owning the parent ATC's project
drop policy if exists atc_steps_select_workspace_member on public.atc_steps;
create policy atc_steps_select_workspace_member
  on public.atc_steps
  for select
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_steps.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT: role >= member
drop policy if exists atc_steps_insert_workspace_role_member_plus on public.atc_steps;
create policy atc_steps_insert_workspace_role_member_plus
  on public.atc_steps
  for insert
  with check (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_steps.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE: role >= member
drop policy if exists atc_steps_update_workspace_role_member_plus on public.atc_steps;
create policy atc_steps_update_workspace_role_member_plus
  on public.atc_steps
  for update
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_steps.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  )
  with check (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_steps.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE: role >= member
drop policy if exists atc_steps_delete_workspace_role_member_plus on public.atc_steps;
create policy atc_steps_delete_workspace_role_member_plus
  on public.atc_steps
  for delete
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_steps.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- =============================================================================
-- atc_assertions
-- =============================================================================

create table if not exists public.atc_assertions (
  id        uuid primary key default gen_random_uuid(),
  atc_id    uuid not null references public.atcs(id) on delete cascade,
  position  int not null default 0,
  content   text not null,
  unique (atc_id, position)
);

create index if not exists atc_assertions_atc_id_idx on public.atc_assertions (atc_id);

alter table public.atc_assertions enable row level security;

-- SELECT
drop policy if exists atc_assertions_select_workspace_member on public.atc_assertions;
create policy atc_assertions_select_workspace_member
  on public.atc_assertions
  for select
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_assertions.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT
drop policy if exists atc_assertions_insert_workspace_role_member_plus on public.atc_assertions;
create policy atc_assertions_insert_workspace_role_member_plus
  on public.atc_assertions
  for insert
  with check (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_assertions.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE
drop policy if exists atc_assertions_update_workspace_role_member_plus on public.atc_assertions;
create policy atc_assertions_update_workspace_role_member_plus
  on public.atc_assertions
  for update
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_assertions.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  )
  with check (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_assertions.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE
drop policy if exists atc_assertions_delete_workspace_role_member_plus on public.atc_assertions;
create policy atc_assertions_delete_workspace_role_member_plus
  on public.atc_assertions
  for delete
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_assertions.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- =============================================================================
-- atc_acceptance_criteria (M:N)
-- =============================================================================

create table if not exists public.atc_acceptance_criteria (
  atc_id                    uuid not null references public.atcs(id) on delete cascade,
  acceptance_criterion_id   uuid not null references public.acceptance_criteria(id) on delete cascade,
  primary key (atc_id, acceptance_criterion_id)
);

create index if not exists atc_acceptance_criteria_ac_id_idx
  on public.atc_acceptance_criteria (acceptance_criterion_id);

alter table public.atc_acceptance_criteria enable row level security;

-- SELECT
drop policy if exists atc_acceptance_criteria_select_workspace_member on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_select_workspace_member
  on public.atc_acceptance_criteria
  for select
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_acceptance_criteria.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- INSERT
drop policy if exists atc_acceptance_criteria_insert_workspace_role_member_plus on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_insert_workspace_role_member_plus
  on public.atc_acceptance_criteria
  for insert
  with check (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_acceptance_criteria.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- UPDATE
drop policy if exists atc_acceptance_criteria_update_workspace_role_member_plus on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_update_workspace_role_member_plus
  on public.atc_acceptance_criteria
  for update
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_acceptance_criteria.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  )
  with check (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_acceptance_criteria.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );

-- DELETE
drop policy if exists atc_acceptance_criteria_delete_workspace_role_member_plus on public.atc_acceptance_criteria;
create policy atc_acceptance_criteria_delete_workspace_role_member_plus
  on public.atc_acceptance_criteria
  for delete
  using (
    exists (
      select 1
      from public.atcs a
      join public.projects p on p.id = a.project_id
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where a.id = atc_acceptance_criteria.atc_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('member','admin','owner')
    )
  );
