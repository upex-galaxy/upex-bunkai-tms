-- Migration: 0020 — one active import per project (BK-17 review)
-- Authored: 2026-06-05
--
-- Race-proof the "serialize imports per project" rule: a partial UNIQUE index so
-- at most one queued/running job can exist per project. The enqueue route maps
-- the resulting 23505 to 409 import_in_progress; completed/failed jobs leave the
-- index so the next import enqueues cleanly.

drop index if exists public.import_jobs_project_active_idx;

create unique index if not exists import_jobs_one_active_per_project
  on public.import_jobs (project_id)
  where status in ('queued', 'running');
