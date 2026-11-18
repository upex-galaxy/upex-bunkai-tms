-- =============================================================================
-- 0134_test_archive_restore
-- BK-596 : rename a Test, archive it and restore it (BK-039).
-- =============================================================================
--
-- WHY. A Test could never be renamed or removed: tests had no archive column
-- (0014 skipped it, "future epics") and no writer besides create, reorder and
-- tags. This migration adds the archive state, the three writers, and the
-- read-side sweep the archive needs.
--
-- WHAT.
--   1. tests.archived_at / tests.archived_by, plus two guard triggers: no
--      PostgREST session may write the archive columns, and no session may
--      change an archived Test or its chain (authenticated holds member-plus
--      UPDATE on tests and test_steps, 0026).
--   2. bunkai_rename_test / bunkai_archive_test / bunkai_restore_test.
--   3. Frozen writers: bunkai_reorder_test_steps, bunkai_set_test_tags and
--      bunkai_add_tests_to_plan refuse an archived Test with 45127
--      test_archived, after their write gate.
--   4. Run writers: bunkai_create_run and bunkai_submit_automated_run read the
--      Test FOR SHARE after the write gate and refuse an archived one (45127).
--      A replay of a start token or idempotency key runs first and returns
--      the Run it already created (AI Tech Lead ruling, Dev Q8).
--   5. Offer reads hide an archived Test: bunkai_filter_tests_by_tag,
--      bunkai_atc_usage (count / used_in live only, additive archived_count),
--      bunkai_search_tests, bunkai_search_workspace.
--   6. Resolve and report reads keep it: bunkai_test_json carries archived_at
--      and archived_by; bunkai_report_story_traceability carries the Test's
--      archived_at and prefers a live chaining Test over an archived one for
--      an ATC that never ran. Run history, run detail, runs index, coverage,
--      plan progress, milestone readiness and the export are untouched: they
--      report what already happened (AI Tech Lead ruling of 2026-08-22).
--   7. bunkai_list_activity: test.renamed, test.archived, test.restored join
--      the backstop allowlist and the projection.
--
-- Every redefined body is the live definition (md5(prosrc) checked against
-- the latest migration before writing) with only the change named above.
-- Signatures are unchanged.
--
-- AUTHORIZATION (ADR-0012, rpc-authorization.md section 4). The new writers
-- are SECURITY DEFINER with p_actor_user_id, like every Test writer: the API
-- routes use the admin client and PAT callers have no auth.uid(). Actor bind
-- at step 0, workspace write gate before any lock, then the Test row FOR
-- UPDATE so repeats and races serialize. Each writer returns only the Test it
-- was asked about. Execute: service_role only; qa_inspector_ro revoked
-- explicitly (0085 default privileges, 0086 rule). A non-writer gets 42501
-- and a missing id P0002, as on the sibling Test writers.
--
-- Failpoints test_archive.before_event and test_restore.before_event use the
-- ADR-0022 table (0114).
--
-- Additive and idempotent. Existing grants survive CREATE OR REPLACE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Archive columns and guards
-- -----------------------------------------------------------------------------
alter table public.tests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.tests.archived_at is
  'BK-596: when this Test was archived. NULL = live. Offer surfaces hide it; report surfaces keep it.';
comment on column public.tests.archived_by is
  'BK-596: who archived this Test. NULL when live.';

create index if not exists tests_workspace_live_idx
  on public.tests (workspace_id, created_at desc)
  where archived_at is null;

create or replace function public.bunkai_guard_test_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Runs as the caller, so current_user names who is really writing: the
  -- DEFINER writers arrive as the function owner, a PostgREST session as
  -- authenticated. Only a session is refused.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.archived_at is distinct from new.archived_at
     or old.archived_by is distinct from new.archived_by then
    raise exception 'test_archive_columns_read_only' using errcode = '42501';
  end if;
  if old.archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;
  return new;
end;
$$;

revoke execute on function public.bunkai_guard_test_archive() from public, anon, authenticated;

drop trigger if exists tests_guard_archive on public.tests;
create trigger tests_guard_archive
  before update on public.tests
  for each row
  execute function public.bunkai_guard_test_archive();

create or replace function public.bunkai_guard_archived_test_chain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'DELETE' then
    v_ids := array[old.test_id];
  elsif tg_op = 'UPDATE' then
    v_ids := array[old.test_id, new.test_id];
  else
    v_ids := array[new.test_id];
  end if;
  if current_user in ('authenticated', 'anon') and exists (
    select 1 from public.tests t
     where t.id = any(v_ids)
       and t.archived_at is not null
  ) then
    raise exception 'test_archived' using errcode = '45127';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.bunkai_guard_archived_test_chain() from public, anon, authenticated;

drop trigger if exists test_steps_guard_archived_test on public.test_steps;
create trigger test_steps_guard_archived_test
  before insert or update or delete on public.test_steps
  for each row
  execute function public.bunkai_guard_archived_test_chain();

-- -----------------------------------------------------------------------------
-- 2. Writers
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_rename_test(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_title         text,
  p_if_match      int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_title        text;
  v_old_title    text;
  v_version      int;
  v_archived_at  timestamptz;
begin
  -- 0. Actor bind, before any table read.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- Same gate as every Test writer, before any lock.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  select title, version, archived_at
    into v_old_title, v_version, v_archived_at
    from public.tests
    where id = p_test_id
    for update;

  -- Archived freezes everything until restore (AC-06), a named refusal after
  -- the gate so a non-writer learns nothing new.
  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- Same rule as bunkai_create_test (0024): trim, then 1..200 characters.
  v_title := btrim(p_title);
  if v_title is null or char_length(v_title) not between 1 and 200 then
    raise exception 'title_invalid' using errcode = '45121';
  end if;

  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45125';
  end if;

  -- An identical name is a no-op: no write, no version bump, no event. A
  -- case-only change is a real rename.
  if v_title = v_old_title then
    return public.bunkai_test_json(p_test_id) || jsonb_build_object('changed', false);
  end if;

  update public.tests
    set title = v_title, version = version + 1
    where id = p_test_id;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'test', p_test_id, 'test.renamed',
    jsonb_build_object('old_title', v_old_title, 'new_title', v_title, 'version', v_version + 1)
  );

  return public.bunkai_test_json(p_test_id) || jsonb_build_object('changed', true);
end;
$$;

create or replace function public.bunkai_archive_test(
  p_actor_user_id uuid,
  p_test_id       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_title        text;
  v_archived_at  timestamptz;
  v_archived_by  uuid;
  v_changed      boolean := false;
begin
  -- 0. Actor bind, before any table read.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- FOR UPDATE: a concurrent archive serializes and sees "already archived";
  -- a Run writer holding FOR SHARE finishes first (its Run predates the archive).
  select title, archived_at, archived_by
    into v_title, v_archived_at, v_archived_by
    from public.tests
    where id = p_test_id
    for update;

  if v_archived_at is null then
    v_archived_at := now();
    v_archived_by := p_actor_user_id;
    v_changed := true;

    -- Never touches test_steps, runs or test_plan_tests: nothing is cascaded,
    -- nothing is edited (PO rulings B and C).
    update public.tests
      set archived_at = v_archived_at,
          archived_by = v_archived_by
      where id = p_test_id;

    if exists (
      select 1 from public.bunkai_test_failpoints f
       where f.name = 'test_archive.before_event'
         and f.workspace_id = v_workspace_id
    ) then
      raise exception 'test_failpoint' using errcode = 'P0001';
    end if;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, p_actor_user_id, 'test', p_test_id, 'test.archived',
      jsonb_build_object('title', v_title)
    );
  end if;

  return jsonb_build_object(
    'id', p_test_id,
    'title', v_title,
    'archived_at', v_archived_at,
    'archived_by', v_archived_by,
    'changed', v_changed
  );
