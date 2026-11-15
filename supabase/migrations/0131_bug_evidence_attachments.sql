-- 0131_bug_evidence_attachments.sql -- BK-594: attach screenshots as evidence when filing a defect
--
-- Governing record: the BK-594 "AI Product Owner - Decision" (P1-P5) and "AI Tech Lead -
-- Decision" (T1-T8) comments of 2026-11-15, the AI role-play PO/DEV answers of the same day,
-- ADR-0019 (file storage foundation, BK-593) and ADR-0012 (rpc-authorization-invariant).
--
-- Additive and idempotent: one table, two triggers, four new functions, and two copy-forwards:
--   * bunkai_bug_json (body from 0129) gains `evidence_attachments`;
--   * bunkai_create_bug (body from 0046) gains two TRAILING parameters with defaults,
--     p_evidence_attachment_ids and p_evidence_order. The old eleven-argument signature is
--     dropped in the same transaction so PostgREST never sees two overloads; the defaults keep
--     the eleven-argument call the deployed app makes working against this shared database.
--     Every existing check is kept verbatim, the evidence_urls CHECK of 0046 is untouched, and
--     45303 now counts links PLUS claimed uploads.
--
-- Storage (T1): the private `run-evidence` bucket of 0097 is reused unchanged, under the prefix
-- {workspace_id}/bug/{project_id}/{attachment_id}. The literal `bug` segment cannot collide with
-- the run layout ({workspace_id}/{run_id}/{run_step_id}/{attachment_id}, all uuids). Same bucket
-- limits (10 MiB, PNG/JPEG/WebP), same absence of any client storage.objects policy, same
-- storage_cleanup_queue outbox and not_before hold.
--
-- Lifecycle of one row (T2, DEV-1): `pending` (init) -> `committed`, unclaimed (commit) ->
-- claimed by exactly one defect (bunkai_create_bug sets bug_id and position). Every unclaimed
-- row carries expires_at = created_at + 3 hours, committed or not, so an upload never filed
-- expires (AC-23). A claimed row is frozen: evidence is fixed at filing (AC-11).
--
-- Custom SQLSTATE codes (bugs domain, 453xx block; 45314 was the highest, 0129; 45315-45318
-- verified free by grep before writing this file):
--   45303  bug_evidence_limit_exceeded  REUSED (0046). HINT carries the reason:
--                                       count (more than 10 items) | bytes (more than 50 MiB) |
--                                       file_bytes (one file outside 1 byte..10 MiB)
--   45315  bug_evidence_unavailable     an attachment id that is not the actor's own committed,
--                                       unclaimed, unexpired upload in this Workspace and Project
--                                       (non-disclosing: missing, foreign, pending, claimed and
--                                       expired are one answer)
--   45316  bug_evidence_order_invalid   evidence_order does not place every upload exactly once
--                                       inside the combined list
--   45317  bug_evidence_frozen          a claimed row cannot be discarded or changed
--   45318  bug_evidence_upload_expired  commit of an upload whose 3 hour window lapsed
-- Reused: 42501 (a viewer may not write), P0002 (missing, foreign workspace, no session) and
-- 22023 (a content type, filename or draft id the route should have rejected first).
--
-- Security posture (ADR-0012):
--   * init, commit and discard are SECURITY DEFINER with NO identity parameter: the actor is
--     auth.uid(), so they are called through the caller's RLS-scoped client. A caller with no
--     session gets P0002 (fail closed).
--   * bunkai_create_bug keeps its explicit-actor contract (Path A, 0046): the route calls it
--     with the service-role client, auth.uid() is null and p_actor_user_id is the identity; a
--     present-but-different uid is still the P0002 spoof answer. The claim compares
--     created_by with p_actor_user_id, never with auth.uid().
--   * Reads are plain RLS selects: the policy exposes CLAIMED rows of the caller's own live
--     Workspaces only. An unclaimed upload is invisible to everybody, its uploader included.
--   * qa_inspector_ro: the 0085 default privilege hands every new function to both QA roles.
--     All five functions below are writers, so the read-only role is revoked explicitly (0088).
--
-- Keep this file ASCII only: the apply ledger lost a literal NBSP once (0095 -> 0096).

