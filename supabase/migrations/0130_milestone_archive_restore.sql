-- Migration: 0130 — BK-1899: archive a Milestone and restore it
-- Authored: 2026-11-15
--
-- Governing record: the BK-1899 "AI Product Owner — Decision" (P1-P12) and
-- "AI Tech Lead — Decision" (T1-T8) comments of 2026-11-15, and ADR-0012
-- (rpc-authorization-invariant). Additive and idempotent: two nullable
-- columns, one trigger, two new functions and five `create or replace`
-- copy-forwards. Nothing is dropped or renamed.
--
-- What it does:
--   1. milestones.archived_at / archived_by (T1). Archiving hides, it never
--      deletes: no other table is touched by archive or restore.
--   2. milestones_guard_archive (T3). `authenticated` holds INSERT and UPDATE
--      on milestones behind the member+ policy of 0064 (verified live in
--      information_schema.role_table_grants), so without this a session could
--      PATCH archived_at through PostgREST with no event and a forged actor.
--      The trigger refuses that, and refuses ANY writer that changes the name,
--      target date, description, project or workspace of an archived row
--      (read-only is enforced by the database, not only by the functions).
--      Content writes to an ACTIVE row through the 0064 table grant stay as
--      BK-205 shipped them (ADR-0012 debt, recorded on BK-1899).
--   3. bunkai_archive_milestone / bunkai_restore_milestone (T2): idempotent,
--      one activity_log row per real change, none for a no-op (business rule
--      "a change that alters nothing is not an event").
--   4. bunkai_create_milestone / bunkai_update_milestone, copied forward from
--      0064 (T4): a name held by an archived Milestone raises 45508 naming it
--      (AC-03); an edit of an archived Milestone raises 45507.
--   5. bunkai_attach_plans_to_milestone / bunkai_detach_plan_from_milestone,
--      copied forward from 0112 (T4): an archived Milestone raises 45507, read
--      under a lock that conflicts with archive's FOR UPDATE.
--   6. bunkai_list_activity, copied forward from 0129 (T5): milestone.archived
--      and milestone.restored join the allowlist backstop and the projection.
--
-- Authorization (rpc-authorization.md §4, ADR-0012), the 0064 milestone shape:
--   * SECURITY DEFINER, because activity_log is DEFINER-only and the archive
--     columns are closed to session writes by section 2.
--   * No identity parameter: the actor is auth.uid(). Execute goes to
--     `authenticated` only; revoked from public, anon, service_role (no
--     auth.uid(), it is a member of nothing) and qa_inspector_ro, the
--     read-only inspector role 0085's default privileges would otherwise reach.
--   * A missing Milestone and a Milestone of a workspace the caller is not a
--     member of both raise P0002 (404). Only a confirmed member without write
--     access gets 42501 (403): that member can already read the Milestone.
--   * The row is locked FOR UPDATE only AFTER authorization (a caller who may
--     not write must not take or wait on the lock, 0112 TL-3), and the write
--     gate is re-checked after the lock (a wait can outlast the caller's own
--     membership, 0114 / 0118 rule).
--
-- Concurrency (AI Product Owner P8). Archive and restore lock the row FOR
-- UPDATE, so simultaneous calls serialize and the later one sees the state the
-- first left: no write, no event, first actor and timestamp kept. Attach holds
-- FOR NO KEY UPDATE and detach FOR SHARE on the same row, both of which
-- conflict with FOR UPDATE, so neither can slip a membership change past an
-- archive that is committing.
--
-- Custom SQLSTATE codes allocated (455xx milestones block; 0064 and 0112 claim
-- 45500-45506):
--   45507  milestone_archived       (a write to an archived Milestone: edit,
--                                    attach or detach)
--   45508  milestone_name_archived  (the normalized name is held by an
--                                    archived Milestone of the project; the
--                                    error DETAIL carries that Milestone's name)

-- ============================================================================
-- 1. Columns
-- ============================================================================
-- No new index. The list reads one project through
-- milestones_project_target_date_id_idx and filters a handful of rows; the
-- name reservation needs nothing either, because milestones_project_name_idx
-- (0064) already spans archived rows.

alter table public.milestones
  add column if not exists archived_at timestamptz;

alter table public.milestones
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.milestones.archived_at is
  'BK-1899: when the Milestone was archived. NULL while active. Written only by bunkai_archive_milestone / bunkai_restore_milestone.';
comment on column public.milestones.archived_by is
  'BK-1899: who archived the Milestone. NULL while active.';

-- ============================================================================
-- 2. milestones_guard_archive
-- ============================================================================

create or replace function public.bunkai_guard_milestone_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Runs as the caller, so current_user names who is really writing: the
  -- DEFINER functions arrive as the function owner, a PostgREST session as
  -- authenticated (0116 shape).
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.archived_at is not null or new.archived_by is not null then
        raise exception 'milestone_archive_columns_read_only' using errcode = '42501';
      end if;
    elsif old.archived_at is distinct from new.archived_at
       or old.archived_by is distinct from new.archived_by then
      raise exception 'milestone_archive_columns_read_only' using errcode = '42501';
    end if;
  end if;

  -- Read-only while archived, for every writer (business rule: it cannot be
  -- edited until it is restored): its content and where it belongs. The
  -- archive and the restore themselves change only the archive columns, so
  -- they pass. created_by is deliberately NOT frozen: the auth.users
  -- `on delete set null` cascade must keep working on archived rows.
  if tg_op = 'UPDATE'
     and old.archived_at is not null
     and new.archived_at is not null
     and (old.name is distinct from new.name
          or old.target_date is distinct from new.target_date
          or old.description is distinct from new.description
          or old.project_id is distinct from new.project_id
          or old.workspace_id is distinct from new.workspace_id) then
    raise exception 'milestone_archived' using errcode = '45507';
  end if;

  return new;
end;
$$;

revoke execute on function public.bunkai_guard_milestone_archive() from public, anon, authenticated;

drop trigger if exists milestones_guard_archive on public.milestones;
create trigger milestones_guard_archive
  before insert or update on public.milestones
  for each row execute function public.bunkai_guard_milestone_archive();

-- ============================================================================
-- 3. bunkai_archive_milestone / bunkai_restore_milestone
-- ============================================================================
-- Return shape: { id, name, archived_at, archived_by, changed }. `changed` is
-- false when the call found the Milestone already in the state it asks for.

create or replace function public.bunkai_archive_milestone(p_milestone_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name         text;
  v_archived_at  timestamptz;
  v_archived_by  uuid;
  v_changed      boolean := false;
begin
  -- 1. Resolve the workspace WITHOUT a lock.
  select workspace_id into v_workspace_id
    from public.milestones
    where id = p_milestone_id;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0064 shape): not a member at all (no session
  --    included) -> 404; member without write access -> 403.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Lock, then re-check the caller: the wait may have outlasted their role.
  select name, archived_at, archived_by
    into v_name, v_archived_at, v_archived_by
    from public.milestones
    where id = p_milestone_id
    for update;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 4. Only an active Milestone changes. Test Plans, their Tests and Runs are
  --    never touched: this statement reaches the milestones row and nothing else.
  if v_archived_at is null then
    v_archived_at := now();
    v_archived_by := auth.uid();
    v_changed := true;

    update public.milestones
      set archived_at = v_archived_at,
          archived_by = v_archived_by
      where id = p_milestone_id;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (v_workspace_id, auth.uid(), 'milestone', p_milestone_id, 'milestone.archived',
            jsonb_build_object('name', v_name));
  end if;

  return jsonb_build_object(
    'id', p_milestone_id,
    'name', v_name,
    'archived_at', v_archived_at,
    'archived_by', v_archived_by,
    'changed', v_changed
  );
end;
$$;

create or replace function public.bunkai_restore_milestone(p_milestone_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name         text;
  v_archived_at  timestamptz;
  v_changed      boolean := false;
begin
  select workspace_id into v_workspace_id
    from public.milestones
    where id = p_milestone_id;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select name, archived_at
    into v_name, v_archived_at
    from public.milestones
    where id = p_milestone_id
    for update;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Restore never re-checks the target-date bounds: a past target date stays
  -- as it was (business rule "restoring returns it exactly as it was"), and the
  -- name cannot collide because an archived Milestone kept its slot in
  -- milestones_project_name_idx the whole time.
  if v_archived_at is not null then
    v_changed := true;

    update public.milestones
      set archived_at = null,
          archived_by = null
      where id = p_milestone_id;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (v_workspace_id, auth.uid(), 'milestone', p_milestone_id, 'milestone.restored',
            jsonb_build_object('name', v_name));
  end if;

  return jsonb_build_object(
    'id', p_milestone_id,
    'name', v_name,
    'archived_at', null,
    'archived_by', null,
    'changed', v_changed
  );
end;
$$;

revoke execute on function public.bunkai_archive_milestone(uuid) from public, anon, service_role;
revoke execute on function public.bunkai_restore_milestone(uuid) from public, anon, service_role;
grant  execute on function public.bunkai_archive_milestone(uuid) to authenticated;
grant  execute on function public.bunkai_restore_milestone(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_archive_milestone(uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_restore_milestone(uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_guard_milestone_archive() from qa_inspector_ro;
  end if;
end;
$$;

-- ============================================================================
-- 4. bunkai_create_milestone / bunkai_update_milestone — 0064's bodies plus
--    the archived-name check (45508) and, on update, the archived refusal
--    (45507). Everything else is unchanged.
-- ============================================================================

create or replace function public.bunkai_create_milestone(
  p_project_id  uuid,
  p_name        text,
  p_target_date date,
  p_description text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id  uuid;
  v_name          text;
  v_description   text := coalesce(p_description, '');
  v_archived_name text;
  v_row           public.milestones%rowtype;
begin
  -- 1. Resolve project -> workspace. p_project_id comes from the URL the
  --    caller already knows, so a 42501 here discloses nothing (0063).
  select workspace_id into v_workspace_id from public.projects where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 2. Role gate. auth.uid() internally; no actor parameter exists to spoof.
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Normalize (collapse THEN trim, see the whitespace decision) + lengths.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'milestone_name_length' using errcode = '45500';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'milestone_description_length' using errcode = '45501';
  end if;

  -- 4. Bounds. Zod is the primary guard at the edge; this binds direct/PAT
  --    callers. Both relative to server UTC current_date.
  if p_target_date is null or p_target_date < current_date then
    raise exception 'milestone_target_date_past' using errcode = '45502';
  end if;
  if p_target_date > current_date + interval '5 years' then
    raise exception 'milestone_target_date_too_far' using errcode = '45503';
  end if;

  -- 4b. BK-1899: an archived Milestone keeps its name. Named refusal, so the
  --     caller learns WHICH Milestone holds it (AC-03); 23505 below stays the
  --     answer for a clash with an active one.
  select m.name into v_archived_name
    from public.milestones m
    where m.project_id = p_project_id
      and lower(m.name) = lower(v_name)
      and m.archived_at is not null
    limit 1;
  if v_archived_name is not null then
    raise exception 'milestone_name_archived' using errcode = '45508', detail = v_archived_name;
  end if;

  -- 5. Insert. Duplicate name -> 23505 from milestones_project_name_idx -> 409.
  insert into public.milestones (workspace_id, project_id, name, target_date, description, created_by)
  values (v_workspace_id, p_project_id, v_name, p_target_date, v_description, auth.uid())
  returning * into v_row;

  -- 6. Audit. DEFINER-only writer, and what makes created_by resolvable via
  --    bunkai_resolve_activity_actors (ADR-0011 + 0047 scoping).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'milestone', v_row.id, 'milestone.created',
          jsonb_build_object('name', v_row.name, 'target_date', v_row.target_date));

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'target_date', v_row.target_date, 'description', v_row.description,
    'created_by', v_row.created_by, 'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_create_milestone(uuid, text, date, text) from public, anon;
grant  execute on function public.bunkai_create_milestone(uuid, text, date, text) to authenticated, service_role;

create or replace function public.bunkai_update_milestone(
  p_milestone_id uuid,
  p_name         text,
  p_target_date  date,
  p_description  text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id        uuid;
  v_project_id          uuid;
  v_current_name        text;
  v_current_target_date date;
  v_current_description text;
  v_current_archived_at timestamptz;
  v_name                text;
  v_description          text := coalesce(p_description, '');
  v_archived_name        text;
  v_payload              jsonb := '{}'::jsonb;
  v_row                  public.milestones%rowtype;
begin
  -- 1. Resolve workspace + the CURRENT row under a row lock (0032/0036/0037
  --    serialization convention).
  select workspace_id, project_id, name, target_date, description, archived_at
    into v_workspace_id, v_project_id, v_current_name, v_current_target_date, v_current_description, v_current_archived_at
    from public.milestones where id = p_milestone_id for update;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0063 shape, refined). Not a member at all -> 404,
  --    indistinguishable from absent. Member but viewer -> 403, which
  --    discloses nothing a viewer cannot already see on the list.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2b. BK-1899: an archived Milestone is read-only until it is restored. Read
  --     under the row lock above, so an archive committing meanwhile is seen.
  --     milestones_guard_archive is the backstop for any other writer.
  if v_current_archived_at is not null then
    raise exception 'milestone_archived' using errcode = '45507';
  end if;

  -- 3. Normalize (collapse THEN trim) + lengths — same rulebook as create.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'milestone_name_length' using errcode = '45500';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'milestone_description_length' using errcode = '45501';
  end if;

  -- 4. Bounds evaluated ONLY when the date actually changes. Without this
  --    guard a description-only edit of a past-dated milestone is impossible.
  if p_target_date is distinct from v_current_target_date then
    if p_target_date is null or p_target_date < current_date then
      raise exception 'milestone_target_date_past' using errcode = '45502';
    end if;
    if p_target_date > current_date + interval '5 years' then
      raise exception 'milestone_target_date_too_far' using errcode = '45503';
    end if;
  end if;

  -- 4b. BK-1899: a rename onto a name an archived Milestone holds is refused
  --     by name (AC-03), same as create.
  select m.name into v_archived_name
    from public.milestones m
    where m.project_id = v_project_id
      and m.id <> p_milestone_id
      and lower(m.name) = lower(v_name)
      and m.archived_at is not null
    limit 1;
  if v_archived_name is not null then
    raise exception 'milestone_name_archived' using errcode = '45508', detail = v_archived_name;
  end if;

  -- 5. Update. Duplicate name -> 23505 -> 409. Self-exclusion is automatic:
  --    updating a row to a value it already holds does not violate the
  --    unique index, because it is the same row (no app-layer guard needed).
  update public.milestones
    set name = v_name,
        target_date = p_target_date,
        description = v_description
    where id = p_milestone_id
    returning * into v_row;

  -- 6. Audit. milestone.updated projects ONLY the changed fields (0055
  --    "Decision 3 / Risk R3" positive-projection convention, never a blanket
  --    copy).
  if v_name is distinct from v_current_name then
    v_payload := v_payload || jsonb_build_object('name', v_name);
  end if;
  if p_target_date is distinct from v_current_target_date then
    v_payload := v_payload || jsonb_build_object('target_date', p_target_date);
  end if;
  if v_description is distinct from v_current_description then
    v_payload := v_payload || jsonb_build_object('description', v_description);
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'milestone', v_row.id, 'milestone.updated', v_payload);

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'target_date', v_row.target_date, 'description', v_row.description,
    'created_by', v_row.created_by, 'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_update_milestone(uuid, text, date, text) from public, anon;
grant  execute on function public.bunkai_update_milestone(uuid, text, date, text) to authenticated, service_role;

-- ============================================================================
-- 5. bunkai_attach_plans_to_milestone / bunkai_detach_plan_from_milestone —
--    0112's bodies plus the archived refusal (45507). Everything else is
--    unchanged.
-- ============================================================================

create or replace function public.bunkai_attach_plans_to_milestone(
  p_milestone_id  uuid,
  p_test_plan_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_project_id   uuid;
  v_archived_at  timestamptz;
  v_distinct     int;
  v_resolved     int;
  v_existing     int;
  v_added        int;
begin
  -- 1. Resolve the milestone, WITHOUT a lock: a caller who may not write must not
  --    be able to take or wait on the row lock.
  select workspace_id, project_id
    into v_workspace_id, v_project_id
    from public.milestones
    where id = p_milestone_id;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0064 shape): not a member at all (including no
  --    session) -> 404, indistinguishable from absent; member but viewer -> 403.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2b. Now serialize attaches to this milestone (TL-3), so the cap below is
  --     race-free. NO KEY UPDATE is enough: it conflicts with itself, and it does
  --     not block the key-share locks foreign keys take on the milestone row.
  --     BK-1899: it also conflicts with archive's FOR UPDATE, so the archived
  --     state read here is the committed one.
  select archived_at into v_archived_at
    from public.milestones
    where id = p_milestone_id
    for no key update;
  if v_archived_at is not null then
    raise exception 'milestone_archived' using errcode = '45507';
  end if;

  -- 3. At least one plan id (defense in depth under the route's Zod min(1)).
  if coalesce(array_length(p_test_plan_ids, 1), 0) < 1 then
    raise exception 'plan_selection_empty' using errcode = '22023';
  end if;

  -- 4. Every distinct submitted id must be a plan of THIS milestone's project
  --    (therefore of its workspace). A null element, an unknown id, a plan of
  --    another project and a plan of another workspace all collapse into the SAME
  --    raise, with no id echoed back (D4).
  if array_position(p_test_plan_ids, null) is not null then
    raise exception 'plan_outside_project' using errcode = '45505';
  end if;
  select count(*) into v_distinct
    from (select distinct x from unnest(p_test_plan_ids) as t(x)) d;
  select count(*) into v_resolved
    from public.test_plans tp
    where tp.id = any (p_test_plan_ids)
      and tp.project_id = v_project_id;
  if v_resolved <> v_distinct then
    raise exception 'plan_outside_project' using errcode = '45505';
  end if;

  -- 5. Duplicate: a submitted plan already attached rejects the WHOLE selection.
  if exists (
    select 1 from public.milestone_plans mp
    where mp.milestone_id = p_milestone_id
      and mp.test_plan_id = any (p_test_plan_ids)
  ) then
    raise exception 'milestone_plan_exists' using errcode = '45504';
  end if;

  -- 6. Cap (D6): at most 50 plans per milestone after this attach.
  select count(*) into v_existing
    from public.milestone_plans mp
    where mp.milestone_id = p_milestone_id;
  if v_existing + v_distinct > 50 then
    raise exception 'milestone_plan_limit' using errcode = '45506';
  end if;

  -- 7. Insert every distinct id in one statement. The unique index stays the
  --    backstop (D5): a duplicate that slipped past step 5 still answers 45504.
  begin
    insert into public.milestone_plans (workspace_id, milestone_id, test_plan_id, added_by)
    select v_workspace_id, p_milestone_id, x, auth.uid()
    from (select distinct x from unnest(p_test_plan_ids) as t(x)) d;
    get diagnostics v_added = row_count;
  exception when unique_violation then
    raise exception 'milestone_plan_exists' using errcode = '45504';
  end;

  -- 8. History, in the same transaction (D2). Positive projection, one row per call.
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'milestone', p_milestone_id, 'milestone.plans_attached',
    jsonb_build_object(
      'test_plan_ids', (select to_jsonb(array_agg(distinct x)) from unnest(p_test_plan_ids) as t(x)),
      'count', v_added
    )
  );

  return jsonb_build_object(
    'milestone_id', p_milestone_id,
    'attached_count', v_added,
    'plan_count', v_existing + v_added
  );
end;
$$;

revoke execute on function public.bunkai_attach_plans_to_milestone(uuid, uuid[]) from public, anon;
grant  execute on function public.bunkai_attach_plans_to_milestone(uuid, uuid[]) to authenticated;

create or replace function public.bunkai_detach_plan_from_milestone(
  p_milestone_id uuid,
  p_test_plan_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_archived_at  timestamptz;
  v_deleted      int;
begin
  -- 1. Resolve the milestone. No lock yet: a caller who may not write must not
  --    take or wait on one.
  select workspace_id into v_workspace_id
    from public.milestones
    where id = p_milestone_id;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  -- 2. Same non-disclosure split as attach.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2b. BK-1899: an archived Milestone keeps its Test Plans until it is
  --     restored. FOR SHARE conflicts with archive's FOR UPDATE, so a detach
  --     cannot remove a plan from a Milestone whose archive is committing.
  select archived_at into v_archived_at
    from public.milestones
    where id = p_milestone_id
    for share;
  if v_archived_at is not null then
    raise exception 'milestone_archived' using errcode = '45507';
  end if;

  -- 3. Delete the membership only. Detaching never touches the plan or its
  --    progress: this statement reaches milestone_plans and nothing else.
  delete from public.milestone_plans
    where milestone_id = p_milestone_id
      and test_plan_id = p_test_plan_id;
  get diagnostics v_deleted = row_count;

  -- 4. History only when something was detached (an idempotent repeat writes none).
  if v_deleted > 0 then
    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, auth.uid(), 'milestone', p_milestone_id, 'milestone.plan_detached',
      jsonb_build_object('test_plan_id', p_test_plan_id)
    );
  end if;

  return jsonb_build_object(
    'milestone_id', p_milestone_id,
    'test_plan_id', p_test_plan_id,
    'detached', v_deleted > 0,
    'plan_count', (select count(*) from public.milestone_plans where milestone_id = p_milestone_id)
  );
end;
$$;

revoke execute on function public.bunkai_detach_plan_from_milestone(uuid, uuid) from public, anon;
grant  execute on function public.bunkai_detach_plan_from_milestone(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_attach_plans_to_milestone(uuid, uuid[]) from qa_inspector_ro;
    revoke all on function public.bunkai_detach_plan_from_milestone(uuid, uuid) from qa_inspector_ro;
  end if;
end;
$$;

-- ============================================================================
-- 6. bunkai_list_activity — 0129's body plus `milestone.archived` and
--    `milestone.restored` (allowlist backstop + positive projection: the
--    Milestone's name, which cannot change while it is archived).
-- ============================================================================

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
      'export.requested', 'export.downloaded',
      'atc.updated',
      'member.removed',
      'atc.archived', 'atc.restored',
      'module.restored',
      'jira_connection.connected', 'jira_connection.changed', 'jira_connection.disconnected',
      'bug.corrected',
      'milestone.archived', 'milestone.restored'
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
                       'name', (select m.name from public.modules m where m.id = k.entity_id),
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'module.restored' then
                     jsonb_build_object(
                       'name', (select m.name from public.modules m where m.id = k.entity_id),
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'atc.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'atc.updated' then
                     -- BK-268: positive projection. Only the title, the TRUE
                     -- affected count and up to 3 Test titles ever leave the
                     -- DB. Titles resolve under the CALLER's RLS (function is
                     -- SECURITY INVOKER; tests_select_workspace_member), so a
                     -- Test the caller cannot see (or that was deleted after
                     -- the edit) simply does not resolve and folds into the
                     -- count remainder.
                     jsonb_build_object(
                       'title', k.payload -> 'title',
                       'affected_test_count',
                         case when jsonb_typeof(k.payload -> 'affected_test_ids') = 'array'
                              then jsonb_array_length(k.payload -> 'affected_test_ids') else 0 end,
                       'affected_tests', coalesce((
                         select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title) order by r.title, r.id)
                           from (
                             select t.id, t.title
                               from public.tests t
                              where t.workspace_id = p_workspace_id
                                and jsonb_typeof(k.payload -> 'affected_test_ids') = 'array'
                                and t.id in (
                                  select e.value::uuid
                                    from jsonb_array_elements_text(k.payload -> 'affected_test_ids') e
                                )
                              order by t.title, t.id
                              limit 3
                           ) r
                       ), '[]'::jsonb)
                     )
                   when 'atc.archived' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'atc.restored' then
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
                   when 'bug.corrected' then
                     -- BK-1835 (P6): the defect's title after the correction,
                     -- the names of the changed fields, and the previous/new
                     -- pairs of title and severity only. Description and steps
                     -- are free text: their values stay in activity_log.
                     jsonb_build_object(
                       'title', k.payload -> 'title',
                       'changed_fields', coalesce((
                         select jsonb_agg(f.key order by f.key)
                           from jsonb_object_keys(
                             case when jsonb_typeof(k.payload -> 'changes') = 'object'
                                  then k.payload -> 'changes' else '{}'::jsonb end
                           ) as f(key)
                       ), '[]'::jsonb),
                       'title_change', k.payload -> 'changes' -> 'title',
                       'severity_change', k.payload -> 'changes' -> 'severity'
                     )
                   when 'milestone.archived' then
                     -- BK-1899: the Milestone's name at the time of the change.
                     jsonb_build_object('name', k.payload -> 'name')
                   when 'milestone.restored' then
                     jsonb_build_object('name', k.payload -> 'name')
                   when 'export.requested' then
                     '{}'::jsonb
                   when 'export.downloaded' then
                     '{}'::jsonb
                   when 'member.removed' then
                     -- BK-572: who was removed and the role they held.
                     jsonb_build_object(
                       'removed_user_id', k.payload -> 'removed_user_id',
                       'removed_role', k.payload -> 'removed_role'
                     )
                   when 'jira_connection.connected' then
                     -- BK-1619: the site host only. Never the token, the
                     -- secret id or the email.
                     jsonb_build_object('site_host', k.payload -> 'site_host')
                   when 'jira_connection.changed' then
                     jsonb_build_object('site_host', k.payload -> 'site_host')
                   when 'jira_connection.disconnected' then
                     jsonb_build_object('site_host', k.payload -> 'site_host')
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