end;
$$;

create or replace function public.bunkai_restore_test(
  p_actor_user_id uuid,
  p_test_id       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_title        text;
  v_archived_at  timestamptz;
  v_changed      boolean := false;
begin
  -- 0. Actor bind, before any table read.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  select title, archived_at
    into v_title, v_archived_at
    from public.tests
    where id = p_test_id
    for update;

  -- A Test has no archived parent (it is workspace-scoped, outside the module
  -- tree), so restore always clears the state. An archived chain ATC stays as
  -- it is: restore edits nothing else (PO ruling, Q5).
  if v_archived_at is not null then
    v_changed := true;

    update public.tests
      set archived_at = null,
          archived_by = null
      where id = p_test_id;

    if exists (
      select 1 from public.bunkai_test_failpoints f
       where f.name = 'test_restore.before_event'
         and f.workspace_id = v_workspace_id
    ) then
      raise exception 'test_failpoint' using errcode = 'P0001';
    end if;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, p_actor_user_id, 'test', p_test_id, 'test.restored',
      jsonb_build_object('title', v_title)
    );
  end if;

  return jsonb_build_object(
    'id', p_test_id,
    'title', v_title,
    'archived_at', null,
    'archived_by', null,
    'changed', v_changed
  );
end;
$$;

revoke execute on function public.bunkai_rename_test(uuid, uuid, text, int) from public, anon, authenticated;
revoke execute on function public.bunkai_archive_test(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.bunkai_restore_test(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bunkai_rename_test(uuid, uuid, text, int) to service_role;
grant execute on function public.bunkai_archive_test(uuid, uuid) to service_role;
grant execute on function public.bunkai_restore_test(uuid, uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_rename_test(uuid, uuid, text, int) from qa_inspector_ro;
    revoke all on function public.bunkai_archive_test(uuid, uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_restore_test(uuid, uuid) from qa_inspector_ro;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. bunkai_test_json (body from 0116_atc_archive_restore; the Test carries archived_at and archived_by)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_test_json(p_test_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'workspace_id', t.workspace_id,
    'title', t.title,
    'version', t.version,
    'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb),
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    -- BK-596: the archive state, plus what the archive confirmation names (the
    -- Runs that are kept and the Test Plans that keep holding the Test).
    'archived_at', t.archived_at,
    'archived_by', t.archived_by,
    'run_count', (select count(*) from public.runs r where r.test_id = t.id),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('id', tp.id, 'name', tp.name, 'status', tp.status)
                       order by tp.name, tp.id)
        from public.test_plan_tests tpt
        join public.test_plans tp on tp.id = tpt.test_plan_id
        where tpt.test_id = t.id), '[]'::jsonb),
    'atc_count', (select count(*) from public.test_steps ts where ts.test_id = t.id),
    'atcs', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'position', ts.position,
                 'step_id', ts.id,
                 'id', a.id,
                 'slug', a.slug,
                 'title', a.title,
                 'layer', a.layer,
                 'status', a.status,
                 'archived_at', a.archived_at,
                 'steps', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', s.id, 'position', s.position, 'content', s.content,
                            'input_data', s.input_data, 'expected', s.expected) order by s.position)
                     from public.atc_steps s where s.atc_id = a.id), '[]'::jsonb),
                 'assertions', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', x.id, 'position', x.position, 'content', x.content) order by x.position)
                     from public.atc_assertions x where x.atc_id = a.id), '[]'::jsonb)
               ) order by ts.position)
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id), '[]'::jsonb)
  )
  from public.tests t
  where t.id = p_test_id;
$$;