-- ============================================================================
-- 1. bug_evidence_attachments
-- ============================================================================

create table if not exists public.bug_evidence_attachments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,
  -- One uuid per open Report-bug drawer (T3): the unit the 10 item / 50 MiB cap is counted on
  -- before the defect exists.
  draft_id          uuid not null,
  bug_id            uuid references public.bugs(id) on delete cascade,
  -- Place in the defect's combined evidence list (links and uploads together), 0-based.
  position          smallint,
  -- {workspace_id}/bug/{project_id}/{attachment_id}: lowercase uuids, no extension, never the
  -- user filename. Chosen by the init function, never by the client.
  storage_path      text not null unique,
  -- Display only. Never used to build a path or to decide the type.
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type      text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size         bigint not null check (byte_size between 1 and 10485760),
  status            text not null default 'pending' check (status in ('pending', 'committed')),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  committed_at      timestamptz,
  claimed_at        timestamptz,
  expires_at        timestamptz,
  constraint bug_evidence_attachments_state_check check (
    (status = 'pending' and committed_at is null and bug_id is null and position is null
      and claimed_at is null and expires_at is not null)
    or (status = 'committed' and committed_at is not null and bug_id is null and position is null
      and claimed_at is null and expires_at is not null)
    or (status = 'committed' and committed_at is not null and bug_id is not null
      and position between 0 and 9 and claimed_at is not null and expires_at is null)
  )
);

create unique index if not exists bug_evidence_attachments_bug_position_key
  on public.bug_evidence_attachments (bug_id, position) where bug_id is not null;
create index if not exists bug_evidence_attachments_draft_idx
  on public.bug_evidence_attachments (created_by, draft_id) where bug_id is null;
create index if not exists bug_evidence_attachments_unclaimed_expiry_idx
  on public.bug_evidence_attachments (expires_at) where bug_id is null;
create index if not exists bug_evidence_attachments_project_idx
  on public.bug_evidence_attachments (project_id);
create index if not exists bug_evidence_attachments_workspace_idx
  on public.bug_evidence_attachments (workspace_id);

alter table public.bug_evidence_attachments enable row level security;

-- Members read CLAIMED rows only. No insert/update/delete policy for any client role.
drop policy if exists bug_evidence_attachments_select_workspace_member on public.bug_evidence_attachments;
create policy bug_evidence_attachments_select_workspace_member
  on public.bug_evidence_attachments
  for select
  using (
    bug_id is not null
    and status = 'committed'
    and public.bunkai_is_workspace_member(workspace_id)
  );

revoke all on public.bug_evidence_attachments from anon, authenticated;
grant select on public.bug_evidence_attachments to authenticated;
grant select, insert, update, delete on public.bug_evidence_attachments to service_role;

-- ============================================================================
-- 2. Triggers: outbox on delete, frozen claimed rows, totals re-check
-- ============================================================================

-- AFTER DELETE: a discard, an expiry, a defect cascade and a workspace purge all enqueue their
-- object with no extra code (ADR-0019 decision 7, same not_before hold as 0097).
create or replace function public.bunkai_enqueue_bug_evidence_cleanup()
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
    case
      when old.status = 'pending' then 'pending_discarded'
      when old.bug_id is null then 'bug_evidence_unclaimed'
      else 'bug_evidence_deleted'
    end,
    greatest(now(), old.created_at + interval '2 hours 5 minutes')
  );
  return old;
end;
$$;

revoke execute on function public.bunkai_enqueue_bug_evidence_cleanup() from public, anon, authenticated;

drop trigger if exists bug_evidence_attachments_enqueue_cleanup on public.bug_evidence_attachments;
create trigger bug_evidence_attachments_enqueue_cleanup
  after delete on public.bug_evidence_attachments
  for each row execute function public.bunkai_enqueue_bug_evidence_cleanup();

