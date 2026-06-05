-- Migration: 0015 — move a module to a different parent (BK-11)
-- Authored: 2026-06-04
--
-- One SECURITY DEFINER function that re-parents a module and re-bases the
-- materialized `path` of the module + every descendant, atomically. Guards:
--   * role gate (bunkai_can_write_workspace → 42501; DEFINER bypasses RLS)
--   * no-op: requested parent == current parent → zero writes
--   * same-project + active new parent (else 45003 parent_invalid)
--   * cycle: new parent is the source or a descendant, tested via the
--     materialized path (no recursive walk) → 45001 move_cycle
--   * depth: deepest node of the moved subtree must stay ≤ 6 → 45002 depth_exceeded
-- A destination slug collision trips unique(project_id, path) → 23505. The RAISE
-- message mirrors the reason string so the route can map by message as a fallback.

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

  -- No-op: same parent → no writes, return current row.
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

  select * into v_row from public.modules where id = p_module_id;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.bunkai_move_module(uuid, uuid) from public, anon;
