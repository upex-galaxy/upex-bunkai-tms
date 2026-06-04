-- Migration: 0014 — module soft-delete + rename (BK-10)
-- Authored: 2026-06-04
--
-- Adds soft-delete (`archived_at`) to the module-subtree entity tables and two
-- SECURITY DEFINER functions that perform the BK-10 mutations atomically (a
-- function body is one implicit transaction, so a mid-cascade failure rolls the
-- whole thing back):
--   * bunkai_update_module          — rename (+ optional description). When the
--                                     name changes it rebuilds the materialized
--                                     `path` of the module AND every descendant
--                                     in one UPDATE; a sibling slug collision
--                                     trips unique(project_id, path) → 23505.
--   * bunkai_archive_module_subtree — cascade-archive the module, its descendant
--                                     modules, and the linked user_stories /
--                                     acceptance_criteria / atcs.
--
-- Both functions are role-gated via bunkai_can_write_workspace (viewer → 42501)
-- because SECURITY DEFINER bypasses RLS. The slug is computed app-side (same
-- slugify as BK-9 create) and passed in, so slug rules live in exactly one place.
-- Soft-delete is additive — no row is ever physically removed. The `tests` and
-- `bugs` tables do not exist yet (future epics) and are intentionally absent from
-- the cascade; extend bunkai_archive_module_subtree when they land.

-- =============================================================================
-- 1. archived_at columns
-- =============================================================================

alter table public.modules              add column if not exists archived_at timestamptz;
alter table public.user_stories         add column if not exists archived_at timestamptz;
alter table public.acceptance_criteria  add column if not exists archived_at timestamptz;
alter table public.atcs                 add column if not exists archived_at timestamptz;

-- The active-tree listing filters on `archived_at IS NULL`; a partial index keeps
-- that the fast path without indexing archived rows.
create index if not exists modules_project_active_idx
  on public.modules (project_id) where archived_at is null;

-- =============================================================================
-- 2. bunkai_update_module — rename (+ optional description) with path rebuild
-- =============================================================================
-- p_name        : new display name, already trimmed (NULL = leave name/path as-is).
-- p_new_slug    : slugify(p_name) computed app-side (ignored when p_name IS NULL).
-- p_description : new description value (may be NULL).
-- p_update_description : when true, description is set to p_description; when
--                        false, description is left untouched.

-- Text params default to NULL and p_update_description to false so the caller can
-- omit whatever it is not changing (Supabase typegen then marks them optional,
-- avoiding a null-vs-string mismatch in the route).
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
  end if;

  if p_update_description then
    update public.modules
      set description = p_description
      where id = p_module_id;
  end if;

  select * into v_row from public.modules where id = p_module_id;
  return to_jsonb(v_row);
end;
$$;

-- =============================================================================
-- 3. bunkai_archive_module_subtree — cascade soft-delete
-- =============================================================================
-- Returns per-table counts of newly archived rows as JSON.

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

  -- Already archived (or vanished): nothing to do.
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

  return jsonb_build_object(
    'modules', c_modules,
    'user_stories', c_stories,
    'acceptance_criteria', c_acs,
    'atcs', c_atcs
  );
end;
$$;

-- =============================================================================
-- 4. grants — mirror 0005: revoke from public/anon, keep authenticated
-- =============================================================================
-- Supabase default privileges grant EXECUTE to anon + authenticated explicitly,
-- so revoking from public + anon leaves authenticated's grant intact (required:
-- supabase.rpc() runs as the authenticated role).

revoke execute on function public.bunkai_update_module(uuid, text, text, text, boolean) from public, anon;
revoke execute on function public.bunkai_archive_module_subtree(uuid) from public, anon;
