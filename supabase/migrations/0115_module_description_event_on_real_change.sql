-- Migration: 0115 — module.description_updated only on a real Description change (BK-1590)
-- Authored: 2026-11-03
--
-- Defect: saving a module with only its name changed logged `module.renamed`
-- AND a false `module.description_updated`. The Rename module form submits the
-- name and the Description on every save, PATCH /api/v1/modules/{id}
-- (app/api/v1/modules/[id]/route.ts) sets p_update_description from the field's
-- presence, and the Description branch (inherited from 0023, kept by 0110)
-- wrote the column and emitted the event whenever p_update_description was
-- true, without comparing the incoming value to the stored one. Evidence on
-- BK-1590: two reproductions on staging, each with a `module.renamed` and a
-- `module.description_updated` from one save and an unchanged persisted
-- Description. Not a regression of 0110 (BK-1168): that fix gated the rename
-- branch, this one gates the Description branch. The two gates are
-- independent and read in the same pass.
--
-- Fix (database-side, so every caller is covered: cookie UI and PAT clients):
-- read the stored Description with the stored path and name, and run the
-- Description branch (column write + `module.description_updated`) only when
-- the incoming value differs from the stored one. A NULL and an empty string
-- both mean "no Description" (the form sends NULL for an empty field, a PAT
-- client may send ''), so the comparison runs on coalesce(value, ''): the
-- same text is a silent no-op, and a missing and an empty Description are the
-- same state. The unchanged case skips the UPDATE as well, so no write
-- reaches the row. The stored row is read FOR UPDATE: the comparison decides
-- whether a write happens, so a concurrent save must not change the value
-- between the read and the decision (a stale read would drop a revert).
--
-- Everything else is unchanged from 0110: same signature, same DEFINER
-- posture, same auth.uid() actor and bunkai_can_write_workspace gate, same
-- rename gate (BK-1168), same events and payloads.
--
-- CREATE OR REPLACE keeps the existing grants; the revoke is repeated for
-- self-containment, as 0023 and 0110 do. Signature unchanged: no typegen needed.

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
  v_project_id      uuid;
  v_workspace_id    uuid;
  v_old_path        text;
  v_parent_prefix   text;
  v_new_path        text;
  v_old_name        text;
  v_old_description text;
  v_row             public.modules;
begin
  -- Only act on an active (non-archived) module; archived → treated as 404.
  select project_id, path, name, description
    into v_project_id, v_old_path, v_old_name, v_old_description
    from public.modules
    where id = p_module_id and archived_at is null
    for update;
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

  -- BK-1590: the same form also re-sends the unchanged Description on every
  -- save, so a rename-only edit reached this branch and logged a false
  -- module.description_updated. Only a real change of the Description writes
  -- the column and logs the event. NULL and '' are the same "no Description".
  if p_update_description
     and coalesce(p_description, '') is distinct from coalesce(v_old_description, '') then
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
