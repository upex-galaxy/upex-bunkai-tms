-- =============================================================================
-- 0116_atc_archive_restore
-- BK-571 : archive an ATC and restore it from the archive (BK-039).
-- =============================================================================
--
-- WHY. atcs.archived_at has existed since 0014 and every reuse read honours it,
-- but nothing could set it for one ATC: the only writers are the Module and User
-- Story cascades. This migration adds the single-ATC writers and fixes the reads
-- that a first writer would otherwise break. The ticket's "no migration" meant
-- the column; the functions, archived_by and the evidence reads still need one.
--
-- WHAT.
--   1. atcs.archived_by: who archived this ATC on its own. NULL for an ATC that
--      is live or that a parent's cascade archived.
--   2. bunkai_archive_atc / bunkai_restore_atc: idempotent writers, one
--      activity_log row per real state change.
--   3. bunkai_update_atc / bunkai_duplicate_atc: an archived ATC raises the named
--      45025 atc_archived instead of a 404 (AC-08). Bodies otherwise unchanged
--      from 0087.
--   4. bunkai_test_json: each chain step carries archived_at (AC-05). Body
--      otherwise unchanged from 0030.
--   5. bunkai_report_story_traceability, bunkai_report_project_coverage,
--      bunkai_report_workspace_coverage: an ATC archived on its own stays
--      evidence; an Acceptance Criterion bound only to it is not "uncovered"
--      (AC-07, AI Tech Lead ruling of 2026-08-21: reuse reads filter, evidence
--      reads do not). An ATC under an archived Module stays excluded, exactly as
--      before. In the coverage reports an archived ATC that never ran no longer
--      holds a criterion at not_run (AI Product Owner decision on BK-571): it can
--      only count for what it already produced. A criterion whose bound ATCs are
--      all archived and unrun stays not_run, never uncovered. Bodies otherwise
--      unchanged from 0069, 0108 and 0109.
--   6. bunkai_list_activity: atc.archived and atc.restored join the backstop
--      allowlist and the projection. Body otherwise unchanged from 0114.
--
-- THE CONTRACT BK-601 AND BK-596 REUSE.
--   * Own archive vs cascade: an ATC is archived on its own when its archived_at
--     differs from its User Story's and its Module's. Cascades stamp one
--     timestamp across the subtree (0023, 0111), so equality means "the parent
--     did this". A Module restore brings back the children whose archived_at
--     equals the Module's AND whose User Story is live, leaves own archives alone,
--     and selects them the way the cascade does: module_id in the restored subtree
--     or user_story_id in the restored stories. An ATC's Module may be a descendant
--     of its Story's Module, so the two parents can archive it independently.
--   * Restore under an archived parent (AI Tech Lead decision on BK-571): readers
--     filter only atcs.archived_at and rely on the invariant "archived parent
--     means archived children" (0111, BK-1555). So restore does not clear the
--     column under an archived parent: it hands the ATC to the parent's cascade
--     state (archived_at = the parent's, archived_by = NULL). No reader changes,
--     the invariant holds, and the ATC returns with its parent.
--
-- AUTHORIZATION (ADR-0012, rpc-authorization.md section 4).
--   SECURITY DEFINER with p_actor_user_id, like the rest of the ATC family: the
--   API routes use the admin client and PAT callers have no auth.uid(). Actor
--   bind at step 0, write gate before any lock. Execute goes to service_role only:
--   every caller is an API route, so a signed-in session cannot reach these through
--   PostgREST. qa_inspector_ro is revoked explicitly (0085 default privileges, 0086
--   rule); qa_inspector_rw keeps the default grant, like the sibling writers. A
--   non-writer gets 42501 and a missing id P0002, as on every sibling ATC writer:
--   an accepted existence signal on unguessable ids.
--
--   The trigger in section 1 closes the other door: `authenticated` holds table
--   UPDATE on atcs (member-plus RLS), so a session could otherwise PATCH archived_at
--   or archived_by through PostgREST, with no event and a forged actor. It covers
--   only these two columns. Content writes through that same grant, and the legacy
--   INVOKER bunkai_save_atc, predate this story: they are ADR-0012 debt, tracked on
--   the ticket, not changed here.
--
-- CONCURRENCY. Writers lock the ATC row FOR UPDATE, so a repeated or simultaneous
-- call serializes and the loser sees "already in that state": no write, no event,
-- first actor and timestamp kept (PO answers Q3, Q4). Restore takes FOR SHARE on
-- the Module, then the User Story, BEFORE the ATC: the same order the cascades
-- lock in, so it cannot deadlock with one and always reads the committed parent
-- state. Without it a restore could read a parent mid-cascade and clear the ATC
-- right after the cascade skipped it, breaking the invariant above.
--
-- Failpoints atc_archive.before_event and atc_restore.before_event use the
-- ADR-0022 test table: they let a DB test prove the write and its event are one
-- transaction (AC-12). The table has no privilege for any user or QA role.
--
-- Additive and idempotent. Existing grants survive CREATE OR REPLACE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. archived_by
-- -----------------------------------------------------------------------------
alter table public.atcs
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.atcs.archived_by is
  'BK-571: who archived this ATC on its own. NULL when live or archived by a parent cascade.';

create or replace function public.bunkai_guard_atc_archive_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Runs as the caller, so current_user names who is really writing: the DEFINER
  -- writers and cascades arrive as the function owner, a PostgREST session as
  -- authenticated.
  if current_user in ('authenticated', 'anon') then
    raise exception 'atc_archive_columns_read_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.bunkai_guard_atc_archive_columns() from public, anon, authenticated;

drop trigger if exists atcs_guard_archive_columns on public.atcs;
create trigger atcs_guard_archive_columns
  before update of archived_at, archived_by on public.atcs
  for each row
  when (old.archived_at is distinct from new.archived_at
        or old.archived_by is distinct from new.archived_by)
  execute function public.bunkai_guard_atc_archive_columns();

-- -----------------------------------------------------------------------------
-- 2. Writers
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_archive_atc(
  p_actor_user_id uuid,
  p_atc_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_title        text;
  v_archived_at  timestamptz;
  v_archived_by  uuid;
  v_changed      boolean := false;
begin
  -- 0. Actor bind, before any table read.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  select project_id into v_project_id
    from public.atcs
    where id = p_atc_id;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  -- Same gate as an edit, before any lock: a non-writer can neither hold a row of
  -- another workspace nor learn its archive state.
  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  select title, archived_at, archived_by
    into v_title, v_archived_at, v_archived_by
    from public.atcs
    where id = p_atc_id
    for update;

  if v_archived_at is null then
    v_archived_at := now();
    v_archived_by := p_actor_user_id;
    v_changed := true;

    -- Never touches test_steps: chains keep the ATC (PO ruling, warn and allow).
    update public.atcs
      set archived_at = v_archived_at,
          archived_by = v_archived_by
      where id = p_atc_id;

    if exists (
      select 1 from public.bunkai_test_failpoints f
       where f.name = 'atc_archive.before_event'
         and f.workspace_id = v_workspace_id
    ) then
      raise exception 'test_failpoint' using errcode = 'P0001';
    end if;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, p_actor_user_id, 'atc', p_atc_id, 'atc.archived',
      jsonb_build_object('title', v_title)
    );
  end if;

  return jsonb_build_object(
    'id', p_atc_id,
    'title', v_title,
    'archived_at', v_archived_at,
    'archived_by', v_archived_by,
    'changed', v_changed
  );
end;
$$;

create or replace function public.bunkai_restore_atc(
  p_actor_user_id uuid,
  p_atc_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module_id          uuid;
  v_user_story_id      uuid;
  v_module_archived_at timestamptz;
  v_story_archived_at  timestamptz;
  v_project_id         uuid;
  v_workspace_id       uuid;
  v_title              text;
  v_archived_at        timestamptz;
  v_archived_by        uuid;
  v_held_by            text;
  v_changed            boolean := false;
begin
  -- 0. Actor bind, before any table read.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  -- No ATC edit path changes module_id or user_story_id, so this unlocked read
  -- names the parents to lock.
  select project_id, module_id, user_story_id
    into v_project_id, v_module_id, v_user_story_id
    from public.atcs
    where id = p_atc_id;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  -- Parents first, in cascade lock order (see the header).
  select archived_at into v_module_archived_at
    from public.modules where id = v_module_id for share;
  select archived_at into v_story_archived_at
    from public.user_stories where id = v_user_story_id for share;

  select title, archived_at, archived_by
    into v_title, v_archived_at, v_archived_by
    from public.atcs
    where id = p_atc_id
    for update;

  -- A Module cascade also stamps its stories, so equal stamps mean the Module holds
  -- the ATC. Different stamps mean the User Story was archived on its own: it holds
  -- the ATC, because restoring the Module would not restore that Story.
  v_held_by := case
    when v_module_archived_at is not null
         and v_story_archived_at is not distinct from v_module_archived_at then 'module'
    when v_story_archived_at is not null then 'user_story'
    when v_module_archived_at is not null then 'module'
  end;

  -- No own archive to undo: live, or stamped by a parent's cascade. A no-op.
  if v_archived_at is not null
     and v_archived_at is distinct from v_story_archived_at
     and v_archived_at is distinct from v_module_archived_at then
    v_archived_at := coalesce(v_story_archived_at, v_module_archived_at);
    v_archived_by := null;
    v_changed := true;

    update public.atcs
      set archived_at = v_archived_at,
          archived_by = null
      where id = p_atc_id;

    if exists (
      select 1 from public.bunkai_test_failpoints f
       where f.name = 'atc_restore.before_event'
         and f.workspace_id = v_workspace_id
    ) then
      raise exception 'test_failpoint' using errcode = 'P0001';
    end if;

    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, p_actor_user_id, 'atc', p_atc_id, 'atc.restored',
      jsonb_build_object('title', v_title)
    );
  end if;

  return jsonb_build_object(
    'id', p_atc_id,
    'title', v_title,
    'archived_at', v_archived_at,
    'archived_by', v_archived_by,
    'held_by_parent', v_held_by,
    'changed', v_changed
  );
end;
$$;

revoke execute on function public.bunkai_archive_atc(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.bunkai_restore_atc(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bunkai_archive_atc(uuid, uuid) to service_role;
grant execute on function public.bunkai_restore_atc(uuid, uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_archive_atc(uuid, uuid) from qa_inspector_ro;
    revoke all on function public.bunkai_restore_atc(uuid, uuid) from qa_inspector_ro;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3a. bunkai_update_atc (body from 0087; the archived refusal is the only change)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_update_atc(
  p_actor_user_id uuid,
  p_atc_id        uuid,
  p_if_match      int,
  p_title         text,
  p_layer         text,
  p_tags          text[],
  p_steps         jsonb,
  p_assertions    jsonb,
  p_ac_ids        uuid[],
  p_technique     text default null,
  p_priority      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id    uuid;
  v_user_story_id uuid;
  v_version       int;
  v_archived_at   timestamptz;
  v_workspace_id  uuid;
  v_ac_count      int;
  v_distinct_ac   int;
  v_step          jsonb;
  v_assertion     jsonb;
  v_position      int;
  v_ac_id         uuid;
  v_affected_ids  uuid[];
begin
  -- Lock the header; capture scope + current version.
  select project_id, user_story_id, version, archived_at
    into v_project_id, v_user_story_id, v_version, v_archived_at
    from public.atcs
    where id = p_atc_id
    for update;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  -- BK-571 (AC-08): archived freezes everything until restore. A named refusal,
  -- after the write gate on the actor, so a non-writer learns nothing new.
  if v_archived_at is not null then
    raise exception 'atc_archived' using errcode = '45025';
  end if;

  -- Optimistic lock: If-Match must match the locked version. Current version is
  -- embedded in the message so the route can surface it in the 409 body.
  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45022';
  end if;

  -- BK-144: cap mirrors MAX_ATC_TAGS (@lib/atcs/validation.ts). Checked here
  -- because this SECURITY DEFINER RPC is directly PostgREST-callable by any
  -- `authenticated` caller, bypassing the route's zod schema — and because
  -- the web editor's saveAtcAction server action calls this RPC directly
  -- without going through that schema at all.
  if coalesce(array_length(p_tags, 1), 0) > 10 then
    raise exception 'atc_tags_limit_exceeded' using errcode = '45024';
  end if;

  -- AC re-validation against the ATC's immutable user story.
  if coalesce(array_length(p_ac_ids, 1), 0) = 0 then
    raise exception 'ac_outside_user_story' using errcode = '45020';
  end if;
  select count(*) into v_ac_count
    from public.acceptance_criteria ac
    where ac.id = any(p_ac_ids)
      and ac.user_story_id = v_user_story_id
      and ac.archived_at is null;
  select count(distinct x) into v_distinct_ac from unnest(p_ac_ids) as x;
  if v_ac_count <> v_distinct_ac then
    raise exception 'ac_outside_user_story' using errcode = '45020';
  end if;

  -- Header update + version bump. user_story_id / module_id / slug stay put.
  -- BK-399 — technique/priority are full-replace like every sibling on this
  -- payload: an omitted parameter arrives as NULL and clears the value.
  update public.atcs
    set title = p_title,
        layer = p_layer,
        tags = coalesce(p_tags, '{}'),
        technique = p_technique,
        priority = p_priority,
        version = version + 1,
        updated_at = now()
    where id = p_atc_id;

  -- Children: full replace. Steps persist the submitted (validated) position;
  -- assertions take the 1..N ordinal.
  delete from public.atc_steps where atc_id = p_atc_id;
  v_position := 1;
  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.atc_steps (atc_id, position, content, input_data, expected)
    values (
      p_atc_id, coalesce((v_step ->> 'position')::int, v_position),
      coalesce(v_step ->> 'content', ''),
      nullif(v_step ->> 'input_data', ''),
      nullif(v_step ->> 'expected', '')
    );
    v_position := v_position + 1;
  end loop;

  delete from public.atc_assertions where atc_id = p_atc_id;
  v_position := 1;
  for v_assertion in select * from jsonb_array_elements(coalesce(p_assertions, '[]'::jsonb))
  loop
    insert into public.atc_assertions (atc_id, position, content)
    values (p_atc_id, v_position, coalesce(v_assertion ->> 'content', ''));
    v_position := v_position + 1;
  end loop;

  delete from public.atc_acceptance_criteria where atc_id = p_atc_id;
  foreach v_ac_id in array p_ac_ids loop
    insert into public.atc_acceptance_criteria (atc_id, acceptance_criterion_id)
    values (p_atc_id, v_ac_id)
    on conflict do nothing;
  end loop;

  -- BK-21: the DISTINCT Tests that chain this ATC, computed in-transaction so
  -- the emitted event matches the persisted edit exactly. A Test referencing
  -- the ATC at several positions collapses to one id (array_agg(distinct)).
  -- Empty when the ATC is chained by no Test → to_jsonb yields '[]'.
  select coalesce(array_agg(distinct ts.test_id), '{}')
    into v_affected_ids
    from public.test_steps ts
    where ts.atc_id = p_atc_id;

  -- Event: atc.updated, now carrying the real affected Test ids (BK-21).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'atc', p_atc_id, 'atc.updated',
    jsonb_build_object('title', p_title, 'version', v_version + 1, 'affected_test_ids', to_jsonb(v_affected_ids))
  );

  -- Return shape UNCHANGED (bare composed ATC) for backward compatibility on
  -- the shared remote project — see 0035's header note. The route derives
  -- affected_test_count via bunkai_atc_usage (0029).
  return public.bunkai_atc_json(p_atc_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3b. bunkai_duplicate_atc (body from 0087; the archived refusal is the only change)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_duplicate_atc(
  p_actor_user_id  uuid,
  p_source_atc_id  uuid,
  p_title          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id    uuid;
  v_module_id     uuid;
  v_user_story_id uuid;
  v_src_title     text;
  v_layer         text;
  v_tags          text[];
  v_technique     text;
  v_priority      text;
  v_module_slug   text;
  v_module_path   text;
  v_new_title     text;
  v_workspace_id  uuid;
  v_new_atc_id    uuid;
  v_slug          text;
  v_archived_at   timestamptz;
begin
  -- Read the source header. Workspace-scoped via the authZ guard below: a
  -- cross-workspace source surfaces as not_found or forbidden; an archived one as
  -- atc_archived (BK-571), after the guard.
  select project_id, module_id, user_story_id, title, layer, tags, technique, priority, archived_at
    into v_project_id, v_module_id, v_user_story_id, v_src_title, v_layer, v_tags, v_technique, v_priority, v_archived_at
    from public.atcs
    where id = p_source_atc_id;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  -- AuthZ: explicit actor must be a writer of the project's workspace.
  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  -- BK-571 (AC-08): an archived ATC cannot be duplicated into circulation.
  if v_archived_at is not null then
    raise exception 'atc_archived' using errcode = '45025';
  end if;

  -- Title: caller-provided wins; otherwise default to `<source> (copy)`.
  -- MVP appends a single ` (copy)` suffix with no de-dup — duplicating a copy
  -- yields `… (copy) (copy)` (PO-PENDING, see implementation-plan §6).
  v_new_title := coalesce(p_title, v_src_title || ' (copy)');

  -- The computed default can overflow the 200-char title cap when the source
  -- title is ≥ 195 chars. Reject (422) rather than truncate — the truncate vs
  -- reject choice is PO-PENDING (see implementation-plan §6). A caller-provided
  -- title is already bounded 3–200 by the route's zod schema.
  if char_length(v_new_title) > 200 then
    raise exception 'title_too_long' using errcode = '45023';
  end if;

  -- Slug: a fresh `<module-slug>/atc-<8 hex>`, NEVER cloned from the source.
  -- Module slug = last segment of the module path. unique(project_id, slug)
  -- guards collisions (23505 → slug_collision, route retries).
  select m.path into v_module_path
    from public.modules m where m.id = v_module_id;
  v_module_slug := lower(regexp_replace(v_module_path, '^.*/', ''));
  v_slug := v_module_slug || '/atc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- Header: a new atcs row, version = 1, same scope as the source. BK-399 —
  -- technique/priority are carried verbatim (NULL stays NULL).
  insert into public.atcs (project_id, module_id, user_story_id, slug, title, layer, version, tags, technique, priority)
  values (v_project_id, v_module_id, v_user_story_id, v_slug, v_new_title, v_layer, 1, coalesce(v_tags, '{}'), v_technique, v_priority)
  returning id into v_new_atc_id;

  -- Steps: copy verbatim, preserving `position` (unique(atc_id, position) keeps
  -- ordering). A single set-based insert keeps the copy faithful and atomic.
  insert into public.atc_steps (atc_id, position, content, input_data, expected)
  select v_new_atc_id, s.position, s.content, s.input_data, s.expected
    from public.atc_steps s
    where s.atc_id = p_source_atc_id;

  -- Assertions: copy verbatim, preserving `position`.
  insert into public.atc_assertions (atc_id, position, content)
  select v_new_atc_id, x.position, x.content
    from public.atc_assertions x
    where x.atc_id = p_source_atc_id;

  -- AC bindings: copy the M:N anchors (provenance per business-rules).
  insert into public.atc_acceptance_criteria (atc_id, acceptance_criterion_id)
  select v_new_atc_id, ac.acceptance_criterion_id
    from public.atc_acceptance_criteria ac
    where ac.atc_id = p_source_atc_id
  on conflict do nothing;

  -- Event: atc.created (NOT a bespoke atc.duplicated — the copy is a normal
  -- create to the activity log + search index).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'atc', v_new_atc_id, 'atc.created',
    jsonb_build_object('slug', v_slug, 'title', v_new_title, 'version', 1, 'affected_test_ids', '[]'::jsonb)
  );

  return public.bunkai_atc_json(v_new_atc_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. bunkai_test_json (body from 0030; archived_at on each chain step)
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
-- 5a. bunkai_report_story_traceability (body from 0069)
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
    select distinct on (ts.atc_id) ts.atc_id, ts.test_id, t.title as test_title
      from public.test_steps ts
      join public.tests t on t.id = ts.test_id
     where ts.atc_id in (select atc_id from pair)
     order by ts.atc_id, ts.test_id
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
                  (select jsonb_build_object('id', lr.run_test_id, 'title', lr.run_test_title)
                     from latest_run lr
                    where lr.atc_id = pr.atc_id and lr.run_test_id is not null),
                  (select jsonb_build_object('id', ct.test_id, 'title', ct.test_title)
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
-- 5b. bunkai_report_project_coverage (body from 0108)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_report_project_coverage(
  p_actor_user_id uuid,
  p_project_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_result       jsonb;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which
  --    the parameter IS the identity; a present-but-different uid is a spoof
  --    and collapses into the missing-Project answer (non-disclosure).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Project, then re-check READ membership. Both failures
  --    raise the identical P0002 (non-disclosure) — mirrors
  --    bunkai_report_project_runs exactly.
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  with proj_modules as (
    -- Every non-archived Module of this Project. This is the project-scope
    -- boundary for the whole report (mirrors bunkai_report_project_runs's own
    -- `r.project_id = p_project_id` reasoning: RLS gates at the workspace
    -- boundary only, this predicate is the actual project-scope enforcement).
    select m.id, m.name, m.position
      from public.modules m
      where m.project_id = p_project_id
        and m.archived_at is null
  ),
  ac_scope as (
    -- Every non-archived AC belonging to a non-archived User Story inside a
    -- non-archived Module of this Project. AC/User-Story/Module hierarchy is
    -- the authoritative scope — NOT atcs.module_id/user_story_id (an ATC's
    -- own denormalized columns are its authoring context, not proof it covers
    -- a given AC's module).
    select
      ac.id as ac_id,
      ac.title as ac_title,
      ac.position as ac_position,
      us.id as user_story_id,
      us.title as user_story_title,
      pm.id as module_id
      from public.acceptance_criteria ac
      join public.user_stories us on us.id = ac.user_story_id
      join proj_modules pm on pm.id = us.module_id
      where ac.archived_at is null
        and us.archived_at is null
  ),
  atc_real_status as (
    -- Per-ATC real execution status — see header. One row per atc_id, from
    -- its most recent run (runs.started_at). Within that run, or runs tied on
    -- started_at, an executed occurrence (passed/failed) wins over one that
    -- was not executed, so an ATC repeated in one Test chain reads executed
    -- when any of its occurrences ran (0108 header, BK-1220). (run_id,
    -- position) is unique, so the order is total.
    select distinct on (ra.atc_id)
      ra.atc_id,
      ra.status
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
      where ra.atc_id is not null
      order by ra.atc_id,
               r.started_at desc,
               case when ra.status in ('passed', 'failed') then 0 else 1 end,
               ra.run_id,
               ra.position
  ),
  ac_state as (
    -- Per-AC coverage state (Q1/Q2/Q3 collapsed into one 3-way case — see
    -- 0048's header comment). BK-571: an ATC archived on its own still counts as
    -- coverage, it is evidence (AC-07); one under an archived Module does not, AND
    -- only ATCs belonging to THIS project (`a.project_id = p_project_id`) —
    -- the atc_acceptance_criteria join table has no DB-level constraint tying
    -- an ATC and an AC to the same project, so this predicate is the actual
    -- project-scope enforcement here. "not run" is read from
    -- atc_real_status: anything but passed/failed (0090 header, BK-1081).
    select
      s.ac_id, s.ac_title, s.ac_position,
      s.user_story_id, s.user_story_title, s.module_id,
      count(a.id) as linked_count,
      bool_or(a.id is not null and a.archived_at is null and coalesce(ars.status, 'pending') not in ('passed', 'failed')) as has_unrun,
      case
        when count(a.id) = 0 then 'uncovered'
        -- BK-571: an archived ATC never holds a criterion at not_run, but it needs a
        -- recorded result to count as executed: all archived and unrun stays not_run.
        when bool_or(a.id is not null and a.archived_at is null and coalesce(ars.status, 'pending') not in ('passed', 'failed')) then 'not_run'
        when not bool_or(coalesce(ars.status, 'pending') in ('passed', 'failed')) then 'not_run'
        else 'executed'
      end as state
      from ac_scope s
      left join public.atc_acceptance_criteria aac on aac.acceptance_criterion_id = s.ac_id
      left join public.atcs a on a.id = aac.atc_id
        and (
          a.archived_at is null
          or exists (
            select 1 from public.modules am
             where am.id = a.module_id
               and am.archived_at is null
          )
        )
        and a.project_id = p_project_id
      left join atc_real_status ars on ars.atc_id = a.id
      group by s.ac_id, s.ac_title, s.ac_position, s.user_story_id, s.user_story_title, s.module_id
  ),
  module_rollup as (
    -- Right join proj_modules so a Module with ZERO ACs still gets a row
    -- (ATP Group 5 #1 — "module with no user stories" must not error).
    select
      pm.id as module_id,
      pm.name as module_name,
      pm.position as module_position,
      count(cs.ac_id) as ac_total,
      count(cs.ac_id) filter (where cs.state = 'uncovered') as ac_uncovered,
      count(cs.ac_id) filter (where cs.state = 'not_run') as ac_not_run,
      count(cs.ac_id) filter (where cs.state = 'executed') as ac_executed,
      case
        when count(cs.ac_id) = 0 then 'no_acs'
        when count(cs.ac_id) filter (where cs.state = 'uncovered') > 0 then 'uncovered'
        when count(cs.ac_id) filter (where cs.state = 'not_run') > 0 then 'not_run'
        else 'fully_covered'
      end as status
      from proj_modules pm
      left join ac_state cs on cs.module_id = pm.id
      group by pm.id, pm.name, pm.position
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'ac_total', count(*),
        'ac_bound', count(*) filter (where state <> 'uncovered'),
        'ac_executed', count(*) filter (where state = 'executed'),
        'modules_total', (select count(*) from module_rollup),
        'modules_fully_covered', (select count(*) from module_rollup where status = 'fully_covered')
      )
      from ac_state
    ),
    'modules', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'module_id', mr.module_id,
          'module_name', mr.module_name,
          'ac_total', mr.ac_total,
          'ac_uncovered', mr.ac_uncovered,
          'ac_not_run', mr.ac_not_run,
          'ac_executed', mr.ac_executed,
          'status', mr.status
        -- module_position has no per-project uniqueness constraint, so tie
        -- on module_id for a deterministic order regardless of duplicate
        -- positions.
        ) order by mr.module_position, mr.module_id
      ), '[]'::jsonb)
      from module_rollup mr
    ),
    'no_coverage', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'ac_id', cs.ac_id,
          'ac_title', cs.ac_title,
          'user_story_id', cs.user_story_id,
          'user_story_title', cs.user_story_title,
          'module_id', cs.module_id,
          'module_name', pm.name
        -- ac_position is unique only per user_story_id, not per module, so
        -- two ACs from different stories in the same module can tie — add
        -- ac_id as a deterministic final tiebreaker.
        ) order by pm.position, cs.ac_position, cs.ac_id
      ), '[]'::jsonb)
      from ac_state cs
      join proj_modules pm on pm.id = cs.module_id
      where cs.state = 'uncovered'
    )
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5c. bunkai_report_workspace_coverage (body from 0109)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_report_workspace_coverage(
  p_actor_user_id uuid,
  p_workspace_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- 0. Actor bind (0108 step 0).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  -- 1. READ membership of a live workspace; raises P0002 otherwise.
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, p_workspace_id);

  with ws_projects as (
    select p.id
      from public.projects p
      where p.workspace_id = p_workspace_id
  ),
  proj_modules as (
    select m.id, m.project_id
      from public.modules m
      join ws_projects wp on wp.id = m.project_id
      where m.archived_at is null
  ),
  ac_scope as (
    select
      ac.id as ac_id,
      pm.id as module_id,
      pm.project_id
      from public.acceptance_criteria ac
      join public.user_stories us on us.id = ac.user_story_id
      join proj_modules pm on pm.id = us.module_id
      where ac.archived_at is null
        and us.archived_at is null
  ),
  atc_real_status as (
    -- 0108's ordering, unchanged, over the workspace's ATCs only.
    select distinct on (ra.atc_id)
      ra.atc_id,
      ra.status
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
      join public.atcs wa on wa.id = ra.atc_id
      join ws_projects wp on wp.id = wa.project_id
      where ra.atc_id is not null
      order by ra.atc_id,
               r.started_at desc,
               case when ra.status in ('passed', 'failed') then 0 else 1 end,
               ra.run_id,
               ra.position
  ),
  ac_state as (
    select
      s.ac_id,
      s.module_id,
      case
        when count(a.id) = 0 then 'uncovered'
        -- BK-571: an archived ATC never holds a criterion at not_run, but it needs a
        -- recorded result to count as executed: all archived and unrun stays not_run.
        when bool_or(a.id is not null and a.archived_at is null and coalesce(ars.status, 'pending') not in ('passed', 'failed')) then 'not_run'
        when not bool_or(coalesce(ars.status, 'pending') in ('passed', 'failed')) then 'not_run'
        else 'executed'
      end as state
      from ac_scope s
      left join public.atc_acceptance_criteria aac on aac.acceptance_criterion_id = s.ac_id
      left join public.atcs a on a.id = aac.atc_id
        -- BK-571: same evidence rule as bunkai_report_project_coverage.
        and (
          a.archived_at is null
          or exists (
            select 1 from public.modules am
             where am.id = a.module_id
               and am.archived_at is null
          )
        )
        and a.project_id = s.project_id
      left join atc_real_status ars on ars.atc_id = a.id
      group by s.ac_id, s.module_id
  ),
  module_rollup as (
    select
      pm.id as module_id,
      case
        when count(cs.ac_id) = 0 then 'no_acs'
        when count(cs.ac_id) filter (where cs.state = 'uncovered') > 0 then 'uncovered'
        when count(cs.ac_id) filter (where cs.state = 'not_run') > 0 then 'not_run'
        else 'fully_covered'
      end as status
      from proj_modules pm
      left join ac_state cs on cs.module_id = pm.id
      group by pm.id
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'ac_total', count(*),
        'ac_bound', count(*) filter (where state <> 'uncovered'),
        'ac_executed', count(*) filter (where state = 'executed'),
        'modules_total', (select count(*) from module_rollup),
        'modules_fully_covered', (select count(*) from module_rollup where status = 'fully_covered')
      )
      from ac_state
    ),
    'project_count', (select count(*) from ws_projects)
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. bunkai_list_activity (body from 0114)
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
      'atc.archived', 'atc.restored'
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

-- Verification (run after apply):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'atcs' and column_name = 'archived_by';
--   select has_function_privilege('authenticated', 'public.bunkai_archive_atc(uuid, uuid)', 'EXECUTE'); -- false
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_restore_atc(uuid, uuid)', 'EXECUTE'); -- false
--   select md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
--     from pg_proc where proname = 'bunkai_restore_atc'; -- equals the file's body, normalized the same way
