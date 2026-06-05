-- Migration: 0016 — user-story Jira-key uniqueness (BK-14)
-- Authored: 2026-06-04
--
-- The `user_stories` table already exists (0003 + 0014 added archived_at). This
-- migration adds the per-project Jira-key uniqueness guarantee:
--   * a denormalized `project_id` (set from the story's module at insert) so the
--     uniqueness scope is a local column, not a cross-table join, and
--   * a partial unique index on (project_id, upper(external_id)) over ACTIVE rows
--     with a non-null external_id — case-insensitive, race-proof, and ignoring
--     archived stories so an archived link does not block re-linking.
-- Plus an active-list index for the per-module listing.

alter table public.user_stories
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

-- Backfill any existing rows from their module (the table is empty in practice).
update public.user_stories us
  set project_id = m.project_id
  from public.modules m
  where m.id = us.module_id and us.project_id is null;

create unique index if not exists user_stories_project_external_id_uniq
  on public.user_stories (project_id, upper(external_id))
  where external_id is not null and archived_at is null;

create index if not exists user_stories_module_active_idx
  on public.user_stories (module_id)
  where archived_at is null;
