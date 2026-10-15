-- 0091_project_tracker_settings.sql — BK-371: point a Project at a Jira destination
--
-- Ships the CONFIGURATION surface of the TMS-Defect Sync (BK-43 slice a) and
-- nothing that sends a Bug anywhere:
--   * project_tracker_settings  — one row per Project: destination Jira project
--                                 key, issue type, on/off. NO column can hold a
--                                 secret or a pointer to one (BK-43 ruling 12177
--                                 D6): credentials stay deployment-level.
--   * bugs sync-state columns   — the whole BK-43 ruling 12177 D5 ALTER TABLE
--                                 block, moved here from BK-372 by BK-371 T1 so
--                                 the re-queue below can be written and
--                                 observed in this story. BK-372 adds no column.
--   * bunkai_upsert_project_tracker_settings — the single write path: validates,
--                                 upserts, re-queues the Project's stranded Bugs
--                                 and writes the audit row in ONE transaction.
--
-- See ADR-0012 (RPC authorization invariant). Story-local decisions are in the
-- BK-371 implementation plan (Jira) and the BK-371 comments (PO Q1-Q6, Dev T1-T9).
--
-- RPC AUTHORIZATION (ADR-0012, rpc-authorization.md section 4, the six answers):
--   1. SECURITY DEFINER is required: one transaction spans project_tracker_settings
--      (upsert), bugs (bulk re-queue) and activity_log (audit), and the caller
--      holds no write path on bugs or activity_log under RLS.
--   2. The identity parameter cannot be deleted: the only caller is the
--      server-side admin client, where auth.uid() is NULL, so the explicit actor
--      is the only identity that exists. The risk is removed differently: the
--      function is granted to service_role ONLY. No signed-in user can reach it.
--   3. The actor bind sits at step 0, before any table read. Belt and braces: the
--      revoke below means an `authenticated` session is refused (42501) before
--      the body runs.
--   4. The single returned row is the project_tracker_settings row keyed by the
--      primary key the function just upserted, whose Project was resolved to the
--      asserted workspace at step 1. The bulk UPDATE on bugs is constrained on
--      EVERY row by project_id AND workspace_id, independently of the
--      membership assert.
--   5. Missing Project, foreign-workspace Project, soft-deleted workspace and
--      non-member all raise the SAME P0002 (project_not_found). A visible member
--      who is not owner/admin raises 42501; the route maps it to 403 only after
--      it has proved the Project is visible through RLS.
--   6. lib/tracker-settings/tracker-settings-isolation.test.ts proves it against
--      the real database (real authenticated session + spoofed actor, service
--      role + explicit actor, row scoping).
--
-- Custom SQLSTATE codes (class 45xxx, 454xx block; 45400 is notifications/0053):
--   45410  invalid_destination_key     (not ^[A-Z][A-Z0-9_]{1,9}$ after normalising)
--   45411  destination_required        (empty key after trimming)
--   45412  invalid_issue_type          (empty or > 60 chars after trimming)
--   45413  queue_confirmation_required (save would queue N > 0 Bugs and the
--                                       caller did not confirm exactly N; the
--                                       message carries N)
--   45414  queue_count_mismatch        (the Bugs queued differ from the count the
--                                       caller confirmed: one was filed meanwhile;
--                                       the whole call is rolled back)
--
-- Qualification of QA roles (0085 / 0086 / 0088): the table is created by the
-- migration owner, so the 0085 default privileges give qa_inspector_* the same
-- table CRUD they hold on every other table. The function is a volatile DEFINER
-- writer, so qa_inspector_ro is revoked explicitly (0088 mechanism). It is NOT
-- granted to `authenticated` or `anon` at all.

-- ============================================================================
-- 1. project_tracker_settings
-- ============================================================================

