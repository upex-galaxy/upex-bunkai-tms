-- 0097_run_step_attachments.sql -- BK-593: attach screenshot evidence to a run step
--
-- ADDITIVE only: one table, one outbox table, one trigger, one private storage bucket,
-- five functions. No existing table, policy or function is changed: finish, abort, mark
-- and bunkai_run_json are untouched (the attachments are exposed through their own list
-- endpoint, never through the composed Run json).
--
-- Decisions followed (Jira BK-593: AI Product Owner and AI Tech Lead comments, 2026-10-19;
-- the storage foundation is recorded in ADR-0019):
--   * Several attachments per step, max 10, append-only plus remove-own while running.
--   * PNG, JPEG, WebP. 10 MiB per file, 50 MiB per step, 250 MiB per Run, all inclusive.
--   * Permissions: member/admin/owner attach, only the uploader removes, every workspace
--     member reads, a terminal Run is read-only forever.
--   * Terminal race: init, commit and remove take FOR UPDATE on the runs row (same boundary
--     as bunkai_mark_run_step 0042, bunkai_abort_run 0036 and bunkai_finish_run 0037). The
--     loser gets 45216. Nothing becomes visible before commit. Finish and abort need no edit.
--   * Upload path: init (this file) -> browser PUT to a Storage signed upload URL -> commit
--     (this file). Bytes never cross a Vercel Function (4.5 MB body cap).
--   * Private bucket with bucket-level size and MIME limits and NO storage.objects policy for
--     anon or authenticated (same shape as workspace-exports in 0083): every object is read
--     and written only by the service-role client after an RPC or RLS check.
--   * Cleanup: an AFTER DELETE trigger on the attachment table feeds a generic outbox
--     (storage_cleanup_queue). A daily sweep route drains it and expires stale pending rows.
--
-- Custom SQLSTATE codes (class 45xxx, 452xx block; 45203 reserved by 0031, 45204-45213 used
-- by the other run functions, 45214/45215 free; verified by grep before writing this file):
--   45216  attachment_run_closed       the Run is not 'running' (init, commit, remove)
--   45217  attachment_limit_exceeded   HINT carries the reason: step_count | step_bytes |
--                                      run_bytes | file_bytes
--   45218  attachment_pending_expired  commit of a pending row whose upload window lapsed or
--                                      that the sweep already removed
--   45219  attachment_not_removable    HINT 'not_uploader': only the uploader removes
-- Reused: 42501 (a viewer may not write) and P0002 (missing, foreign workspace, no session:
-- non-disclosing). 22023 is raised for a content type or filename the route should have
-- rejected first.
--
-- Security posture (ADR-0012: delete the identity parameter instead of guarding it):
--   * The three writers are SECURITY DEFINER and take NO identity or scope parameter. The
--     actor is auth.uid(). DEFINER is required: the table has no client write policy and
--     activity_log is DEFINER-only. A caller with no session (service role, anon) is not a
--     member of anything and gets P0002: fail closed.
--   * Each writer resolves the Run from the row it locks and reads and returns exactly one
--     attachment row. There is no set-returning path and no caller-supplied workspace id.
--   * Authorization runs BEFORE the state check, so a caller who may not touch a Run learns
--     nothing about its state.
--   * Listing and content resolution are plain RLS selects (SECURITY INVOKER): the select
--     policy exposes COMMITTED rows of the caller's own workspaces only.
--   * qa_inspector_ro: the 0085 default privilege hands every new function to both QA roles.
--     The writers are volatile, so the read-only role is revoked explicitly (0088 mechanism).
--
-- Keep this file ASCII only: the apply ledger lost a literal NBSP once (0095 -> 0096).

-- ============================================================================
-- 1. run_step_attachments
-- ============================================================================

create table if not exists public.run_step_attachments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  run_id            uuid not null references public.runs(id) on delete cascade,
  run_step_id       uuid not null references public.run_steps(id) on delete cascade,
  -- {workspace_id}/{run_id}/{run_step_id}/{attachment_id}: lowercase uuids, no extension,
  -- never the user filename. Chosen by the init function, never by the client.
  storage_path      text not null unique,
  -- Display only. Never used to build a path or to decide the type.
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type      text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size         bigint not null check (byte_size between 1 and 10485760),
  status            text not null default 'pending' check (status in ('pending', 'committed')),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  committed_at      timestamptz,
  -- Upload window of a pending row (3 hours; the signed upload token lives 2 hours and
  -- cannot be shortened, so this TTL plus the commit gate are the real control).
  expires_at        timestamptz,
  constraint run_step_attachments_state_check check (
    (status = 'pending' and committed_at is null and expires_at is not null)
    or (status = 'committed' and committed_at is not null and expires_at is null)
  )
);