-- BEFORE UPDATE: a claimed row is frozen (AC-11). Only created_by may still change, because the
-- auth.users foreign key sets it to null when the uploader's account is deleted.
create or replace function public.bunkai_bug_evidence_guard_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.bug_id is not null and (
    new.bug_id is distinct from old.bug_id
    or new.position is distinct from old.position
    or new.storage_path is distinct from old.storage_path
    or new.byte_size is distinct from old.byte_size
    or new.content_type is distinct from old.content_type
    or new.original_filename is distinct from old.original_filename
    or new.status is distinct from old.status
    or new.workspace_id is distinct from old.workspace_id
    or new.project_id is distinct from old.project_id
    or new.expires_at is distinct from old.expires_at
    or new.claimed_at is distinct from old.claimed_at
  ) then
    raise exception 'bug_evidence_frozen' using errcode = '45317';
  end if;
  return new;
end;
$$;

revoke execute on function public.bunkai_bug_evidence_guard_frozen() from public, anon, authenticated;

drop trigger if exists bug_evidence_attachments_guard_frozen on public.bug_evidence_attachments;
create trigger bug_evidence_attachments_guard_frozen
  before update on public.bug_evidence_attachments
  for each row execute function public.bunkai_bug_evidence_guard_frozen();

-- Constraint trigger (DEV-2, AC-19): any insert or claim that attaches a row to a defect
-- re-checks the defect's totals (links + uploads <= 10, uploads <= 50 MiB) and that the row
-- belongs to the defect's own Workspace and Project. It fires after the statement's rows are
-- written, so a claim of several rows in one UPDATE is counted as a whole.
create or replace function public.bunkai_bug_evidence_check_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_links        int;
  v_workspace_id uuid;
  v_project_id   uuid;
  v_count        int;
  v_bytes        bigint;
begin
  if new.bug_id is null then
    return null;
  end if;

  select coalesce(array_length(b.evidence_urls, 1), 0), b.workspace_id, b.project_id
    into v_links, v_workspace_id, v_project_id
    from public.bugs b
    where b.id = new.bug_id;
  if v_workspace_id is distinct from new.workspace_id or v_project_id is distinct from new.project_id then
    raise exception 'bug_evidence_unavailable' using errcode = '45315';
  end if;

  select count(*), coalesce(sum(byte_size), 0)
    into v_count, v_bytes
    from public.bug_evidence_attachments
    where bug_id = new.bug_id;

  if v_links + v_count > 10 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'count';
  end if;
  if v_bytes > 52428800 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'bytes';
  end if;
  return null;
end;
$$;

revoke execute on function public.bunkai_bug_evidence_check_totals() from public, anon, authenticated;

drop trigger if exists bug_evidence_attachments_check_totals on public.bug_evidence_attachments;
create constraint trigger bug_evidence_attachments_check_totals
  after insert or update of bug_id on public.bug_evidence_attachments
  for each row execute function public.bunkai_bug_evidence_check_totals();

-- ============================================================================
-- 3. Serializer (row -> public jsonb, never the storage path)
-- ============================================================================

create or replace function public.bunkai_bug_evidence_json(a public.bug_evidence_attachments)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'project_id', a.project_id,
    'draft_id', a.draft_id,
    'bug_id', a.bug_id,
    'position', a.position,
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

revoke execute on function public.bunkai_bug_evidence_json(public.bug_evidence_attachments) from public, anon, authenticated;

-- ============================================================================
-- 4. bunkai_init_bug_evidence
-- ============================================================================
--
-- Order is load-bearing: (1) no session -> P0002; (2) resolve the project (missing -> P0002);
-- (3) not a member -> P0002; (4) not member+ -> 42501; (5) argument backstops; (6) serialize
-- per uploader and draft (transaction advisory lock), then the draft caps on live unclaimed
-- rows, declared sizes; (7) insert the pending row. Returns {attachment, storage_path}: the
-- route signs the upload URL for storage_path and never echoes it to the client.

