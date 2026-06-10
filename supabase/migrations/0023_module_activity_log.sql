-- Migration: 0023 — activity_log audit rows for module structural mutations (BK-59)
-- Authored: 2026-06-10
--
-- Re-creates the three SECURITY DEFINER module-mutation functions (0014/0015)
-- with one in-function activity_log insert each, mirroring the 0021 ATC
-- precedent: the DEFINER insert is the only sanctioned write path (activity_log
-- has no client INSERT policy, 0009) and it commits atomically with the
-- mutation (a plpgsql body is one transaction — a denied/failed call rolls the
-- audit row back with it).
--
-- Actor = auth.uid() (NOT an explicit p_actor param as in 0021): these
-- functions are invoked through a user-scoped client on both auth paths
-- (cookie SSR session or PAT-minted user JWT) and already role-gate via
-- bunkai_can_write_workspace(auth.uid()), so the actor is guaranteed non-null
-- on every success path.
--
-- Events (entity_type 'module', entity_id = the module id, documented in
-- .context/business/events.md):
--   * module.renamed             — payload {name, old_path, new_path}
--   * module.description_updated — payload {} (no content leak)
--   * module.moved               — payload {old_path, new_path, old_parent_id, new_parent_id}
--   * module.archived            — payload = the per-table archived counts
-- No-op early returns (same-parent move, already-archived subtree) stay silent.
-- Module CREATE is intentionally out of scope: it is a direct RLS table insert,
-- not an RPC (see BK-59 scope note).
--
-- Function signatures are unchanged — no typegen needed. CREATE OR REPLACE
-- preserves existing grants; the revokes are repeated for self-containment.

-- =============================================================================
-- 1. bunkai_update_module — rename (+ optional description) with path rebuild
-- =============================================================================

create or replace function public.bunkai_update_module(
  p_module_id          uuid,
  p_name               text    default null,
  p_new_slug           text    default null,
  p_description        text    default null,
  p_update_description boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id    uuid;
  v_workspace_id  uuid;
  v_old_path      text;
  v_parent_prefix text;
  v_new_path      text;
  v_row           public.modules;
begin
  -- Only act on an active (non-archived) module; archived → treated as 404.
  select project_id, path
    into v_project_id, v_old_path
    from public.modules
    where id = p_module_id and archived_at is null;
  if v_project_id is null then
    raise exception 'module_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is not null then
    -- Defend against a direct RPC call that sends a name without its slug; the
    -- route always pairs them, but the function must not build a NULL/empty path.
    if p_new_slug is null or length(p_new_slug) < 1 then
      raise exception 'name_no_slug' using errcode = '22023';
    end if;

    -- Parent prefix = old path minus its last segment ('' for a root module).
    v_parent_prefix := regexp_replace(v_old_path, '/?[^/]+$', '');
    v_new_path := case
      when v_parent_prefix = '' then p_new_slug
      else v_parent_prefix || '/' || p_new_slug
    end;

    -- Rewrite this module's path + name and re-base every descendant's path onto
    -- the new prefix in a single statement. A collision with a sibling's path
    -- trips unique(project_id, path) → 23505 and rolls the whole call back.
    update public.modules
      set path = v_new_path || substring(path from char_length(v_old_path) + 1),
          name = case when id = p_module_id then p_name else name end
      where project_id = v_project_id
        and (id = p_module_id or path like v_old_path || '/%');

    -- Event: module.renamed (atomic with the rename).
    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, auth.uid(), 'module', p_module_id, 'module.renamed',
      jsonb_build_object('name', p_name, 'old_path', v_old_path, 'new_path', v_new_path)
    );
  end if;

  if p_update_description then
    update public.modules
      set description = p_description
      where id = p_module_id;

    -- Event: module.description_updated (empty payload — no content leak).
    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, auth.uid(), 'module', p_module_id, 'module.description_updated',
      '{}'::jsonb
    );
  end if;

  select * into v_row from public.modules where id = p_module_id;
  return to_jsonb(v_row);
end;
$$;

-- =============================================================================
-- 2. bunkai_move_module — re-parent + path re-base
-- =============================================================================