create index if not exists run_step_attachments_run_step_idx
  on public.run_step_attachments (run_step_id);
create index if not exists run_step_attachments_run_idx
  on public.run_step_attachments (run_id);
create index if not exists run_step_attachments_pending_expiry_idx
  on public.run_step_attachments (expires_at) where status = 'pending';

alter table public.run_step_attachments enable row level security;

-- Members read COMMITTED rows only: a pending upload is invisible to everybody, so nobody
-- ever sees a half-stored attachment. No insert/update/delete policy for any client role.
drop policy if exists run_step_attachments_select_workspace_member on public.run_step_attachments;
create policy run_step_attachments_select_workspace_member
  on public.run_step_attachments
  for select
  using (status = 'committed' and public.bunkai_is_workspace_member(workspace_id));

revoke all on public.run_step_attachments from anon, authenticated;
grant select on public.run_step_attachments to authenticated;
grant select, insert, update, delete on public.run_step_attachments to service_role;

-- ============================================================================
-- 2. storage_cleanup_queue -- generic outbox for Storage objects to delete
-- ============================================================================
--
-- Deliberately has NO foreign key to a workspace or an owner row: rows must outlive the
-- cascade that deleted their source. Later file surfaces (BK-594 defect evidence) reuse it.

create table if not exists public.storage_cleanup_queue (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  path        text not null,
  reason      text not null,
  attempts    int  not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  -- The sweep ignores a row until this instant. A signed upload URL lives 2 hours and a
  -- replayed PUT after the row was deleted would recreate the object, so the entry for an
  -- attachment object is held back until its token is dead (ADR-0019).
  not_before  timestamptz not null default now(),
  done_at     timestamptz
);

create index if not exists storage_cleanup_queue_open_idx
  on public.storage_cleanup_queue (not_before) where done_at is null;

alter table public.storage_cleanup_queue enable row level security;

-- No policy at all: only the service-role sweep reads or writes it.
revoke all on public.storage_cleanup_queue from anon, authenticated;
grant select, insert, update, delete on public.storage_cleanup_queue to service_role;

-- AFTER DELETE on the attachment table: a remove, a Run delete and a workspace deletion
-- (both cascade through run_steps) all enqueue their object with no extra code. Pending rows
-- are enqueued too: the object may exist even though the row was never committed.
-- not_before = created_at + 2h05m (token lifetime plus margin): the inline delete done by the
-- route is only a fast path, the queued entry is what finally removes an object a replayed
-- PUT recreated. Rows older than that are due immediately.
create or replace function public.bunkai_enqueue_run_step_attachment_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_cleanup_queue (bucket, path, reason, not_before)
  values (
    'run-evidence',
    old.storage_path,
    case when old.status = 'pending' then 'pending_discarded' else 'attachment_deleted' end,
    greatest(now(), old.created_at + interval '2 hours 5 minutes')
  );
  return old;
end;
$$;

revoke execute on function public.bunkai_enqueue_run_step_attachment_cleanup() from public, anon, authenticated;

drop trigger if exists run_step_attachments_enqueue_cleanup on public.run_step_attachments;
create trigger run_step_attachments_enqueue_cleanup
  after delete on public.run_step_attachments
  for each row execute function public.bunkai_enqueue_run_step_attachment_cleanup();

-- ============================================================================
-- 3. Storage bucket -- private, service-role only
-- ============================================================================
--
-- Bucket-level limits are the last line of defence behind the route checks: Storage itself
-- refuses an object above 10 MiB or outside the three MIME types. NO storage.objects policy
-- is created for anon or authenticated: the bucket is written through signed upload URLs
-- minted by the service-role client and read through signed URLs minted after an RLS check,
-- so there is no client-facing policy to get wrong (same reasoning as 0083).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'run-evidence',
  'run-evidence',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ============================================================================
-- 4. Serializer (attachment row -> public jsonb, never the storage path)
-- ============================================================================