create or replace function public.bunkai_init_bug_evidence(
  p_project_id   uuid,
  p_draft_id     uuid,
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
  v_filename     text := btrim(coalesce(p_filename, ''), E' \t\r\n\f\x0b');
  v_id           uuid := gen_random_uuid();
  v_path         text;
  v_count        int;
  v_bytes        bigint;
  v_row          public.bug_evidence_attachments%rowtype;
begin
  if v_actor is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  select p.workspace_id into v_workspace_id from public.projects p where p.id = p_project_id;
  if v_workspace_id is null or not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_draft_id is null then
    raise exception 'bug_evidence_draft_invalid' using errcode = '22023';
  end if;
  if p_content_type is null or p_content_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception 'bug_evidence_content_type_invalid' using errcode = '22023';
  end if;
  if v_filename = '' or char_length(v_filename) > 255 then
    raise exception 'bug_evidence_filename_invalid' using errcode = '22023';
  end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'file_bytes';
  end if;

  -- Two parallel inits of one drawer cannot both squeeze under a cap.
  perform pg_advisory_xact_lock(hashtextextended('bug_evidence:' || v_actor::text || ':' || p_draft_id::text, 0));

  select count(*), coalesce(sum(byte_size), 0)
    into v_count, v_bytes
    from public.bug_evidence_attachments
    where created_by = v_actor
      and draft_id = p_draft_id
      and bug_id is null
      and expires_at > now();

  if v_count >= 10 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'count';
  end if;
  if v_bytes + p_byte_size > 52428800 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'bytes';
  end if;

  v_path := v_workspace_id::text || '/bug/' || p_project_id::text || '/' || v_id::text;

  insert into public.bug_evidence_attachments (
    id, workspace_id, project_id, draft_id, storage_path, original_filename,
    content_type, byte_size, status, created_by, expires_at
  ) values (
    v_id, v_workspace_id, p_project_id, p_draft_id, v_path, v_filename,
    p_content_type, p_byte_size, 'pending', v_actor, now() + interval '3 hours'
  )
  returning * into v_row;

  return jsonb_build_object(
    'attachment', public.bunkai_bug_evidence_json(v_row),
    'storage_path', v_path
  );
end;
$$;

-- ============================================================================
-- 5. bunkai_commit_bug_evidence
-- ============================================================================
--
-- p_byte_size is the size the ROUTE read from Storage metadata after validating the object.
-- Order: (1) no session -> P0002; (2) lock-free read, not a member or not the uploader ->
-- P0002; (3) the draft lock, then the row FOR UPDATE, re-checked; (4) already committed (or
-- claimed) -> the same body again, nothing written (idempotent retry); (5) expired -> 45318;
-- (6) not member+ -> 42501; (7) size backstop and the draft caps on COMMITTED live rows plus
-- the actual size (a client that declared less than it uploaded still cannot exceed a cap);
-- (8) flip to committed. No activity row: there is no defect yet.

create or replace function public.bunkai_commit_bug_evidence(
  p_attachment_id uuid,
  p_byte_size     bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := auth.uid();
  v_row          public.bug_evidence_attachments%rowtype;
  v_workspace_id uuid;
  v_creator      uuid;
  v_draft_id     uuid;
  v_count        int;
  v_bytes        bigint;
begin
  if v_actor is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  select workspace_id, created_by, draft_id into v_workspace_id, v_creator, v_draft_id
    from public.bug_evidence_attachments where id = p_attachment_id;
  if v_workspace_id is null
     or not public.bunkai_is_workspace_member(v_workspace_id)
     or v_creator is distinct from v_actor then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bug_evidence:' || v_actor::text || ':' || v_draft_id::text, 0));
  select * into v_row from public.bug_evidence_attachments where id = p_attachment_id for update;
  if v_row.id is null or v_row.created_by is distinct from v_actor then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  if v_row.status = 'committed' then
    return jsonb_build_object('attachment', public.bunkai_bug_evidence_json(v_row));
  end if;

  if v_row.expires_at <= now() then
    raise exception 'bug_evidence_upload_expired' using errcode = '45318';
  end if;
  if not public.bunkai_can_write_workspace(v_row.workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'file_bytes';
  end if;

  select count(*), coalesce(sum(byte_size), 0)
    into v_count, v_bytes
    from public.bug_evidence_attachments
    where created_by = v_actor
      and draft_id = v_row.draft_id
      and bug_id is null
      and status = 'committed'
      and expires_at > now();

  if v_count >= 10 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'count';
  end if;
  if v_bytes + p_byte_size > 52428800 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'bytes';
  end if;

  update public.bug_evidence_attachments
    set status = 'committed',
        byte_size = p_byte_size,
        committed_at = now()
    where id = p_attachment_id
    returning * into v_row;

  return jsonb_build_object('attachment', public.bunkai_bug_evidence_json(v_row));
end;
$$;

-- ============================================================================
-- 6. bunkai_discard_bug_evidence
-- ============================================================================
--
-- The uploader removes an upload that was never filed (the drawer's remove, or a commit whose
-- content was refused). Order: (1) no session -> P0002; (2) not a member or not the uploader ->
-- P0002; (3) the row FOR UPDATE, re-checked; (4) claimed -> 45317 (evidence on a filed defect
-- is frozen); (5) not member+ -> 42501; (6) delete (the AFTER DELETE trigger enqueues the
-- object). Works on a pending row too.

create or replace function public.bunkai_discard_bug_evidence(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := auth.uid();
  v_row          public.bug_evidence_attachments%rowtype;
  v_workspace_id uuid;
  v_creator      uuid;
begin
  if v_actor is null then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  select workspace_id, created_by into v_workspace_id, v_creator
    from public.bug_evidence_attachments where id = p_attachment_id;
  if v_workspace_id is null
     or not public.bunkai_is_workspace_member(v_workspace_id)
     or v_creator is distinct from v_actor then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;

  select * into v_row from public.bug_evidence_attachments where id = p_attachment_id for update;
  if v_row.id is null or v_row.created_by is distinct from v_actor then
    raise exception 'attachment_not_found' using errcode = 'P0002';
  end if;
  if v_row.bug_id is not null then
    raise exception 'bug_evidence_frozen' using errcode = '45317';
  end if;
  if not public.bunkai_can_write_workspace(v_row.workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.bug_evidence_attachments where id = p_attachment_id;

  return jsonb_build_object('id', v_row.id, 'storage_path', v_row.storage_path, 'status', v_row.status);
end;
$$;

-- ============================================================================
-- 7. bunkai_expire_bug_evidence -- sweep helper, service role only
-- ============================================================================
--
-- Deletes unclaimed rows (pending or committed) whose 3 hour window lapsed; the AFTER DELETE
-- trigger enqueues their objects. SECURITY INVOKER with no identity parameter: it can run only
-- as a role that holds DELETE on the table (service_role). SKIP LOCKED leaves a row a
-- concurrent claim holds to the next sweep; a claim re-checks expiry under its own lock.

create or replace function public.bunkai_expire_bug_evidence(p_limit int default 500)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  with doomed as (
    select id from public.bug_evidence_attachments
    where bug_id is null and expires_at < now()
    order by expires_at
    limit greatest(coalesce(p_limit, 500), 1)
    for update skip locked
  ), gone as (
    delete from public.bug_evidence_attachments a
    using doomed d
    where a.id = d.id
    returning a.id
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

-- ============================================================================
-- 8. bunkai_bug_json -- 0129's body plus evidence_attachments
-- ============================================================================
-- Still `language sql stable`, still SECURITY INVOKER. `evidence_attachments` lists the
-- defect's claimed uploads ordered by position, never the storage path. Read through the
-- caller's own client it is filtered by the table's select policy (claimed rows of the
-- caller's own Workspaces); the defect row itself is already filtered the same way.

create or replace function public.bunkai_bug_json(p_bug_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'workspace_id', b.workspace_id,
    'project_id', b.project_id,
    'module_id', b.module_id,
    'module', (
      select jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'path', m.path,
        'archived_at', m.archived_at
      )
        from public.modules m
        where m.id = b.module_id
    ),
    'run_id', b.run_id,
    'run_step_id', b.run_step_id,
    'atc_id', b.atc_id,
    'title', b.title,
    'severity', b.severity,
    'status', b.status,
    'description', b.description,
    'steps_to_reproduce', b.steps_to_reproduce,
    'evidence_urls', to_jsonb(b.evidence_urls),
    'evidence_attachments', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', a.id,
                 'position', a.position,
                 'filename', a.original_filename,
                 'content_type', a.content_type,
                 'byte_size', a.byte_size
               ) order by a.position)
        from public.bug_evidence_attachments a
        where a.bug_id = b.id
          and a.status = 'committed'
    ), '[]'::jsonb),
    'assignee_user_id', b.assignee_user_id,
    'content_version', b.content_version,
    'created_by', b.created_by,
    'created_at', b.created_at,
    'updated_at', b.updated_at,
    'origin', case
      when b.run_id is null and b.atc_id is null then null
      else jsonb_build_object(
        'run_id', b.run_id,
        'run_step_position', (
          select rs.position
            from public.run_steps rs
            where rs.id = b.run_step_id
        ),
        'atc_id', b.atc_id,
        'atc_title', (
          select a.title
            from public.atcs a
            where a.id = b.atc_id
        ),
        'atc_layer', (
          select a.layer
            from public.atcs a
            where a.id = b.atc_id
        )
      )
    end
  )
  from public.bugs b
  where b.id = p_bug_id;
$$;

revoke execute on function public.bunkai_bug_json(uuid) from public, anon;
grant execute on function public.bunkai_bug_json(uuid) to authenticated, service_role;

-- ============================================================================
-- 9. bunkai_create_bug -- 0046's body plus the claim of uploaded evidence
-- ============================================================================
--
-- Steps 0 to 2b and the title / severity backstops are 0046's, verbatim. New (T4, T5):
--   3c. Totals: links + uploads > 10 -> 45303 (hint count), before any row is locked.
--   3d. The ids: no null, no duplicate -> 45315. The order: evidence_order[i] is the position
--       of evidence_attachment_ids[i] in the combined list; same length, no null, distinct,
--       inside 0..total-1 -> else 45316. Omitted, uploads follow the links.
--   3e. Lock the referenced rows FOR UPDATE in id order, keeping only the actor's own,
--       committed, unclaimed, unexpired uploads in this Workspace and Project. A row a
--       concurrent filing claimed first is re-evaluated after its lock and drops out. Fewer
--       rows than ids -> 45315. Their bytes above 50 MiB -> 45303 (hint bytes).
--   4.  Insert the defect, then claim the rows (bug_id, position, claimed_at; expires_at
--       cleared). The constraint trigger re-checks the totals on the claim.

drop function if exists public.bunkai_create_bug(
  uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid
);

create or replace function public.bunkai_create_bug(
  p_actor_user_id           uuid,
  p_project_id              uuid,
  p_module_id               uuid,
  p_title                   text,
  p_severity                text,
  p_description             text,
  p_steps_to_reproduce      text,
  p_evidence_urls           text[],
  p_run_id                  uuid,
  p_run_step_id             uuid,
  p_atc_id                  uuid,
  p_evidence_attachment_ids uuid[] default null,
  p_evidence_order          int[]  default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_module_project uuid;
  v_title          text := btrim(coalesce(p_title, ''));
  v_description    text := nullif(btrim(coalesce(p_description, '')), '');
  v_steps          text := coalesce(p_steps_to_reproduce, '');
  v_evidence       text[] := coalesce(p_evidence_urls, '{}');
  v_ids            uuid[] := coalesce(p_evidence_attachment_ids, '{}');
  v_order          int[];
  v_links          int;
  v_uploads        int;
  v_total          int;
  v_found          int;
  v_bytes          bigint;
  v_bug_id         uuid;
begin
  -- 0. Actor bind (0046).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. AuthZ + project resolution (0046).
  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, p_project_id);

  -- 2. Module must exist and belong to THIS project (0046).
  if p_run_id is null then
    select project_id into v_module_project
      from public.modules
      where id = p_module_id and archived_at is null;
  else
    select project_id into v_module_project
      from public.modules
      where id = p_module_id;
  end if;
  if v_module_project is null or v_module_project <> p_project_id then
    raise exception 'bugs_module_outside_project' using errcode = '45300';
  end if;

  -- 2b. Run-linked provenance cross-validation (0046).
  if p_run_id is not null then
    if not exists (
      select 1 from public.runs
      where id = p_run_id and project_id = p_project_id
    ) then
      raise exception 'bugs_run_outside_project' using errcode = '45305';
    end if;
  end if;

  if p_run_step_id is not null then
    if not exists (
      select 1
        from public.run_steps rs
        join public.run_atcs ra on ra.id = rs.run_atc_id
        where rs.id = p_run_step_id and ra.run_id = p_run_id
    ) then
      raise exception 'bugs_run_step_outside_run' using errcode = '45306';
    end if;
  end if;

  if p_atc_id is not null then
    if not exists (
      select 1 from public.atcs
      where id = p_atc_id and project_id = p_project_id
    ) then
      raise exception 'bugs_atc_outside_project' using errcode = '45307';
    end if;
  end if;

  -- 3. RPC-level backstops (0046).
  if char_length(v_title) < 5 or char_length(v_title) > 200 then
    raise exception 'bug_title_invalid' using errcode = '45301';
  end if;
  if p_severity is null or p_severity not in ('P1', 'P2', 'P3', 'P4') then
    raise exception 'bug_severity_invalid' using errcode = '45302';
  end if;

  -- 3c. One budget of ten, links and uploads together.
  v_links := coalesce(array_length(v_evidence, 1), 0);
  v_uploads := coalesce(array_length(v_ids, 1), 0);
  v_total := v_links + v_uploads;
  if v_total > 10 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'count';
  end if;

  -- 3d. Ids and order.
  if array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) as x) <> v_uploads then
    raise exception 'bug_evidence_unavailable' using errcode = '45315';
  end if;
  if p_evidence_order is null then
    v_order := array(select v_links + g - 1 from generate_series(1, v_uploads) as g);
  else
    v_order := p_evidence_order;
    if coalesce(array_length(v_order, 1), 0) <> v_uploads
       or array_position(v_order, null) is not null
       or (select count(distinct x) from unnest(v_order) as x) <> v_uploads
       or exists (select 1 from unnest(v_order) as x where x < 0 or x >= v_total) then
      raise exception 'bug_evidence_order_invalid' using errcode = '45316';
    end if;
  end if;

  -- 3e. Lock and verify the uploads.
  if v_uploads > 0 then
    select count(*), coalesce(sum(s.byte_size), 0)
      into v_found, v_bytes
      from (
        select a.id, a.byte_size
          from public.bug_evidence_attachments a
          where a.id = any (v_ids)
            and a.created_by = p_actor_user_id
            and a.workspace_id = v_workspace_id
            and a.project_id = p_project_id
            and a.status = 'committed'
            and a.bug_id is null
            and a.expires_at > now()
          order by a.id
          for update
      ) s;
    if v_found <> v_uploads then
      raise exception 'bug_evidence_unavailable' using errcode = '45315';
    end if;
    if v_bytes > 52428800 then
      raise exception 'bug_evidence_limit_exceeded' using errcode = '45303', hint = 'bytes';
    end if;
  end if;

  -- 4. Insert (0046), then claim the uploads.
  insert into public.bugs (
    workspace_id, project_id, module_id, run_id, run_step_id, atc_id,
    title, severity, description, steps_to_reproduce, evidence_urls, created_by
  )
  values (
    v_workspace_id, p_project_id, p_module_id, p_run_id, p_run_step_id, p_atc_id,
    v_title, p_severity, v_description, v_steps, v_evidence, p_actor_user_id
  )
  returning id into v_bug_id;

  if v_uploads > 0 then
    update public.bug_evidence_attachments a
      set bug_id = v_bug_id,
          position = o.pos::smallint,
          claimed_at = now(),
          expires_at = null
      from unnest(v_ids, v_order) as o(id, pos)
      where a.id = o.id;
  end if;

  -- 5. Audit (0046 payload plus the upload count).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'bug', v_bug_id, 'bug.filed',
    jsonb_build_object(
      'title', v_title,
      'severity', p_severity,
      'run_id', p_run_id,
      'run_step_id', p_run_step_id,
      'evidence_attachment_count', v_uploads
    )
  );

  -- 6. Return the composed bug json.
  return public.bunkai_bug_json(v_bug_id);