create table if not exists public.project_tracker_settings (
  project_id              uuid primary key references public.projects(id) on delete cascade,
  provider                text not null default 'jira_cloud'
                            check (provider = 'jira_cloud'),
  destination_project_key text not null
                            check (destination_project_key = btrim(destination_project_key)
                                   and destination_project_key ~ '^[A-Z][A-Z0-9_]{1,9}$'),
  issue_type_name         text not null default 'Bug'
                            check (issue_type_name = btrim(issue_type_name)
                                   and char_length(issue_type_name) between 1 and 60),
  enabled                 boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists project_tracker_settings_set_updated_at on public.project_tracker_settings;
create trigger project_tracker_settings_set_updated_at
  before update on public.project_tracker_settings
  for each row
  execute function public.bunkai_set_updated_at();

alter table public.project_tracker_settings enable row level security;

-- SELECT: any active member of the Project's (live) workspace. Same shape as
-- project_environments_select_workspace_member (0031); bunkai_is_workspace_member
-- is deleted-aware since 0084. NO client write policy: every write goes through
-- bunkai_upsert_project_tracker_settings (service_role only).
drop policy if exists project_tracker_settings_select_workspace_member on public.project_tracker_settings;
create policy project_tracker_settings_select_workspace_member
  on public.project_tracker_settings
  for select
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_tracker_settings.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

-- ============================================================================
-- 2. bugs — sync-state columns (BK-43 ruling 12177 D5, moved here by BK-371 T1)
-- ============================================================================
-- Defaults make every existing Bug 'not_applicable', so this migration queues
-- nothing by itself (AC-6.2).

alter table public.bugs
  add column if not exists sync_state text not null default 'not_applicable'
    check (sync_state in ('not_applicable', 'pending', 'syncing', 'synced', 'failed')),
  add column if not exists external_issue_key       text,
  add column if not exists external_issue_url       text,
  add column if not exists sync_attempts            int not null default 0,
  add column if not exists sync_last_error          text,
  add column if not exists sync_last_attempt_at     timestamptz,
  add column if not exists sync_next_attempt_at     timestamptz,
  add column if not exists sync_claimed_at          timestamptz,
  add column if not exists synced_at                timestamptz;

alter table public.bugs drop constraint if exists bugs_synced_has_key;
alter table public.bugs
  add constraint bugs_synced_has_key
    check (sync_state <> 'synced' or external_issue_key is not null);

alter table public.bugs drop constraint if exists bugs_sync_error_bounded;
alter table public.bugs
  add constraint bugs_sync_error_bounded
    check (sync_last_error is null or char_length(sync_last_error) <= 300);

-- Partial: indexes only the unsynced tail, so the sweep is O(due), not O(bugs).
create index if not exists bugs_sync_due_idx
  on public.bugs (sync_next_attempt_at)
  where sync_state in ('pending', 'failed', 'syncing');

-- ============================================================================
-- 3. bunkai_upsert_project_tracker_settings — the single write path
-- ============================================================================
-- Order of operations (observable behaviour):
--   0. Actor bind (auth.uid() is not null and differs from p_actor_user_id).
--   1. Resolve the Project's workspace (live only) and the actor's active role.
--      Anything missing -> P0002 project_not_found; a member below owner/admin
--      -> 42501 forbidden.
--   2. Normalise: key = btrim + ASCII upper-case; issue type = btrim. Empty key
--      -> 45411; malformed key -> 45410; issue type outside 1..60 -> 45412.
--   3. Read the existing row FOR UPDATE; compute whether anything changed and
--      whether the save is a re-queue trigger (off -> on, or key / issue type
--      change while the sync is on; PO Q5).
--   4. When triggered, count the Bugs to queue (PO Q1 predicate). N > 0 and no
--      matching p_confirm_queue_count -> 45413 and nothing is written.
--   5. Upsert (only when something changed: a no-change save writes nothing).
--   6. Queue the counted Bugs; a different row count -> 45414 and a full rollback.
--   7. Audit row (activity_log) when something changed.
--   8. Return the stored row plus `requeued`.
--
-- Re-queue predicate (T5, narrowed by PO Q1): the Bug has no Jira reference and
-- either already failed to sync (any status) or never tried while still needing
-- engineering work (open / in_progress). Resolved and closed Bugs that never
-- tried are NOT queued.

create or replace function public.bunkai_upsert_project_tracker_settings(
  p_actor_user_id           uuid,
  p_project_id              uuid,
  p_destination_project_key text,
  p_issue_type_name         text,
  p_enabled                 boolean,
  p_confirm_queue_count     int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id  uuid;
  v_role          text;
  v_key           text;
  v_type          text;
  v_old           public.project_tracker_settings%rowtype;
  v_had_row       boolean;
  v_changed       boolean;
  v_trigger       boolean;
  v_queue_count   int := 0;
  v_requeued      int := 0;
  v_row           public.project_tracker_settings%rowtype;
begin
  -- 0. Actor bind. A NULL auth.uid() is the service-role / admin client (the
  --    only legitimate caller), for which the parameter IS the identity. A
  --    present but different uid is a spoof attempt: same error as "not found".
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the workspace of the Project (live workspaces only) and the
  --    actor's ACTIVE role in it. Missing Project, foreign Project, deleted
  --    workspace and non-member are indistinguishable.
  select p.workspace_id, wm.role
    into v_workspace_id, v_role
    from public.projects p
    join public.workspaces w
      on w.id = p.workspace_id
     and w.deleted_at is null
    join public.workspace_members wm
      on wm.workspace_id = p.workspace_id
     and wm.user_id = p_actor_user_id
     and wm.status = 'active'
   where p.id = p_project_id;

  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2. Normalise and validate. translate() upper-cases ASCII letters only, so a
  --    German sharp s never becomes SS (T4). The table CHECK repeats the rule.
  v_key := translate(
    btrim(coalesce(p_destination_project_key, ''), E' \t\r\n'),
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  );
  if v_key = '' then
    raise exception 'destination_required' using errcode = '45411';
  end if;
  if v_key !~ '^[A-Z][A-Z0-9_]{1,9}$' then
    raise exception 'invalid_destination_key' using errcode = '45410';
  end if;

  v_type := btrim(coalesce(p_issue_type_name, ''), E' \t\r\n');
  if char_length(v_type) < 1 or char_length(v_type) > 60 then
    raise exception 'invalid_issue_type' using errcode = '45412';
  end if;

  if p_enabled is null then
    raise exception 'invalid_enabled' using errcode = '22023';
  end if;

  -- 3. Existing row (locked) and change detection.
  select * into v_old
    from public.project_tracker_settings s
   where s.project_id = p_project_id
     for update;
  v_had_row := found;

  v_changed := not v_had_row
            or v_old.destination_project_key is distinct from v_key
            or v_old.issue_type_name is distinct from v_type
            or v_old.enabled is distinct from p_enabled;

  -- Re-queue only when the sync is ON after the save AND it just came on, or
  -- the key / issue type changed (PO Q5). Switching off and a no-change save
  -- never queue.
  v_trigger := p_enabled
           and (not v_had_row
                or not v_old.enabled
                or v_old.destination_project_key is distinct from v_key
                or v_old.issue_type_name is distinct from v_type);

  -- 4. Count what would be queued and demand the caller's confirmation of N.
  if v_trigger then
    select count(*)::int
      into v_queue_count
      from public.bugs b
     where b.project_id = p_project_id
       and b.workspace_id = v_workspace_id
       and b.external_issue_key is null
       and (b.sync_state = 'failed'
            or (b.sync_state = 'not_applicable' and b.status in ('open', 'in_progress')));

    if v_queue_count > 0 and p_confirm_queue_count is distinct from v_queue_count then
      raise exception 'queue_confirmation_required: % defect(s) would be queued', v_queue_count
        using errcode = '45413';
    end if;
  end if;

  -- 5. Upsert. Last write wins; two first saves never error (T6). A save that
  --    changes nothing writes nothing (AC-5.5).
  if v_changed then
    insert into public.project_tracker_settings
      (project_id, destination_project_key, issue_type_name, enabled)
    values
      (p_project_id, v_key, v_type, p_enabled)
    on conflict (project_id) do update
      set destination_project_key = excluded.destination_project_key,
          issue_type_name         = excluded.issue_type_name,
          enabled                 = excluded.enabled,
          updated_at              = now()
    returning * into v_row;
  else
    v_row := v_old;
  end if;

  -- 6. Queue. Every updated row is scoped by project AND workspace; the row
  --    count must equal the confirmed N or the whole call rolls back.
  if v_trigger and v_queue_count > 0 then
    update public.bugs b
       set sync_state           = 'pending',
           sync_next_attempt_at = now(),
           sync_last_error      = null,
           sync_attempts        = 0
     where b.project_id = p_project_id
       and b.workspace_id = v_workspace_id
       and b.external_issue_key is null
       and (b.sync_state = 'failed'
            or (b.sync_state = 'not_applicable' and b.status in ('open', 'in_progress')));
    get diagnostics v_requeued = row_count;

    if v_requeued <> v_queue_count then
      raise exception 'queue_count_mismatch: expected %, queued %', v_queue_count, v_requeued
        using errcode = '45414';
    end if;
  end if;

  -- 7. Audit (T8): every save that changes something.
  if v_changed then
    insert into public.activity_log
      (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values
      (v_workspace_id, p_actor_user_id, 'project_tracker_settings', p_project_id,
       'tracker_settings.updated',
       jsonb_build_object(
         'old', case
                  when v_had_row then jsonb_build_object(
                    'destination_project_key', v_old.destination_project_key,
                    'issue_type_name', v_old.issue_type_name,
                    'enabled', v_old.enabled)
                  else null
                end,
         'new', jsonb_build_object(
                  'destination_project_key', v_row.destination_project_key,
                  'issue_type_name', v_row.issue_type_name,
                  'enabled', v_row.enabled),
         'requeued', v_requeued));
  end if;

  -- 8. Return the stored row plus how many Bugs this save queued.
  return jsonb_build_object(
    'project_id', v_row.project_id,
    'destination_project_key', v_row.destination_project_key,
    'issue_type_name', v_row.issue_type_name,
    'enabled', v_row.enabled,
    'updated_at', v_row.updated_at,
    'requeued', v_requeued
  );
end;
$$;

-- service_role ONLY (BK-43 ruling 12177 D7 precedent, BK-371 T2). `authenticated`
-- and `anon` are revoked explicitly: Supabase default privileges grant EXECUTE on
-- every new public function to both, which is exactly what makes a DEFINER
-- function with a caller-supplied actor directly callable through PostgREST.
revoke execute on function public.bunkai_upsert_project_tracker_settings(uuid, uuid, text, text, boolean, int)
  from public, anon, authenticated;
grant execute on function public.bunkai_upsert_project_tracker_settings(uuid, uuid, text, text, boolean, int)
  to service_role;

-- 0088 mechanism: the 0085 default privilege hands every new function to BOTH QA
-- roles. This one is a volatile DEFINER writer, so the read-only role must not
-- keep it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_upsert_project_tracker_settings(uuid, uuid, text, text, boolean, int)
      from qa_inspector_ro;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('authenticated',
--            'public.bunkai_upsert_project_tracker_settings(uuid,uuid,text,text,boolean,int)', 'EXECUTE');  -- false
--   select has_function_privilege('anon',  ...same signature..., 'EXECUTE');                                -- false
--   select has_function_privilege('qa_inspector_ro', ...same signature..., 'EXECUTE');                      -- false
--   select has_function_privilege('service_role', ...same signature..., 'EXECUTE');                         -- true
