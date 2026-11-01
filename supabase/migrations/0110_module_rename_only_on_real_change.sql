-- Migration: 0110 — module.renamed only on a real rename (BK-1168)
-- Authored: 2026-11-01
--
-- Defect: editing only a module's Description through the Rename module form
-- logged a false `module.renamed` next to `module.description_updated`. The
-- form submits `name` and `description` on every save, the PATCH route
-- (app/api/v1/modules/[id]/route.ts) forwards any present `name` as p_name,
-- and 0023's bunkai_update_module emitted `module.renamed` whenever p_name was
-- non-null, without comparing it to the stored name. Evidence on BK-1168: two
-- false events whose payload has old_path = new_path and an unchanged name.
--
-- Fix (database-side, so every caller is covered: cookie UI and PAT clients):
-- read the stored name with the stored path, and run the rename branch (row
-- rewrite + `module.renamed`) only when the name or the rebuilt path actually
-- changes. A name that differs only by case is a real rename and still logs.
-- Everything else is unchanged from 0023: same signature, same
-- DEFINER posture, same auth.uid() actor and bunkai_can_write_workspace gate,
-- same events and payloads.
--
-- CREATE OR REPLACE keeps the existing grants; the revoke is repeated for
-- self-containment, as 0023 does. Signature unchanged: no typegen needed.

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
  v_old_name      text;
  v_row           public.modules;
begin
  -- Only act on an active (non-archived) module; archived → treated as 404.
  select project_id, path, name
    into v_project_id, v_old_path, v_old_name
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

    -- BK-1168: the Rename module form sends the unchanged name on every save,
    -- so a description-only edit reached this branch and logged a false
    -- module.renamed (old_path = new_path). Only a real change of the name or
    -- of the rebuilt path rewrites the rows and logs the rename; the same name
    -- is a silent no-op here and the description branch below still runs.
    if p_name is distinct from v_old_name or v_new_path is distinct from v_old_path then
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

revoke execute on function public.bunkai_update_module(uuid, text, text, text, boolean) from public, anon;
