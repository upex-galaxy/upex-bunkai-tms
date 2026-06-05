-- Migration: 0019 — Jira import jobs (BK-17)
-- Authored: 2026-06-05
--
-- Async one-way Jira import. The Next.js route worker (Vercel `after()`) claims
-- and processes jobs with the service-role client (RLS bypassed); authorization
-- is enforced at enqueue time by the INSERT policy. Users can SELECT (poll) and
-- INSERT (enqueue) only within their workspace; UPDATE/DELETE have NO user policy
-- (only the service-role worker mutates counts/status).

create table if not exists public.import_jobs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  jql             text not null,
  status          text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  next_page_token text,
  imported_count  int  not null default 0,
  created_count   int  not null default 0,
  updated_count   int  not null default 0,
  skipped_count   int  not null default 0,
  errors          jsonb not null default '[]'::jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Status polling per workspace.
create index if not exists import_jobs_poll_idx
  on public.import_jobs (workspace_id, status, created_at desc);

-- Concurrent-import serialize check: at most one active job per project.
create index if not exists import_jobs_project_active_idx
  on public.import_jobs (project_id)
  where status in ('queued', 'running');

alter table public.import_jobs enable row level security;

create policy import_jobs_select_workspace_member on public.import_jobs
  for select using (public.bunkai_is_workspace_member(workspace_id));

create policy import_jobs_insert_workspace_role_member_plus on public.import_jobs
  for insert with check (public.bunkai_can_write_workspace(workspace_id));