end;
$$;

-- ============================================================================
-- 10. Grants
-- ============================================================================

revoke execute on function public.bunkai_create_bug(
  uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid, uuid[], int[]
) from public, anon;
grant execute on function public.bunkai_create_bug(
  uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid, uuid[], int[]
) to authenticated, service_role;

revoke execute on function public.bunkai_init_bug_evidence(uuid, uuid, text, text, bigint) from public, anon;
grant  execute on function public.bunkai_init_bug_evidence(uuid, uuid, text, text, bigint) to authenticated, service_role;
revoke execute on function public.bunkai_commit_bug_evidence(uuid, bigint) from public, anon;
grant  execute on function public.bunkai_commit_bug_evidence(uuid, bigint) to authenticated, service_role;
revoke execute on function public.bunkai_discard_bug_evidence(uuid) from public, anon;
grant  execute on function public.bunkai_discard_bug_evidence(uuid) to authenticated, service_role;

revoke execute on function public.bunkai_expire_bug_evidence(int) from public, anon, authenticated;
grant  execute on function public.bunkai_expire_bug_evidence(int) to service_role;

-- 0088 mechanism: the 0085 default privilege hands every new function to BOTH QA roles. These
-- are volatile writers, so the read-only role must not keep them.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_create_bug(
      uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid, uuid[], int[]
    ) from qa_inspector_ro;
    revoke all on function public.bunkai_init_bug_evidence(uuid, uuid, text, text, bigint) from qa_inspector_ro;
    revoke all on function public.bunkai_commit_bug_evidence(uuid, bigint) from qa_inspector_ro;
    revoke all on function public.bunkai_discard_bug_evidence(uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_expire_bug_evidence(int) from qa_inspector_ro;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('anon', 'public.bunkai_create_bug(uuid,uuid,uuid,text,text,text,text,text[],uuid,uuid,uuid,uuid[],integer[])', 'EXECUTE');            -- false
--   select has_function_privilege('authenticated', 'public.bunkai_create_bug(uuid,uuid,uuid,text,text,text,text,text[],uuid,uuid,uuid,uuid[],integer[])', 'EXECUTE');   -- true
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_create_bug(uuid,uuid,uuid,text,text,text,text,text[],uuid,uuid,uuid,uuid[],integer[])', 'EXECUTE'); -- false
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_init_bug_evidence(uuid,uuid,text,text,bigint)', 'EXECUTE');                                      -- false
--   select has_function_privilege('authenticated', 'public.bunkai_expire_bug_evidence(integer)', 'EXECUTE');                                                          -- false
--   select count(*) from pg_proc where proname = 'bunkai_create_bug' and pronamespace = 'public'::regnamespace;                                                       -- 1
--   select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and qual ilike '%run-evidence%';                                         -- 0