-- -----------------------------------------------------------------------------
-- 4. bunkai_reorder_test_steps (body from 0026_tests_reorder; an archived Test raises 45127)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_reorder_test_steps(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_if_match      int,
  p_step_ids      uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_version      int;
  v_submitted    int;
  v_distinct     int;
  v_existing     int;
  v_matched      int;
  v_current      uuid[];
  v_old_chain    uuid[];
  v_new_chain    uuid[];
  v_archived_at  timestamptz;
begin
  -- 1. Lock the Test header; capture workspace + current version.
  select workspace_id, version, archived_at
    into v_workspace_id, v_version, v_archived_at
    from public.tests
    where id = p_test_id
    for update;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: explicit actor must be a writer of the Test's workspace (viewer
  --    and non-member both hit 42501).
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- BK-596 (AC-06): an archived Test is frozen until restore. Named refusal,
  -- after the write gate, so a non-writer learns nothing new.
  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- 3. Chain must be non-empty (defensive twin of the route's Zod .min(1)).
  v_submitted := coalesce(array_length(p_step_ids, 1), 0);
  if v_submitted < 1 then
    raise exception 'chain_invalid' using errcode = '45124';
  end if;

  -- 4. No duplicate step_ids in the payload (a repeat would silently drop a row).
  select count(*) into v_distinct
    from (select distinct x from unnest(p_step_ids) as t(x)) d;
  if v_distinct <> v_submitted then
    raise exception 'chain_invalid' using errcode = '45124';
  end if;

  -- 5. Set equality under the lock: the submitted multiset must equal the Test's
  --    existing step_id set EXACTLY — same length and every id belongs to THIS
  --    Test. (Friendly missing/extra detail is computed in the route.)
  select count(*) into v_existing
    from public.test_steps where test_id = p_test_id;
  select count(*) into v_matched
    from public.test_steps
    where test_id = p_test_id and id = any(p_step_ids);
  if v_existing <> v_submitted or v_matched <> v_submitted then
    raise exception 'chain_mismatch' using errcode = '45123';
  end if;

  -- 6. Optimistic lock: If-Match (when supplied) must match the locked version.
  --    Current version is embedded in the message so the route surfaces it in
  --    the 409 body without a second round-trip.
  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45125';
  end if;

  -- 7. No-op: submitted order identical to the current order -> return current
  --    json with NO version bump, NO event, NO updated_at touch. Covers
  --    same-order submit, single-step Tests, and retry-safe double-click.
  select array_agg(id order by position) into v_current
    from public.test_steps where test_id = p_test_id;
  if v_current = p_step_ids then
    return public.bunkai_test_json(p_test_id);
  end if;

  -- 8. Real reorder. Capture old/new atc_id chains (run order) for the event.
  select array_agg(atc_id order by position) into v_old_chain
    from public.test_steps where test_id = p_test_id;
  select array_agg(ts.atc_id order by v.ord) into v_new_chain
    from unnest(p_step_ids) with ordinality as v(sid, ord)
    join public.test_steps ts on ts.id = v.sid and ts.test_id = p_test_id;

  -- Two-phase position rewrite: park all positions beyond the live range, then
  -- assign 1..n from the submitted order. Avoids transient unique(test_id,
  -- position) collisions without making the constraint deferrable, and keeps
  -- step_ids stable (no delete/reinsert — the UI keys on them).
  update public.test_steps
    set position = position + 1000000
    where test_id = p_test_id;

  update public.test_steps ts
    set position = v.ord::int
    from (select sid, ord from unnest(p_step_ids) with ordinality as u(sid, ord)) v
    where ts.id = v.sid and ts.test_id = p_test_id;

  -- Version bump (updated_at trigger from 0004 fires on this UPDATE).
  update public.tests
    set version = version + 1
    where id = p_test_id;

  -- Event: test.reordered (atomic with the position rewrite).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'test', p_test_id, 'test.reordered',
    jsonb_build_object(
      'version', v_version + 1,
      'old_chain', to_jsonb(v_old_chain),
      'new_chain', to_jsonb(v_new_chain)
    )
  );

  return public.bunkai_test_json(p_test_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. bunkai_set_test_tags (body from 0030_test_tags; an archived Test raises 45127)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_set_test_tags(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_if_match      int,
  p_tags          text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_version      int;
  v_current      text[];
  v_norm         text[];
  v_count        int;
  v_archived_at  timestamptz;
begin
  -- 1. Lock the Test header; capture workspace + current version + tags.
  select workspace_id, version, tags, archived_at
    into v_workspace_id, v_version, v_current, v_archived_at
    from public.tests
    where id = p_test_id
    for update;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: explicit actor must be a writer of the Test's workspace (viewer
  --    and non-member both hit 42501).
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- BK-596 (AC-06): an archived Test is frozen until restore. Named refusal,
  -- after the write gate, so a non-writer learns nothing new.
  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- 3. Normalize (trim, reserved-lowercase, dedupe) then validate the SHAPE:
  --    at most 20 tags, each <= 50 chars, comma-free. A comma or over-length
  --    element raises tags_invalid (45126); the route surfaces it as a 422.
  v_norm := public.bunkai_normalize_test_tags(p_tags);
  v_count := coalesce(array_length(v_norm, 1), 0);
  if v_count > 20 then
    raise exception 'tags_invalid' using errcode = '45126';
  end if;
  if exists (
    select 1 from unnest(v_norm) as e(val)
    where char_length(val) > 50 or position(',' in val) > 0
  ) then
    raise exception 'tags_invalid' using errcode = '45126';
  end if;

  -- 4. Optimistic lock: If-Match (when supplied) must match the locked version.
  --    Current version is embedded in the message so the route surfaces it in
  --    the 409 body without a second round-trip (identical to reorder).
  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45125';
  end if;

  -- 5. No-op: the normalized set equals the current set (order-insensitive) ->
  --    return current json with NO version bump, NO event, NO updated_at touch.
  --    Tags are a set, so compare as sorted arrays (the column preserves insert
  --    order but two equal sets in different orders are still a no-op).
  if (select array_agg(x order by x) from unnest(coalesce(v_current, '{}'::text[])) as t(x))
     is not distinct from
     (select array_agg(x order by x) from unnest(v_norm) as t(x)) then
    return public.bunkai_test_json(p_test_id);
  end if;

  -- 6. Real change. Write the normalized set, bump version (updated_at trigger
  --    from 0004 fires on this UPDATE), and emit the audit event.
  update public.tests
    set tags = v_norm, version = version + 1
    where id = p_test_id;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'test', p_test_id, 'test.tags_changed',
    jsonb_build_object(
      'version', v_version + 1,
      'old_tags', to_jsonb(coalesce(v_current, '{}'::text[])),
      'new_tags', to_jsonb(v_norm)
    )
  );

  return public.bunkai_test_json(p_test_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. bunkai_add_tests_to_plan (body from 0076_test_plan_tests; an archived Test raises 45127)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_add_tests_to_plan(
  p_test_plan_id uuid,
  p_test_ids     uuid[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_project_id   uuid;
  v_status       text;
  v_distinct     int;
  v_resolved     int;
  v_added_count  int;
begin
  -- 1. Resolve + lock the plan (serializes against a concurrent Close, same
  --    shape as bunkai_update_test_plan's row lock).
  select workspace_id, project_id, status
    into v_workspace_id, v_project_id, v_status
    from public.test_plans
    where id = p_test_plan_id
    for update;
  if v_workspace_id is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0073 shape): not a member at all -> 404;
  --    member but viewer -> 403.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Membership can only be edited while Open (AC E1).
  if v_status <> 'open' then
    raise exception 'test_plan_not_open' using errcode = '45603';
  end if;

  -- 4. At least one test id (defense in depth — the route's Zod schema
  --    already requires min(1)).
  if coalesce(array_length(p_test_ids, 1), 0) < 1 then
    raise exception 'test_selection_empty' using errcode = '45605';
  end if;

  -- 5. Every distinct submitted id must resolve to a Test in THIS workspace
  --    whose ENTIRE chain resolves inside THIS plan's project (AC E2):
  --    non-empty, and no chained ATC outside v_project_id. ANY-match (at
  --    least one chained ATC in the project) would let a Test whose chain
  --    spans two projects become a member of plans in BOTH — bunkai_create_test
  --    (0024) validates a chained ATC only against the Test's WORKSPACE, not
  --    against a single project, so a multi-project chain is legal and must
  --    be handled here, not assumed away. Nonexistent, foreign-workspace,
  --    empty-chain and cross-project ids all collapse into the SAME raise,
  --    with no id echoed back (INV-3, mirrors 0024's atc_not_in_workspace).
  select count(*) into v_resolved
    from public.tests t
    where t.id = any(p_test_ids)
      and t.workspace_id = v_workspace_id
      and exists (
        select 1 from public.test_steps ts
        where ts.test_id = t.id
      )
      and not exists (
        select 1
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id
          and a.project_id <> v_project_id
      );
  select count(*) into v_distinct
    from (select distinct x from unnest(p_test_ids) as t(x)) d;
  if v_resolved <> v_distinct then
    raise exception 'test_outside_plan_project' using errcode = '45604';
  end if;

  -- BK-596 (PO ruling C): an archived Test is not offered for a plan, and adding
  -- one is refused by name. FOR SHARE so a concurrent archive cannot slip in
  -- between this check and the insert.
  perform 1 from public.tests t
    where t.id = any(p_test_ids)
    for share;
  if exists (
    select 1 from public.tests t
     where t.id = any(p_test_ids)
       and t.archived_at is not null
  ) then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- 6. Insert every distinct id in one statement. Any (test_plan_id, test_id)
  --    pair that already exists raises 23505 and aborts the WHOLE insert —
  --    the entire batch is rejected, not partially applied (AC 3.2's "no new
  --    row is created", read as all-or-nothing for a multi-select add).
  insert into public.test_plan_tests (test_plan_id, test_id, added_by)
  select p_test_plan_id, x, auth.uid()
  from (select distinct x from unnest(p_test_ids) as t(x)) d;

  get diagnostics v_added_count = row_count;

  -- 7. Audit — one row per call, positive projection (0073's own convention).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'test_plan', p_test_plan_id, 'test_plan.tests_added',
    jsonb_build_object('test_ids', to_jsonb(p_test_ids), 'count', v_added_count)
  );

  return jsonb_build_object(
    'test_plan_id', p_test_plan_id,
    'added_count', v_added_count,
    'member_count', (select count(*) from public.test_plan_tests where test_plan_id = p_test_plan_id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. bunkai_create_run (body from 0122_streamed_run_step_results; FOR SHARE on the Test, an archived Test raises 45127 after the replay)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_create_run(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_environment_id uuid,
  p_executor_mode text,
  p_start_token   text,
  p_token_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_project_id     uuid;
  v_test_title     text;
  v_project_count  int;
  v_step_count     int;
  v_existing_id    uuid;
  v_module_id      uuid;
  v_run_id         uuid;
  v_run_atc_id     uuid;
  v_token_id       uuid;
  v_executor_name  text;
  v_atc            record;
  v_step           record;
  v_archived_at    timestamptz;
begin
  -- 1. Resolve the Test (workspace + title). Non-disclosure on missing/foreign.
  select workspace_id, title
    into v_workspace_id, v_test_title
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    -- Mirror the read-path non-disclosure: a non-member must not learn the Test exists.
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Resolve the Test's project from its chain (a Test's chained ATCs are single-project).
  -- (min(uuid) is not an aggregate; take any distinct project id via array_agg.)
  select count(distinct p.id), (array_agg(distinct p.id))[1]
    into v_project_count, v_project_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    join public.projects p on p.id = a.project_id
    where ts.test_id = p_test_id;

  -- AuthZ: actor must have member+ write access on the workspace. 42501, no disclosure.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- BK-596: hold the Test FOR SHARE until commit, so an archive (FOR UPDATE)
  -- waits for this Run or this Run sees the archive. Taken before the project
  -- lock below; the archive locks only the Test, so no cycle forms.
  select archived_at into v_archived_at
    from public.tests
    where id = p_test_id
    for share;

  -- 2. Executor mode.
  if p_executor_mode is null or p_executor_mode not in ('human', 'agent', 'ci') then
    raise exception 'executor_mode_invalid' using errcode = '45200';
  end if;

  -- 4. Executable-steps gate (count BEFORE env check would also work; we keep the
  --    plan's order: env first so a misconfigured env surfaces even on an empty Test).
  --    Count atc_steps reachable via test_steps -> atcs for this Test.
  select count(rs_step.id)
    into v_step_count
    from public.test_steps ts
    join public.atc_steps rs_step on rs_step.atc_id = ts.atc_id
    where ts.test_id = p_test_id;

  -- 3. Environment must belong to the Test's Project.
  --    (If the chain is empty there is no project to validate against -> the
  --    no_executable_steps gate below is the authoritative block; but when a project
  --    exists we validate env containment first per the plan's order.)
  if v_project_id is null then
    -- No chain at all -> cannot resolve a project; the Test has no executable steps.
    raise exception 'no_executable_steps' using errcode = '45202';
  end if;

  if not exists (
    select 1 from public.project_environments pe
    where pe.id = p_environment_id
      and pe.project_id = v_project_id
  ) then
    raise exception 'environment_invalid' using errcode = '45201';
  end if;

  if v_step_count = 0 then
    raise exception 'no_executable_steps' using errcode = '45202';
  end if;

  -- 5. Domain idempotency: same (test_id, start_token) within 24h -> return existing.
  --    Take the project write-lock first so concurrent same-token starts serialize and
  --    the lookup-before-insert is race-free (no partial unique index is possible on a
  --    now()-relative predicate; ADR-0004 / TD-3).
  perform 1 from public.projects where id = v_project_id for update;

  select id into v_existing_id
    from public.runs
    where test_id = p_test_id
      and start_token = p_start_token
      and started_at > now() - interval '24 hours'
    order by started_at desc
    limit 1;
  if v_existing_id is not null then
    -- Replay: same (test_id, start_token) within 24h. Tag the response so the
    -- HTTP layer can answer 200 (replay) vs 201 (created) deterministically.
    return public.bunkai_run_json(v_existing_id) || jsonb_build_object('replayed', true);
  end if;

  -- BK-596: a new Run cannot start from an archived Test (AI Tech Lead ruling
  -- B). Checked after the replay so a replayed start token still returns the
  -- Run it created before the archive (Dev Q8).
  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- Resolve v_module_id: the module of the chain-position-1 ATC (Technical
  -- Decision D1 — a Test's chain may span multiple ATC modules; the snapshot
  -- is deliberately the module of the FIRST chain position, a deterministic
  -- tie-break). test_steps.atc_id is NOT NULL (FK ... on delete restrict) and
  -- atcs.module_id is NOT NULL, so this always resolves for a Test that has
  -- passed the no_executable_steps gate above.
  select a.module_id
    into v_module_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
      and ts.position = 1;

  -- BK-223 — provenance of a run started with an access token: the actor's own,
  -- active token. An unresolvable token id attributes the run to nobody (both
  -- columns stay NULL), it never blocks the start. The name is snapshotted, so
  -- renaming or revoking the token later does not rewrite the run header.
  if p_token_id is not null then
    select t.id, left(coalesce(nullif(btrim(t.name), ''), 'API token'), 200)
      into v_token_id, v_executor_name
      from public.access_tokens t
      where t.id = p_token_id
        and t.user_id = p_actor_user_id
        and t.revoked_at is null
        and (t.expires_at is null or t.expires_at > now());
  end if;

  -- 6. Insert the header.
  insert into public.runs (
    workspace_id, project_id, test_id, environment_id, module_id,
    status, executor_mode, executor_user_id, executor_token_id, executor_name,
    start_token, test_title
  )
  values (
    v_workspace_id, v_project_id, p_test_id, p_environment_id, v_module_id,
    'running', p_executor_mode, p_actor_user_id, v_token_id, v_executor_name,
    p_start_token, v_test_title
  )
  returning id into v_run_id;

  -- Snapshot-walk the chain in position order: run_atcs then run_steps.
  for v_atc in
    select ts.position as chain_position, a.id as atc_id, a.title as atc_title
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
    order by ts.position
  loop
    insert into public.run_atcs (run_id, atc_id, position, atc_title, status)
    values (v_run_id, v_atc.atc_id, v_atc.chain_position, v_atc.atc_title, 'pending')
    returning id into v_run_atc_id;

    for v_step in
      select s.id as atc_step_id, s.position, s.content, s.input_data, s.expected
      from public.atc_steps s
      where s.atc_id = v_atc.atc_id
      order by s.position
    loop
      insert into public.run_steps (
        run_atc_id, atc_step_id, position, content, input_data, expected, status
      )
      values (
        v_run_atc_id, v_step.atc_step_id, v_step.position,
        v_step.content, v_step.input_data, v_step.expected, 'pending'
      );
    end loop;
  end loop;

  -- 7. Audit (DEFINER-only writer).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', v_run_id, 'run.started',
    jsonb_build_object(
      'test_id', p_test_id,
      'environment_id', p_environment_id,
      'executor_mode', p_executor_mode,
      'step_count', v_step_count
    )
  );

  -- Freshly created (not a replay).
  return public.bunkai_run_json(v_run_id) || jsonb_build_object('replayed', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. bunkai_submit_automated_run (body from 0121_automated_run_submission; FOR SHARE on the Test, an archived Test raises 45127 after the replay)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_submit_automated_run(
  p_actor_user_id    uuid,
  p_token_id         uuid,
  p_test_id          uuid,
  p_environment_name text,
  p_verdict          text,
  p_duration_seconds int,
  p_steps            jsonb,
  p_evidence_urls    text[] default '{}',
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_name   text;
  v_token_ws     uuid;
  v_token_scopes text[];
  v_workspace_id uuid;
  v_test_title   text;
  v_project_id   uuid;
  v_project_count int;
  v_chain_len    int;
  v_step_count   int;
  v_env_id       uuid;
  v_env_name     text := btrim(coalesce(p_environment_name, ''));
  v_evidence     text[] := coalesce(p_evidence_urls, '{}');
  v_key          text := p_idempotency_key;
  v_el           jsonb;
  v_pos          int;
  v_res          text;
  v_by_pos       jsonb := '{}'::jsonb;
  v_seen         int[] := '{}';
  v_dups         int[] := '{}';
  v_range        int[] := '{}';
  v_missing      int[];
  v_fail_count   int := 0;
  v_norm         jsonb;
  v_hash         text;
  v_key_row      record;
  v_url          text;
  v_module_id    uuid;
  v_run_id       uuid;
  v_run_atc_id   uuid;
  v_atc          record;
  v_step         record;
  v_status       text;
  v_started      timestamptz;
  v_archived_at  timestamptz;
begin
  -- 0. Actor bind (ADR-0012). NULL auth.uid() = service role / admin client, for
  --    which the parameter IS the identity; a present-but-different uid is a
  --    spoof and collapses into the missing-Test answer.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 1. The token: the actor's own, active, scoped run:execute, bound to a workspace.
  select t.name, t.workspace_id, t.scopes
    into v_token_name, v_token_ws, v_token_scopes
    from public.access_tokens t
    where t.id = p_token_id
      and t.user_id = p_actor_user_id
      and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now());
  if not found then
    raise exception 'submission_token_invalid' using errcode = '45237';
  end if;
  if v_token_ws is null then
    raise exception 'submission_token_unscoped' using errcode = '45238';
  end if;
  if not ('run:execute' = any (v_token_scopes)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2. The Test: missing or in another workspace than the token's -> the same 404.
  select workspace_id, title
    into v_workspace_id, v_test_title
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null or v_workspace_id <> v_token_ws then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 3. Membership first (P0002 for a non-member), then write access (42501 for a viewer).
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- BK-596: hold the Test FOR SHARE until commit (same reason as bunkai_create_run).
  select archived_at into v_archived_at
    from public.tests
    where id = p_test_id
    for share;

  -- 4. The chain: its project, its length, and the executable-steps gate.
  select count(distinct p.id), (array_agg(distinct p.id))[1]
    into v_project_count, v_project_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    join public.projects p on p.id = a.project_id
    where ts.test_id = p_test_id;

  select count(*) into v_chain_len from public.test_steps where test_id = p_test_id;

  select count(s.id)
    into v_step_count
    from public.test_steps ts
    join public.atc_steps s on s.atc_id = ts.atc_id
    where ts.test_id = p_test_id;

  if v_project_id is null or v_chain_len = 0 or v_step_count = 0 then
    raise exception 'no_executable_steps' using errcode = '45202';
  end if;

  -- 5. The environment, by name (case-insensitive), inside the Test's project.
  select pe.id
    into v_env_id
    from public.project_environments pe
    where pe.project_id = v_project_id
      and lower(pe.name) = lower(v_env_name);
  if v_env_id is null then
    raise exception 'environment_invalid' using errcode = '45201',
      detail = v_env_name;
  end if;

  -- 6. Backstops (Zod is the primary guard at the HTTP edge).
  if p_verdict is null or p_verdict not in ('passed', 'failed') then
    raise exception 'submission_vocabulary_invalid' using errcode = '45232',
      detail = 'verdict=' || coalesce(p_verdict, '');
  end if;

  if p_duration_seconds is null or p_duration_seconds < 0 or p_duration_seconds > 86400 then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'duration_seconds';
  end if;

  if v_key is not null and char_length(v_key) not between 1 and 64 then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'idempotency_key';
  end if;

  if cardinality(v_evidence) > 20 then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'evidence_urls';
  end if;
  foreach v_url in array v_evidence loop
    if v_url is null or char_length(v_url) > 2048 or v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'submission_field_invalid' using errcode = '45236',
        detail = 'evidence_urls:' || coalesce(v_url, '');
    end if;
  end loop;

  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'submission_steps_invalid' using errcode = '45234', detail = 'steps must be an array';
  end if;
  if jsonb_array_length(p_steps) > 500 then
    raise exception 'submission_steps_invalid' using errcode = '45234', detail = 'at most 500 steps';
  end if;

  for v_el in select value from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(v_el) <> 'object'
       or jsonb_typeof(v_el -> 'position') is distinct from 'number'
       or (v_el ->> 'position') !~ '^[0-9]{1,9}$' then
      raise exception 'submission_steps_invalid' using errcode = '45234',
        detail = 'each step needs an integer position and a result';
    end if;
    v_pos := (v_el ->> 'position')::int;
    v_res := case when jsonb_typeof(v_el -> 'result') = 'string' then v_el ->> 'result' end;
    if v_res is null or v_res not in ('pass', 'fail', 'block') then
      raise exception 'submission_vocabulary_invalid' using errcode = '45232',
        detail = 'result=' || coalesce(v_res, '');
    end if;
    if v_pos < 1 or v_pos > v_chain_len then
      v_range := array_append(v_range, v_pos);
    elsif v_pos = any (v_seen) then
      v_dups := array_append(v_dups, v_pos);
    else
      v_seen := array_append(v_seen, v_pos);
      v_by_pos := v_by_pos || jsonb_build_object(v_pos::text, v_res);
      if v_res <> 'pass' then
        v_fail_count := v_fail_count + 1;
      end if;
    end if;
  end loop;

  if cardinality(v_range) > 0 or cardinality(v_dups) > 0 then
    raise exception 'submission_steps_invalid' using errcode = '45234',
      detail = 'out_of_range=' || coalesce(array_to_string(v_range, ','), '')
        || ';duplicate=' || coalesce(array_to_string(v_dups, ','), '');
  end if;

  select coalesce(array_agg(g order by g), '{}')
    into v_missing
    from generate_series(1, v_chain_len) g
    where not (g = any (v_seen));
  if cardinality(v_missing) > 0 then
    raise exception 'submission_steps_incomplete' using errcode = '45233',
      detail = array_to_string(v_missing, ',');
  end if;

  if (p_verdict = 'passed' and v_fail_count > 0)
     or (p_verdict = 'failed' and v_fail_count = 0) then
    raise exception 'submission_verdict_inconsistent' using errcode = '45235',
      detail = 'verdict=' || p_verdict;
  end if;

  -- 7. Idempotency (only when a key was sent). The advisory lock serializes
  --    concurrent submissions of one (workspace, key).
  select jsonb_agg(jsonb_build_object('position', k::int, 'result', v) order by k::int)
    into v_norm
    from jsonb_each_text(v_by_pos) as t(k, v);

  v_hash := md5(jsonb_build_object(
    'test_id', p_test_id,
    'environment', lower(v_env_name),
    'verdict', p_verdict,
    'duration_seconds', p_duration_seconds,
    'steps', v_norm,
    'evidence_urls', to_jsonb(v_evidence)
  )::text);

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_key, 0));

    select k.request_hash, k.run_id, k.created_at
      into v_key_row
      from public.run_submission_keys k
      where k.workspace_id = v_workspace_id
        and k.idempotency_key = v_key;
    if found then
      if v_key_row.created_at > now() - interval '24 hours' then
        if v_key_row.request_hash = v_hash then
          return public.bunkai_run_json(v_key_row.run_id) || jsonb_build_object('replayed', true);
        end if;
        raise exception 'submission_key_conflict' using errcode = '45231';
      end if;
      -- Window over: the key is free again.
      delete from public.run_submission_keys
        where workspace_id = v_workspace_id and idempotency_key = v_key;
    end if;
  end if;

  -- BK-596: no new Run from an archived Test; a replayed key above still
  -- returns the Run it created before the archive.
  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- 8. The Run header. Finished now; started = finished - duration.
  v_started := now() - make_interval(secs => p_duration_seconds);

  select a.module_id
    into v_module_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
      and ts.position = (select min(position) from public.test_steps where test_id = p_test_id);

  insert into public.runs (
    workspace_id, project_id, test_id, environment_id, module_id,
    status, executor_mode, executor_user_id, executor_token_id, executor_name,
    evidence_urls, start_token, test_title, started_at, finished_at
  )
  values (
    v_workspace_id, v_project_id, p_test_id, v_env_id, v_module_id,
    p_verdict, 'agent', p_actor_user_id, p_token_id,
    left(coalesce(nullif(btrim(v_token_name), ''), 'API token'), 200),
    v_evidence, gen_random_uuid()::text, v_test_title, v_started, now()
  )
  returning id into v_run_id;

  -- Snapshot-walk the chain in position order. The submitted result is keyed by
  -- the ordinal chain position (1..N), which stays dense even if stored
  -- test_steps.position values ever have gaps; run_atcs.position keeps the
  -- stored value, as bunkai_create_run does.
  for v_atc in
    select ts.position as chain_position,
           (row_number() over (order by ts.position))::int as ordinal,
           a.id as atc_id, a.title as atc_title
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
    order by ts.position
  loop
    v_status := case v_by_pos ->> v_atc.ordinal::text
      when 'pass' then 'passed'
      when 'fail' then 'failed'
      else 'blocked'
    end;

    insert into public.run_atcs (run_id, atc_id, position, atc_title, status)
    values (v_run_id, v_atc.atc_id, v_atc.chain_position, v_atc.atc_title, v_status)
    returning id into v_run_atc_id;

    for v_step in
      select s.id as atc_step_id, s.position, s.content, s.input_data, s.expected
      from public.atc_steps s
      where s.atc_id = v_atc.atc_id
      order by s.position
    loop
      insert into public.run_steps (
        run_atc_id, atc_step_id, position, content, input_data, expected, status, executed_at
      )
      values (
        v_run_atc_id, v_step.atc_step_id, v_step.position,
        v_step.content, v_step.input_data, v_step.expected, v_status, now()
      );
    end loop;
  end loop;

  -- 9. Store the key, audit, answer. Audit is DEFINER-only; the run-event
  --    trigger (0107) notifies the token owner (a bearer call is non-interactive).
  if v_key is not null then
    insert into public.run_submission_keys (workspace_id, idempotency_key, request_hash, run_id)
    values (v_workspace_id, v_key, v_hash, v_run_id);
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', v_run_id, 'run.started',
    jsonb_build_object(
      'test_id', p_test_id,
      'environment_id', v_env_id,
      'executor_mode', 'agent',
      'step_count', v_step_count,
      'submitted', true
    )
  );
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', v_run_id, 'run.finished',
    jsonb_build_object('verdict', p_verdict, 'skipped_steps', 0, 'via', 'bearer', 'submitted', true)
  );

  return public.bunkai_run_json(v_run_id) || jsonb_build_object('replayed', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. bunkai_filter_tests_by_tag (body from 0098_bk742_tests_tag_filter_keyset_paging; archived Tests excluded)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_filter_tests_by_tag(
  p_actor_user_id uuid,
  p_tag           text,
  p_limit         int         default 20,
  p_after_created timestamptz default null,
  p_after_id      uuid        default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tag    text;
  v_limit  int;
  v_rows   jsonb;
  v_count  int;
  v_last   jsonb;
begin
  -- 0. Actor bind (BK-635).
  if auth.uid() is not null and p_actor_user_id <> auth.uid() then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  v_tag := (public.bunkai_normalize_test_tags(array[coalesce(p_tag, '')]))[1];
  if v_tag is null then
    return jsonb_build_object('items', '[]'::jsonb, 'next_after', null);
  end if;

  -- Fetch limit+1 rows: the extra one only proves more remain.
  select coalesce(jsonb_agg(row_json order by created_at desc, id desc), '[]'::jsonb)
    into v_rows
  from (
    select
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb),
        'step_count', (select count(*) from public.test_steps ts where ts.test_id = t.id)
      ) as row_json,
      t.created_at,
      t.id
    from public.tests t
    join public.workspaces w on w.id = t.workspace_id
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- BK-991: a soft-deleted workspace is out of reach (ADR-0015).
      and w.deleted_at is null
      -- BK-596: an offer surface; an archived Test is not offered.
      and t.archived_at is null
      and t.tags @> array[v_tag]
      and (
        p_after_created is null
        or p_after_id is null
        or (t.created_at, t.id) < (p_after_created, p_after_id)
      )
    order by t.created_at desc, t.id desc
    limit v_limit + 1
  ) ranked;

  v_count := jsonb_array_length(v_rows);
  if v_count <= v_limit then
    return jsonb_build_object('items', v_rows, 'next_after', null);
  end if;

  -- Position of the last row actually returned; it needs created_at, so
  -- re-read it from the table by id (row_json does not carry it).
  select jsonb_build_object('created_at', t.created_at, 'id', t.id)
    into v_last
  from public.tests t
  where t.id = ((v_rows -> (v_limit - 1)) ->> 'id')::uuid;

  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
                from jsonb_array_elements(v_rows) with ordinality as e(value, ord)
               where e.ord <= v_limit),
    'next_after', v_last
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. bunkai_atc_usage (body from 0089_workspace_helpers_deleted_guard; archived Tests excluded, archived_count added)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_atc_usage(
  p_actor_user_id uuid,
  p_atc_id        uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_result       jsonb;
begin
  -- Resolve the ATC's workspace AND gate membership in one shot: the row only
  -- comes back when the ATC exists, is not archived, the explicit actor is
  -- an active member of the owning workspace, and that workspace is not
  -- soft-deleted (BK-991). A miss on ANY of those leaves v_workspace_id null
  -- -> uniform not_found below (no existence disclosure).
  select p.workspace_id
    into v_workspace_id
    from public.atcs a
    join public.projects p on p.id = a.project_id
    join public.workspaces w on w.id = p.workspace_id
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where a.id = p_atc_id
      and a.archived_at is null
      and w.deleted_at is null
      and wm.user_id = p_actor_user_id
      and wm.status = 'active';

  if v_workspace_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  -- Distinct Tests that chain this ATC, ordered by title; each row carries the
  -- ascending list of positions the ATC occupies in that Test. The Test's
  -- workspace must equal the ATC's workspace (AC4.1) — redundant with the chain
  -- containment guarantee but asserted explicitly for isolation clarity.
  select coalesce(jsonb_agg(row_json order by sort_title asc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'test_id', t.id,
        'title', t.title,
        'positions', (
          select coalesce(jsonb_agg(ts2.position order by ts2.position), '[]'::jsonb)
            from public.test_steps ts2
            where ts2.test_id = t.id
              and ts2.atc_id = p_atc_id
        )
      ) as row_json,
      t.title as sort_title
    from public.tests t
    where t.workspace_id = v_workspace_id
      -- BK-596: "used in N Tests" offers the Test for reuse, so it counts live
      -- Tests only; archived_count lets the ATC save confirmation name the
      -- archived Tests the edit still reaches (AI PO ruling, Q6).
      and t.archived_at is null
      and exists (
        select 1 from public.test_steps ts
        where ts.test_id = t.id
          and ts.atc_id = p_atc_id
      )
  ) used;

  return jsonb_build_object(
    'count', jsonb_array_length(v_result),
    'used_in', v_result,
    'archived_count', (
      select count(*)
        from public.tests t
       where t.workspace_id = v_workspace_id
         and t.archived_at is not null
         and exists (
           select 1 from public.test_steps ts
            where ts.test_id = t.id
              and ts.atc_id = p_atc_id
         )
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. bunkai_search_tests (body from 0089_workspace_helpers_deleted_guard; archived Tests excluded)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_search_tests(
  p_actor_user_id uuid,
  p_query         text,
  p_project_id    uuid,
  p_limit         int default 20
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query  text;
  v_limit  int;
  v_result jsonb;
begin
  if auth.uid() is not null and p_actor_user_id <> auth.uid() then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query := btrim(coalesce(p_query, ''));
  if v_query = '' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb)
      ) as row_json,
      t.created_at
    from public.tests t
    join public.workspaces w on w.id = t.workspace_id
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- BK-991: a soft-deleted workspace is out of reach (ADR-0015).
      and w.deleted_at is null
      -- BK-596: the plan picker offers Tests; an archived one is not offered
      -- (and bunkai_add_tests_to_plan refuses it).
      and t.archived_at is null
      -- Same ALL-match posture as bunkai_add_tests_to_plan: a Test whose
      -- chain spans two projects is not a member of either search result set
      -- — searching in Project A must not surface a Test that
      -- bunkai_add_tests_to_plan would then reject with 45604.
      and exists (
        select 1 from public.test_steps ts
        where ts.test_id = t.id
      )
      and not exists (
        select 1
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id
          and a.project_id <> p_project_id
      )
      and (
        t.title ilike '%' || v_query || '%'
        or exists (select 1 from unnest(t.tags) as tag where tag ilike '%' || v_query || '%')
      )
    order by t.created_at desc
    limit v_limit
  ) matched;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. bunkai_search_workspace (body from 0071_workspace_search; archived Tests excluded)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_search_workspace(
  p_query         text,
  p_workspace_id  uuid,
  p_limit         int default 5
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query  tsquery;
  v_limit  int;
begin
  -- Defensive clamp — the route validates 2..20 via zod, but the RPC is a
  -- public contract: stay self-consistent if called directly. The PER-GROUP
  -- ceiling is 5 regardless of what the caller asks for (comment 12407
  -- correction (c) — no independent total cap, but the per-group cap is not
  -- caller-adjustable upward).
  v_limit := least(greatest(coalesce(p_limit, 5), 1), 5);

  if p_query is null or btrim(p_query) = '' then
    return '[]'::jsonb;
  end if;

  if array_length(regexp_split_to_array(btrim(p_query), '\s+'), 1) = 1 then
    v_query := to_tsquery('english', regexp_replace(btrim(p_query), '[:&|!()<>*]', '', 'g') || ':*');
  else
    v_query := plainto_tsquery('english', p_query);
  end if;

  if v_query is null then
    return '[]'::jsonb;
  end if;

  -- group_order pins the canonical, fixed rendering order (ATCs, Tests,
  -- Projects, Modules, Bugs, Runs — comment 12407 correction (c)). UNION ALL
  -- does not itself guarantee the outer aggregate preserves branch order, so
  -- jsonb_agg below orders explicitly by this column rather than relying on
  -- incidental ordering.
  return coalesce(
    (
      select jsonb_agg(row_json order by group_order)
      from (
        -- ---------------------------------------------------------------
        -- ATCs
        -- ---------------------------------------------------------------
        (
          select 1 as group_order, jsonb_build_object(
            'entity_type', 'atc',
            'id', a.id,
            'name', a.title,
            'project_id', a.project_id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.atcs a
          join public.projects p on p.id = a.project_id
          where a.archived_at is null
            and a.tsv @@ v_query
            and p.workspace_id = p_workspace_id
          order by
            ts_rank(a.tsv, v_query) * exp(-greatest(0, extract(epoch from (now() - a.updated_at))) / 604800.0) desc,
            a.updated_at desc,
            a.title asc,
            a.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Tests (workspace-scoped; representative project = first chained ATC)
        -- ---------------------------------------------------------------
        (
          select 2 as group_order, jsonb_build_object(
            'entity_type', 'test',
            'id', t.id,
            'name', t.title,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.tests t
          join public.test_steps ts on ts.test_id = t.id and ts.position = 1
          join public.atcs a on a.id = ts.atc_id
          join public.projects p on p.id = a.project_id
          where to_tsvector('english', t.title) @@ v_query
            and t.workspace_id = p_workspace_id
            -- BK-596: search and the palette offer a Test; an archived one is hidden.
            and t.archived_at is null
          order by
            ts_rank(to_tsvector('english', t.title), v_query) * exp(-greatest(0, extract(epoch from (now() - t.updated_at))) / 604800.0) desc,
            t.updated_at desc,
            t.title asc,
            t.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Projects
        -- ---------------------------------------------------------------
        (
          select 3 as group_order, jsonb_build_object(
            'entity_type', 'project',
            'id', p.id,
            'name', p.name,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.projects p
          where to_tsvector('english', p.name) @@ v_query
            and p.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', p.name), v_query) desc,
            p.created_at desc,
            p.name asc,
            p.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Modules
        -- ---------------------------------------------------------------
        (
          select 4 as group_order, jsonb_build_object(
            'entity_type', 'module',
            'id', m.id,
            'name', m.name,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.modules m
          join public.projects p on p.id = m.project_id
          where m.archived_at is null
            and to_tsvector('english', m.name) @@ v_query
            and p.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', m.name), v_query) desc,
            m.created_at desc,
            m.name asc,
            m.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Bugs
        -- ---------------------------------------------------------------
        (
          select 5 as group_order, jsonb_build_object(
            'entity_type', 'bug',
            'id', b.id,
            'name', b.title,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.bugs b
          join public.projects p on p.id = b.project_id
          where to_tsvector('english', b.title) @@ v_query
            and b.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', b.title), v_query) * exp(-greatest(0, extract(epoch from (now() - b.updated_at))) / 604800.0) desc,
            b.updated_at desc,
            b.title asc,
            b.id asc
          limit v_limit
        )
        union all
        -- ---------------------------------------------------------------
        -- Runs
        -- ---------------------------------------------------------------
        (
          select 6 as group_order, jsonb_build_object(
            'entity_type', 'run',
            'id', r.id,
            'name', r.test_title,
            'project_id', p.id,
            'project_slug', p.slug,
            'project_name', p.name
          ) as row_json
          from public.runs r
          join public.projects p on p.id = r.project_id
          where to_tsvector('english', r.test_title) @@ v_query
            and r.workspace_id = p_workspace_id
          order by
            ts_rank(to_tsvector('english', r.test_title), v_query) * exp(-greatest(0, extract(epoch from (now() - r.updated_at))) / 604800.0) desc,
            r.updated_at desc,
            r.test_title asc,
            r.id asc
          limit v_limit
        )
      ) grouped
    ),
    '[]'::jsonb
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. bunkai_report_story_traceability (body from 0116_atc_archive_restore; the Test carries archived_at, a live Test is preferred)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_report_story_traceability(
  p_actor_user_id  uuid,
  p_user_story_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_result       jsonb;
begin
  -- 0. Actor bind, step 0, before any table read. Unchanged from 0068.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve scope through module_id, re-check READ membership. Unchanged.
  select m.project_id, p.workspace_id into v_project_id, v_workspace_id
    from public.user_stories us
    join public.modules  m on m.id = us.module_id
    join public.projects p on p.id = m.project_id
   where us.id = p_user_story_id;
  if v_workspace_id is null then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. ONE statement, ONE snapshot (EC12, unchanged from 0068).
  with archived_anc as (
    select path from public.modules
     where project_id = v_project_id and archived_at is not null
  ),
  live_atc as (
    -- Now also selects the module identity (m.id, m.name) — the ONLY change
    -- to this CTE's projection. `modules` was already joined for the
    -- archived-module/archived-ancestor exclusion below; this just keeps two
    -- more of its already-fetched columns.
    -- BK-571: an ATC archived on its own is evidence (AC-07), so the ATC-level
    -- archived filter is gone and archived_at travels for the marker. An ATC under
    -- an archived Module stays excluded below, as before.
    select a.id, a.slug, a.title, a.layer, m.id as module_id, m.name as module_name,
           a.archived_at
      from public.atcs a
      join public.modules m on m.id = a.module_id
     where a.project_id = v_project_id
       and m.archived_at is null
       and not exists (
         select 1 from archived_anc anc
          where m.path like anc.path || '/%'
       )
  ),
  crit as (
    select ac.id, ac.title, ac.position
      from public.acceptance_criteria ac
     where ac.user_story_id = p_user_story_id
       and ac.archived_at is null
  ),
  pair as (
    -- Carries module_id/module_name through alongside the pre-existing
    -- slug/title/layer passthrough. Same load-bearing scope guard as 0068
    -- (joining against `live_atc`, never raw `atcs`).
    select c.id as ac_id, la.id as atc_id, la.slug, la.title, la.layer,
           la.module_id, la.module_name, la.archived_at
      from crit c
      join public.atc_acceptance_criteria j on j.acceptance_criterion_id = c.id
      join live_atc la on la.id = j.atc_id
  ),
  latest_run as (
    select distinct on (ra.atc_id)
           ra.atc_id,
           r.id as run_id,
           r.status as run_status,
           ra.status as atc_status,
           r.started_at,
           r.finished_at,
           r.test_id as run_test_id,
           r.test_title as run_test_title,
           case
             when r.status  = 'running' then 'in_flight'
             when r.status  = 'aborted' then 'aborted'
             when ra.status = 'pending' then 'in_flight'
             else ra.status
           end as state
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
     where ra.atc_id in (select atc_id from pair)
       and r.project_id = v_project_id
     order by ra.atc_id, r.started_at desc, r.id desc
  ),
  chain_test as (
    -- BK-596: a report surface, so an archived Test stays evidence. A live
    -- chaining Test is preferred over an archived one; ties keep the old order.
    select distinct on (ts.atc_id) ts.atc_id, ts.test_id, t.title as test_title,
           t.archived_at as test_archived_at
      from public.test_steps ts
      join public.tests t on t.id = ts.test_id
     where ts.atc_id in (select atc_id from pair)
     order by ts.atc_id, (t.archived_at is not null), ts.test_id
  ),
  chain_bug as (
    select b.id, b.title, b.severity, b.status, b.created_at,
           b.run_id, b.run_step_id, b.atc_id
      from public.bugs b
     where b.project_id = v_project_id
       and b.atc_id in (select atc_id from pair)
  )
  select jsonb_build_object(
    'story', (
      select jsonb_build_object(
        'id', us.id, 'title', us.title,
        'status', us.status, 'archived_at', us.archived_at
      )
        from public.user_stories us
       where us.id = p_user_story_id
    ),
    'criteria', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'atcs', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', pr.atc_id,
                'slug', pr.slug,
                'title', pr.title,
                'layer', pr.layer,
                'archived_at', pr.archived_at,
                'module', jsonb_build_object('id', pr.module_id, 'name', pr.module_name),
                'test', coalesce(
                  -- The Run's own start-time title (a past Run keeps its name);
                  -- archived_at is the Test's current state.
                  (select jsonb_build_object('id', lr.run_test_id, 'title', lr.run_test_title,
                                             'archived_at', rt.archived_at)
                     from latest_run lr
                     join public.tests rt on rt.id = lr.run_test_id
                    where lr.atc_id = pr.atc_id and lr.run_test_id is not null),
                  (select jsonb_build_object('id', ct.test_id, 'title', ct.test_title,
                                             'archived_at', ct.test_archived_at)
                     from chain_test ct
                    where ct.atc_id = pr.atc_id)
                ),
                'latest_run', (
                  select jsonb_build_object(
                    'run_id', lr.run_id,
                    'run_status', lr.run_status,
                    'atc_status', lr.atc_status,
                    'started_at', lr.started_at,
                    'finished_at', lr.finished_at,
                    'state', lr.state
                  )
                    from latest_run lr
                   where lr.atc_id = pr.atc_id
                ),
                'defects', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', cb.id, 'title', cb.title, 'severity', cb.severity,
                      'status', cb.status, 'created_at', cb.created_at,
                      'run_id', cb.run_id, 'run_step_id', cb.run_step_id
                    )
                    order by cb.created_at desc
                  )
                    from chain_bug cb
                   where cb.atc_id = pr.atc_id
                ), '[]'::jsonb)
              )
              order by pr.slug
            )
              from pair pr
             where pr.ac_id = c.id
          ), '[]'::jsonb)
        )
        order by c.position
      )
        from crit c
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. bunkai_list_activity (body from 0130_milestone_archive_restore; test.renamed, test.archived, test.restored)
-- -----------------------------------------------------------------------------
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
      'milestone.archived', 'milestone.restored',
      'test.renamed', 'test.archived', 'test.restored'
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
                   when 'test.renamed' then
                     -- BK-596: the name before and after.
                     jsonb_build_object('old_title', k.payload -> 'old_title', 'new_title', k.payload -> 'new_title')
                   when 'test.archived' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'test.restored' then
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
