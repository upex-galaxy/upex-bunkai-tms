-- ============================================================================
-- 0083_workspace_data_export
--
-- BK-508 — Settings | Request an export of my workspace data. Owner-only,
-- cookie-session-only (never a PAT, confirmed on the ticket), one export in
-- flight per workspace, ready archives stay downloadable for 7 days (168h).
--
-- SHAPE (ratified via attributed Jira comments on BK-508, 2026-08-18/2026-08-30,
-- AI Tech Lead per CLAUDE.md Rule #18):
--   * Job lifecycle mirrors `import_jobs` (0019/0020) byte-for-byte: a
--     `queued -> running -> completed | failed` row, a Vercel `after()`
--     background worker using the service-role admin client (RLS bypassed;
--     authorization already enforced at enqueue time by the INSERT policy
--     below), a partial unique index serializing "at most one active job"
--     (here: per WORKSPACE, not per project — confirmed Business Rule).
--   * Archive storage is Supabase Storage, NOT a bytea column: the largest
--     contributor (Run snapshots) is explicitly unbounded, and Storage is the
--     purpose-built tool for a binary blob that never needs to be queried.
--     The bucket carries NO anon/authenticated policy at all — it is written
--     and read exclusively by the service-role admin client, so there is no
--     new client-facing attack surface (same trust boundary as `import_jobs`'
--     service-role-only UPDATE).
--   * The download route never hands out a signed URL. It re-verifies
--     Owner + ready + unexpired on every request via
--     `bunkai_resolve_workspace_export_download` below, which ALSO writes the
--     `export.downloaded` audit row in the same call — a single code path is
--     the source of truth for "is this still downloadable" AND "did the
--     Owner actually receive the bytes" (AC-12).
--
-- ADR-0012 (RPC authorization invariant): the two DEFINER functions below
-- take NO caller-supplied identity parameter — both derive the actor from
-- `auth.uid()` internally, which is the ADR's explicitly preferred outcome
-- ("prefer deleting the identity parameter over guarding it"). Neither
-- function grows the 22-function unbound-legacy set this ADR tracks as debt.
--
-- Custom SQLSTATE codes allocated for the workspace-export domain (class
-- 45xxx, fresh 458xx block — 45001..45700 already allocated by other
-- domains, verified by grep across supabase/migrations/ before writing this):
--   45801  export_none         (no workspace_exports row exists yet)
--   45802  export_not_ready    (latest row exists but status <> 'completed')
--   45803  export_expired      (latest row is 'completed' but expires_at has lapsed)
-- Not-Owner is NOT a new code — it reuses bare 42501, the same convention
-- every other role-gated DEFINER function in this codebase already uses
-- (e.g. `bunkai_assert_actor_can_write_workspace`, 0024's role gate).
-- ============================================================================


-- ============================================================================
-- 1. workspace_exports — the job table
-- ============================================================================

create table if not exists public.workspace_exports (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  requested_by   uuid not null references auth.users(id) on delete restrict,
  status         text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  archive_path   text,
  archive_bytes  bigint,
  error_message  text,
  started_at     timestamptz,
  completed_at   timestamptz,
  -- Set only on completion (= completed_at + 168h). NULL while
  -- queued/running/failed — "expired" is never a persisted status, it is
  -- always derived from comparing this column to now(), so there is no
  -- separate state that can drift out of sync with the clock (AC-07).
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- The section always reads the SINGLE LATEST row per workspace. This is what
-- makes AC-14 true with zero extra bookkeeping: a fresh request's row simply
-- becomes the one this index serves first, the prior row is never queried
-- again, and its own expiry is therefore never independently tracked once
-- superseded — exactly the confirmed AC-14 behavior, for free.
create index if not exists workspace_exports_workspace_id_created_at_idx
  on public.workspace_exports (workspace_id, created_at desc);

-- Race-proof "at most one export in flight per workspace" (confirmed Business
-- Rule: scoped per workspace, not per Owner). Mirrors
-- import_jobs_one_active_per_project (0020) exactly. The enqueue route maps
-- the resulting 23505 to 409 export_in_progress.
create unique index if not exists workspace_exports_one_active_per_workspace
  on public.workspace_exports (workspace_id)
  where status in ('queued', 'running');

alter table public.workspace_exports enable row level security;

-- SELECT: Owner only — not "any active member" like import_jobs. AC-02
-- requires the section (and by extension any row) to be absent, not merely
-- refused, for Admin/Member/Viewer. bunkai_is_workspace_owner (0005) already
-- exists and is exactly this check.
create policy workspace_exports_select_owner on public.workspace_exports
  for select using (public.bunkai_is_workspace_owner(workspace_id));

-- INSERT: Owner only, AND the row's own requested_by must be the caller —
-- this is the actor-bind for the request-side audit trigger below (§3):
-- NEW.requested_by is trustworthy there specifically because this check
-- forces it to equal auth.uid() at insert time, not because the trigger
-- re-derives it.
create policy workspace_exports_insert_owner on public.workspace_exports
  for insert with check (
    public.bunkai_is_workspace_owner(workspace_id)
    and requested_by = auth.uid()
  );

-- No UPDATE/DELETE policy for any client role. Only the background worker's
-- service-role admin client mutates status/archive fields — identical to
-- import_jobs (0019 header comment).


-- ============================================================================
-- 2. Storage — private bucket, service-role only
-- ============================================================================
--
-- No storage.objects policy is created for anon/authenticated. The bucket is
-- written by the background worker's admin client and read only by the
-- download route's admin client (after bunkai_resolve_workspace_export_download,
-- §4, has already authorized the request at the table layer). service_role
-- bypasses Storage RLS the same way it bypasses table RLS, so this grants
-- exactly zero marginal client-facing privilege — the same reasoning
-- 0075_run_inactivity_sweep.sql records for its service_role EXECUTE grant.

insert into storage.buckets (id, name, public)
values ('workspace-exports', 'workspace-exports', false)
on conflict (id) do nothing;


-- ============================================================================
-- 3. bunkai_log_export_requested — AFTER INSERT trigger, request-side audit
-- ============================================================================
--
-- activity_log has NO client INSERT policy (0009_cross_cutting.sql) — every
-- writer in this codebase is a SECURITY DEFINER function or trigger, never a
-- direct client insert. This trigger is the request-side one; the enqueue
-- route never touches activity_log itself.
--
-- No parameter at all: NEW.workspace_id / NEW.requested_by are read straight
-- off the row that was just authorized by workspace_exports_insert_owner
-- (§1) — there is no caller-supplied identity here to bind or spoof.

create or replace function public.bunkai_log_export_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_log
    (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    new.workspace_id, new.requested_by, 'workspace', new.workspace_id,
    'export.requested', '{}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists workspace_exports_log_requested on public.workspace_exports;
create trigger workspace_exports_log_requested
  after insert on public.workspace_exports
  for each row
  execute function public.bunkai_log_export_requested();


-- ============================================================================
-- 4. bunkai_resolve_workspace_export_download — authorize + audit + return path
-- ============================================================================
--
-- Single atomic call: re-verifies Owner (fresh — never trusts a stale route-
-- level check), loads the latest row for the workspace, requires it to be
-- 'completed' and unexpired, writes the export.downloaded audit row, and
-- returns the archive_path the route needs to stream from Storage. Doing all
-- of this in one DEFINER call (rather than a plain RLS-scoped SELECT) is what
-- makes the audit write possible at all (activity_log has no INSERT policy)
-- and keeps "is this still downloadable" a single source of truth instead of
-- two call sites that could disagree.
--
-- No caller-supplied identity parameter (ADR-0012 preferred shape) — actor
-- and authorization subject are both auth.uid(), read internally.

create or replace function public.bunkai_resolve_workspace_export_download(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_export record;
begin
  if not public.bunkai_is_workspace_owner(p_workspace_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select id, status, archive_path, expires_at
    into v_export
    from public.workspace_exports
    where workspace_id = p_workspace_id
    order by created_at desc
    limit 1;

  if not found then
    raise exception 'export_none' using errcode = '45801';
  end if;

  if v_export.status <> 'completed' then
    raise exception 'export_not_ready' using errcode = '45802';
  end if;

  if v_export.expires_at is null or v_export.expires_at <= now() then
    raise exception 'export_expired' using errcode = '45803';
  end if;

  insert into public.activity_log
    (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    p_workspace_id, auth.uid(), 'workspace', p_workspace_id,
    'export.downloaded', '{}'::jsonb
  );

  return jsonb_build_object('export_id', v_export.id, 'archive_path', v_export.archive_path);
end;
$$;

revoke execute on function public.bunkai_resolve_workspace_export_download(uuid) from public, anon;
grant  execute on function public.bunkai_resolve_workspace_export_download(uuid) to authenticated;


-- ============================================================================
-- 5. Activity Stream allowlist — export.requested / export.downloaded
-- ============================================================================
--
-- create or replace, full body copied forward from 0055 (append-only
-- precedent — same signature). Two changes only, kept in sync BY HAND with
-- lib/activity/constants.ts's ACTIVITY_ALLOWED_ACTIONS per that file's own
-- documented convention:
--   1. v_actions' direct-caller backstop default array gains the 2 new
--      actions.
--   2. The per-row case (k.action) projection gains 2 branches, both
--      projecting '{}'::jsonb — neither event carries a free-text or
--      sensitive payload field, so there is nothing to redact.

create or replace function public.bunkai_list_activity(
  p_workspace_id      uuid,
  p_limit             int default 30,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null,
  p_actions           text[] default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit       int;
  v_actions     text[];
  v_items       jsonb;
  v_fetched     int;
  v_next_cursor jsonb;
  v_last        jsonb;
begin
  -- 1. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  -- 2. Allowlist backstop: the route always passes it explicitly (Decision 2);
  --    a direct/PAT caller that omits it gets the same MVP set, not "all".
  v_actions := coalesce(
    p_actions,
    array[
      'module.renamed', 'module.description_updated', 'module.moved', 'module.archived',
      'atc.created', 'test.created', 'run.finished', 'run.aborted',
      'bug.assigned', 'bug.reassigned', 'bug.unassigned', 'bug.status_changed',
      'export.requested', 'export.downloaded'
    ]::text[]
  );

  -- 3. Cursor backstop: the keyset position is a PAIR. Exactly one half is not
  --    a position — raise rather than silently degrade to the first page.
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'activity_cursor_invalid' using errcode = '45214';
  end if;

  -- 4-5. One keyset page (limit+1 probe) + per-row positive projection.
  with page as (
    select a.id, a.entity_type, a.entity_id, a.action, a.actor_user_id, a.created_at, a.payload
      from public.activity_log a
      where a.workspace_id = p_workspace_id
        and a.action = any(v_actions)
        and (
          p_cursor_created_at is null
          or p_cursor_id is null
          or (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id)
        )
      order by a.created_at desc, a.id desc
      limit v_limit + 1
  ),
  kept as (
    select * from page order by created_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'entity_type', k.entity_type,
                 'entity_id', k.entity_id,
                 'action', k.action,
                 'actor_user_id', k.actor_user_id,
                 'created_at', k.created_at,
                 'payload', case (k.action)
                   when 'module.renamed' then
                     jsonb_build_object('name', k.payload -> 'name', 'new_path', k.payload -> 'new_path')
                   when 'module.description_updated' then
                     -- source payload is always {} (0023) — no content leak.
                     '{}'::jsonb
                   when 'module.moved' then
                     jsonb_build_object('new_path', k.payload -> 'new_path')
                   when 'module.archived' then
                     jsonb_build_object(
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'atc.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'test.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'run.finished' then
                     jsonb_build_object('verdict', k.payload -> 'verdict', 'skipped_steps', k.payload -> 'skipped_steps')
                   when 'run.aborted' then
                     -- reason is DELIBERATELY excluded (Decision 3, Risk R3) —
                     -- free-text, unredacted operator input never leaves the
                     -- DB via this feed. Only skipped_steps is projected.
                     jsonb_build_object('skipped_steps', k.payload -> 'skipped_steps')
                   when 'bug.assigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.reassigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.unassigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.status_changed' then
                     jsonb_build_object(
                       'previous_status', k.payload -> 'previous_status',
                       'status', k.payload -> 'status',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'export.requested' then
                     '{}'::jsonb
                   when 'export.downloaded' then
                     '{}'::jsonb
                   else '{}'::jsonb
                 end
               ) order by k.created_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- 6. next_cursor: NULL when the probe row was absent (no further page).
  --    Otherwise the (created_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next_cursor);
end;
$$;

revoke execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) from public, anon;
grant execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) to authenticated, service_role;