create or replace function public.bunkai_move_module(
  p_module_id     uuid,
  p_new_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id       uuid;
  v_current_parent   uuid;
  v_workspace_id     uuid;
  v_old_path         text;
  v_source_slug      text;
  v_new_parent_path  text;
  v_new_prefix       text;
  v_old_depth        int;
  v_new_source_depth int;
  v_subtree_max      int;
  v_new_position     int;
  v_row              public.modules;
begin
  -- Source must exist and be active.
  select project_id, parent_module_id, path
    into v_project_id, v_current_parent, v_old_path
    from public.modules
    where id = p_module_id and archived_at is null;
  if v_project_id is null then
    raise exception 'module_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- No-op: same parent → no writes, no audit row, return current row.
  if p_new_parent_id is not distinct from v_current_parent then
    select * into v_row from public.modules where id = p_module_id;
    return to_jsonb(v_row);
  end if;

  -- Validate the destination parent (unless moving to the project root).
  if p_new_parent_id is not null then
    select path into v_new_parent_path
      from public.modules
      where id = p_new_parent_id
        and project_id = v_project_id
        and archived_at is null;
    if v_new_parent_path is null then
      raise exception 'parent_invalid' using errcode = '45003';
    end if;

    -- Cycle: the destination is the source itself or one of its descendants.
    if p_new_parent_id = p_module_id
       or v_new_parent_path = v_old_path
       or v_new_parent_path like v_old_path || '/%' then
      raise exception 'move_cycle' using errcode = '45001';
    end if;
  end if;

  -- Depth: every subtree path shifts by (new_source_depth - old_source_depth);
  -- the deepest resulting node must stay within 6 levels.
  v_old_depth := array_length(string_to_array(v_old_path, '/'), 1);
  v_new_source_depth := case
    when p_new_parent_id is null then 1
    else array_length(string_to_array(v_new_parent_path, '/'), 1) + 1
  end;
  select max(array_length(string_to_array(path, '/'), 1))
    into v_subtree_max
    from public.modules
    where project_id = v_project_id
      and (id = p_module_id or path like v_old_path || '/%')
      and archived_at is null;
  if v_subtree_max + (v_new_source_depth - v_old_depth) > 6 then
    raise exception 'depth_exceeded' using errcode = '45002';
  end if;

  -- New prefix = destination_path/source_slug (or just source_slug at root).
  v_source_slug := regexp_replace(v_old_path, '^.*/', '');
  v_new_prefix := case
    when p_new_parent_id is null then v_source_slug
    else v_new_parent_path || '/' || v_source_slug
  end;

  -- Next position among the destination's siblings (excluding the source).
  select coalesce(max(position), -1) + 1
    into v_new_position
    from public.modules
    where project_id = v_project_id
      and parent_module_id is not distinct from p_new_parent_id
      and id <> p_module_id;

  -- One atomic UPDATE: re-base every subtree path onto the new prefix, and
  -- reassign the source's parent + position. Descendants keep their parent and
  -- position (their relative structure is preserved).
  update public.modules
    set path = v_new_prefix || substring(path from char_length(v_old_path) + 1),
        parent_module_id = case when id = p_module_id then p_new_parent_id else parent_module_id end,
        position = case when id = p_module_id then v_new_position else position end
    where project_id = v_project_id
      and (id = p_module_id or path like v_old_path || '/%');

  -- Event: module.moved (atomic with the move).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'module', p_module_id, 'module.moved',
    jsonb_build_object(
      'old_path', v_old_path,
      'new_path', v_new_prefix,
      'old_parent_id', v_current_parent,
      'new_parent_id', p_new_parent_id
    )
  );

  select * into v_row from public.modules where id = p_module_id;
  return to_jsonb(v_row);
end;
$$;

-- =============================================================================
-- 3. bunkai_archive_module_subtree — cascade soft-delete
-- =============================================================================

create or replace function public.bunkai_archive_module_subtree(p_module_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_module_ids   uuid[];
  v_story_ids    uuid[];
  v_now          timestamptz := now();
  c_modules      int := 0;
  c_stories      int := 0;
  c_acs          int := 0;
  c_atcs         int := 0;
begin
  select project_id into v_project_id
    from public.modules where id = p_module_id;
  if v_project_id is null then
    raise exception 'module_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Collect the module + all active descendant modules.
  with recursive subtree as (
    select id from public.modules
      where id = p_module_id and archived_at is null
    union all
    select m.id from public.modules m
      join subtree s on m.parent_module_id = s.id
      where m.archived_at is null
  )
  select array_agg(id) into v_module_ids from subtree;

  -- Already archived (or vanished): nothing to do, no audit row.
  if v_module_ids is null then
    return jsonb_build_object(
      'modules', 0, 'user_stories', 0, 'acceptance_criteria', 0, 'atcs', 0
    );
  end if;

  select array_agg(id) into v_story_ids
    from public.user_stories
    where module_id = any(v_module_ids) and archived_at is null;
  v_story_ids := coalesce(v_story_ids, '{}'::uuid[]);

  update public.modules set archived_at = v_now
    where id = any(v_module_ids) and archived_at is null;
  get diagnostics c_modules = row_count;

  update public.user_stories set archived_at = v_now
    where module_id = any(v_module_ids) and archived_at is null;
  get diagnostics c_stories = row_count;

  update public.acceptance_criteria set archived_at = v_now
    where user_story_id = any(v_story_ids) and archived_at is null;
  get diagnostics c_acs = row_count;

  update public.atcs set archived_at = v_now
    where (module_id = any(v_module_ids) or user_story_id = any(v_story_ids))
      and archived_at is null;
  get diagnostics c_atcs = row_count;

  -- Event: module.archived (payload = the same counts the caller receives).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'module', p_module_id, 'module.archived',
    jsonb_build_object(
      'modules', c_modules,
      'user_stories', c_stories,
      'acceptance_criteria', c_acs,
      'atcs', c_atcs
    )
  );

  return jsonb_build_object(
    'modules', c_modules,
    'user_stories', c_stories,
    'acceptance_criteria', c_acs,
    'atcs', c_atcs
  );
end;
$$;

-- =============================================================================
-- 4. grants — unchanged from 0014/0015 (repeated for self-containment)
-- =============================================================================

revoke execute on function public.bunkai_update_module(uuid, text, text, text, boolean) from public, anon;
revoke execute on function public.bunkai_move_module(uuid, uuid) from public, anon;
revoke execute on function public.bunkai_archive_module_subtree(uuid) from public, anon;