create or replace function public.bunkai_run_step_attachment_json(a public.run_step_attachments)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'run_id', a.run_id,
    'run_step_id', a.run_step_id,
    'filename', a.original_filename,
    'content_type', a.content_type,
    'byte_size', a.byte_size,
    'status', a.status,
    'created_by', a.created_by,
    'created_at', a.created_at,
    'committed_at', a.committed_at,
    'expires_at', a.expires_at
  );
$$;

revoke execute on function public.bunkai_run_step_attachment_json(public.run_step_attachments) from public, anon, authenticated;

-- ============================================================================
-- 5. bunkai_init_run_step_attachment
-- ============================================================================
--
-- Order is load-bearing: (1) no session -> P0002; (2) resolve step -> run under FOR UPDATE
-- OF the runs row (missing, or a step of another run -> P0002); (3) not a member -> P0002;
-- (4) not member+ -> 42501; (5) Run not running -> 45216; (6) argument backstops; (7) quotas;
-- (8) insert the pending row. Returns {attachment, storage_path}: the route signs the upload
-- URL for storage_path and never echoes it to the client.

create or replace function public.bunkai_init_run_step_attachment(
  p_run_id       uuid,
  p_run_step_id  uuid,
  p_filename     text,
  p_content_type text,
  p_byte_size    bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := auth.uid();
  v_workspace_id uuid;
  v_run_status   text;
  v_filename     text := btrim(coalesce(p_filename, ''), E' \t\r\n\f\x0b');
  v_id           uuid := gen_random_uuid();
  v_path         text;
  v_step_count   int;
  v_step_bytes   bigint;
  v_run_bytes    bigint;
  v_row          public.run_step_attachments%rowtype;
begin
  if v_actor is null then
    raise exception 'run_step_not_found' using errcode = 'P0002';
  end if;

  select r.workspace_id, r.status
    into v_workspace_id, v_run_status
    from public.run_steps rs
    join public.run_atcs ra on ra.id = rs.run_atc_id
    join public.runs r on r.id = ra.run_id
    where rs.id = p_run_step_id
      and ra.run_id = p_run_id
    for update of r;
  if v_workspace_id is null then
    raise exception 'run_step_not_found' using errcode = 'P0002';
  end if;

  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'run_step_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_run_status <> 'running' then
    raise exception 'attachment_run_closed' using errcode = '45216';
  end if;

  if p_content_type is null or p_content_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception 'attachment_content_type_invalid' using errcode = '22023';
  end if;
  if v_filename = '' or char_length(v_filename) > 255 then
    raise exception 'attachment_filename_invalid' using errcode = '22023';
  end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'file_bytes';
  end if;

  -- Quotas count committed rows plus pending rows whose window is still open (declared
  -- size). The runs row lock above serializes concurrent inits, so two parallel uploads
  -- cannot both squeeze under a limit.
  select count(*), coalesce(sum(byte_size), 0)
    into v_step_count, v_step_bytes
    from public.run_step_attachments
    where run_step_id = p_run_step_id
      and (status = 'committed' or expires_at > now());
  select coalesce(sum(byte_size), 0)
    into v_run_bytes
    from public.run_step_attachments
    where run_id = p_run_id
      and (status = 'committed' or expires_at > now());

  if v_step_count >= 10 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'step_count';
  end if;
  if v_step_bytes + p_byte_size > 52428800 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'step_bytes';
  end if;
  if v_run_bytes + p_byte_size > 262144000 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'run_bytes';
  end if;

  v_path := v_workspace_id::text || '/' || p_run_id::text || '/' || p_run_step_id::text || '/' || v_id::text;

  insert into public.run_step_attachments (
    id, workspace_id, run_id, run_step_id, storage_path, original_filename,
    content_type, byte_size, status, created_by, expires_at
  ) values (
    v_id, v_workspace_id, p_run_id, p_run_step_id, v_path, v_filename,
    p_content_type, p_byte_size, 'pending', v_actor, now() + interval '3 hours'
  )
  returning * into v_row;

  return jsonb_build_object(
    'attachment', public.bunkai_run_step_attachment_json(v_row),
    'storage_path', v_path
  );
end;
$$;

-- ============================================================================
-- 6. bunkai_commit_run_step_attachment
-- ============================================================================
--
-- p_byte_size is the size the ROUTE read from Storage metadata after validating the object
-- (magic bytes, declared type match, not animated). Order: (1) no session -> P0002; (2) the
-- row and its Run under FOR UPDATE (missing -> P0002); (3) not a member, or not the uploader
-- -> P0002; (4) already committed -> the same body again, nothing written (idempotent retry,
-- allowed even after the Run closed because it mutates nothing); (5) expired window -> 45218;
-- (6) not member+ -> 42501; (7) Run not running -> 45216; (8) size backstop and quotas on
-- COMMITTED rows plus the actual size (a client that declared less than it uploaded still
-- cannot exceed a limit); (9) flip to committed, audit.

create or replace function public.bunkai_commit_run_step_attachment(
  p_attachment_id uuid,
  p_byte_size     bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := auth.uid();
  v_row          public.run_step_attachments%rowtype;
  v_run_id       uuid;
  v_run_status   text;
  v_step_count   int;
  v_step_bytes   bigint;
  v_run_bytes    bigint;
begin
  if v_actor is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  -- Lock order is runs first, then the attachment row (the sweep only ever locks attachment
  -- rows, so there is no cycle). The row is re-read AFTER both locks are held.
  select run_id into v_run_id from public.run_step_attachments where id = p_attachment_id;
  if v_run_id is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;
  select status into v_run_status from public.runs where id = v_run_id for update;
  select * into v_row from public.run_step_attachments where id = p_attachment_id for update;
  if v_row.id is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  if not public.bunkai_is_workspace_member(v_row.workspace_id)
     or v_row.created_by is distinct from v_actor then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  if v_row.status = 'committed' then
    return jsonb_build_object('attachment', public.bunkai_run_step_attachment_json(v_row));
  end if;

  if v_row.expires_at <= now() then
    raise exception 'attachment_pending_expired' using errcode = '45218';
  end if;
  if not public.bunkai_can_write_workspace(v_row.workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_run_status <> 'running' then
    raise exception 'attachment_run_closed' using errcode = '45216';
  end if;

  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'file_bytes';
  end if;

  select count(*), coalesce(sum(byte_size), 0)
    into v_step_count, v_step_bytes
    from public.run_step_attachments
    where run_step_id = v_row.run_step_id and status = 'committed';
  select coalesce(sum(byte_size), 0)
    into v_run_bytes
    from public.run_step_attachments
    where run_id = v_row.run_id and status = 'committed';

  if v_step_count >= 10 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'step_count';
  end if;
  if v_step_bytes + p_byte_size > 52428800 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'step_bytes';
  end if;
  if v_run_bytes + p_byte_size > 262144000 then
    raise exception 'attachment_limit_exceeded' using errcode = '45217', hint = 'run_bytes';
  end if;

  update public.run_step_attachments
    set status = 'committed',
        byte_size = p_byte_size,
        committed_at = now(),
        expires_at = null
    where id = p_attachment_id
    returning * into v_row;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_row.workspace_id, v_actor, 'run_step', v_row.run_step_id, 'run_step.attachment_added',
    jsonb_build_object(
      'attachment_id', v_row.id,
      'content_type', v_row.content_type,
      'byte_size', v_row.byte_size
    )
  );

  return jsonb_build_object('attachment', public.bunkai_run_step_attachment_json(v_row));
end;
$$;

-- ============================================================================
-- 7. bunkai_remove_run_step_attachment
-- ============================================================================
--
-- Order: (1) no session -> P0002; (2) the row and its Run under FOR UPDATE (missing ->
-- P0002); (3) not a member -> P0002; (4) not the uploader -> 45219 hint not_uploader (a
-- plain member, a viewer, an admin: removal belongs to the person who added it); (5) not
-- member+ any more -> 42501; (6) Run not running -> 45216; (7) delete (the AFTER DELETE
-- trigger enqueues the object); audit for a committed row. Works on a pending row too, so a
-- failed commit validation can discard its own upload.

create or replace function public.bunkai_remove_run_step_attachment(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_row        public.run_step_attachments%rowtype;
  v_run_id     uuid;
  v_run_status text;
begin
  if v_actor is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  -- Lock order is runs first, then the attachment row (the sweep only ever locks attachment
  -- rows, so there is no cycle). The row is re-read AFTER both locks are held.
  select run_id into v_run_id from public.run_step_attachments where id = p_attachment_id;
  if v_run_id is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;
  select status into v_run_status from public.runs where id = v_run_id for update;
  select * into v_row from public.run_step_attachments where id = p_attachment_id for update;
  if v_row.id is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  if not public.bunkai_is_workspace_member(v_row.workspace_id) then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;
  if v_row.created_by is distinct from v_actor then
    raise exception 'attachment_not_removable' using errcode = '45219', hint = 'not_uploader';
  end if;
  if not public.bunkai_can_write_workspace(v_row.workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_run_status <> 'running' then
    raise exception 'attachment_run_closed' using errcode = '45216';
  end if;

  delete from public.run_step_attachments where id = p_attachment_id;

  if v_row.status = 'committed' then
    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_row.workspace_id, v_actor, 'run_step', v_row.run_step_id, 'run_step.attachment_removed',
      jsonb_build_object('attachment_id', v_row.id, 'content_type', v_row.content_type)
    );
  end if;

  return jsonb_build_object('id', v_row.id, 'storage_path', v_row.storage_path, 'status', v_row.status);
end;
$$;

-- ============================================================================
-- 8. bunkai_expire_pending_run_step_attachments -- sweep helper, service role only
-- ============================================================================
--
-- Deletes pending rows whose upload window lapsed; the AFTER DELETE trigger enqueues their
-- objects. SECURITY INVOKER with no identity parameter: it can run only as a role that holds
-- DELETE on the table (service_role), and EXECUTE is granted to nobody else. SKIP LOCKED
-- leaves a row a concurrent commit holds to the next sweep.

create or replace function public.bunkai_expire_pending_run_step_attachments(p_limit int default 500)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  with doomed as (
    select id from public.run_step_attachments
    where status = 'pending' and expires_at < now()
    order by expires_at
    limit greatest(coalesce(p_limit, 500), 1)
    for update skip locked
  ), gone as (
    delete from public.run_step_attachments a
    using doomed d
    where a.id = d.id
    returning a.id
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

-- ============================================================================
-- 9. Grants
-- ============================================================================

revoke execute on function public.bunkai_init_run_step_attachment(uuid, uuid, text, text, bigint) from public, anon;
grant  execute on function public.bunkai_init_run_step_attachment(uuid, uuid, text, text, bigint) to authenticated, service_role;
revoke execute on function public.bunkai_commit_run_step_attachment(uuid, bigint) from public, anon;
grant  execute on function public.bunkai_commit_run_step_attachment(uuid, bigint) to authenticated, service_role;
revoke execute on function public.bunkai_remove_run_step_attachment(uuid) from public, anon;
grant  execute on function public.bunkai_remove_run_step_attachment(uuid) to authenticated, service_role;

revoke execute on function public.bunkai_expire_pending_run_step_attachments(int) from public, anon, authenticated;
grant  execute on function public.bunkai_expire_pending_run_step_attachments(int) to service_role;

-- 0088 mechanism: the 0085 default privilege hands every new function to BOTH QA roles.
-- These four are volatile writers, so the read-only role must not keep them.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_init_run_step_attachment(uuid, uuid, text, text, bigint) from qa_inspector_ro;
    revoke all on function public.bunkai_commit_run_step_attachment(uuid, bigint) from qa_inspector_ro;
    revoke all on function public.bunkai_remove_run_step_attachment(uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_expire_pending_run_step_attachments(int) from qa_inspector_ro;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('anon', 'public.bunkai_init_run_step_attachment(uuid,uuid,text,text,bigint)', 'EXECUTE');          -- false
--   select has_function_privilege('authenticated', 'public.bunkai_init_run_step_attachment(uuid,uuid,text,text,bigint)', 'EXECUTE'); -- true
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_init_run_step_attachment(uuid,uuid,text,text,bigint)', 'EXECUTE'); -- false
--   select has_function_privilege('authenticated', 'public.bunkai_expire_pending_run_step_attachments(int)', 'EXECUTE');             -- false
--   select has_function_privilege('service_role', 'public.bunkai_expire_pending_run_step_attachments(int)', 'EXECUTE');              -- true
--   select public from storage.buckets where id = 'run-evidence';                                                                    -- false
--   select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and qual ilike '%run-evidence%';          -- 0
