-- Migration: 0021 — ATC create + atomic update RPCs (BK-18)
-- Authored: 2026-06-08
--
-- BK-18 ships the ATC create/edit REST API (POST /api/v1/atcs,
-- PATCH /api/v1/atcs/{id}). The primary consumer is PAT (bearer) auth from
-- CLI/scripts, which carries no Supabase JWT — so auth.uid() is NULL and the
-- existing SECURITY INVOKER bunkai_save_atc (0007) cannot authorize the write.
--
-- These RPCs are SECURITY DEFINER and take the resolved actor user id
-- EXPLICITLY (p_actor_user_id), role-gating workspace membership against that
-- actor rather than auth.uid(). DEFINER is also the only way to write the
-- activity_log audit row, which has no client INSERT policy (0009).
--
--   bunkai_create_atc : derive project from the user story, cross-entity
--     validation (AC in US, module in US's project subtree), compute the
--     immutable slug <module-slug>/atc-<8 hex>, INSERT atcs + children in one
--     transaction, emit atc.created, return the composed ATC json.
--   bunkai_update_atc : optimistic If-Match guard under FOR UPDATE, full-replace
--     of children, version bump, emit atc.updated. user_story_id / module_id /
--     slug are immutable on edit.
--   bunkai_get_atc    : membership-gated read of one ATC (used by the empty-body
--     no-op PATCH so it cannot leak an ATC across workspaces).
--
-- bunkai_save_atc (0007) is retained — lib/supabase/rpc.ts still references it
-- for the future cookie/UI edit path (BK-19); these RPCs are additive.

-- ---------------------------------------------------------------------------
-- Helper: assert an explicit actor can write the workspace owning a project.
-- Returns the workspace_id for reuse (activity_log). SECURITY DEFINER so the
-- membership lookup is not itself subject to RLS.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_assert_actor_can_write_project(
  p_actor_user_id uuid,
  p_project_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
    from public.projects where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = p_actor_user_id
      and status = 'active'
      and role in ('member', 'admin', 'owner')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_workspace_id;
end;
$$;

revoke execute on function public.bunkai_assert_actor_can_write_project(uuid, uuid) from public, anon;
grant execute on function public.bunkai_assert_actor_can_write_project(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helper: compose the full ATC response json (header + ordered children + AC
-- ids), excluding the internal tsvector column. Called from the RPCs below.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_atc_json(p_atc_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'project_id', a.project_id,
    'module_id', a.module_id,
    'user_story_id', a.user_story_id,
    'slug', a.slug,
    'title', a.title,
    'layer', a.layer,
    'version', a.version,
    'status', a.status,
    'tags', to_jsonb(a.tags),
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'archived_at', a.archived_at,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'position', s.position, 'content', s.content,
               'input_data', s.input_data, 'expected', s.expected) order by s.position)
        from public.atc_steps s where s.atc_id = a.id), '[]'::jsonb),
    'assertions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'position', x.position, 'content', x.content) order by x.position)
        from public.atc_assertions x where x.atc_id = a.id), '[]'::jsonb),
    'acceptance_criterion_ids', coalesce((
      select jsonb_agg(ac.acceptance_criterion_id)
        from public.atc_acceptance_criteria ac where ac.atc_id = a.id), '[]'::jsonb)
  )
  from public.atcs a
  where a.id = p_atc_id;
$$;

revoke execute on function public.bunkai_atc_json(uuid) from public, anon;
grant execute on function public.bunkai_atc_json(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CREATE: bunkai_create_atc
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_create_atc(
  p_actor_user_id uuid,
  p_module_id     uuid,
  p_user_story_id uuid,
  p_title         text,
  p_layer         text,
  p_tags          text[],
  p_steps         jsonb,
  p_assertions    jsonb,
  p_ac_ids        uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_us_project   uuid;
  v_us_module    uuid;
  v_us_path      text;
  v_cand_project uuid;
  v_cand_path    text;
  v_module_slug  text;
  v_ac_count     int;
  v_distinct_ac  int;
  v_workspace_id uuid;
  v_atc_id       uuid;
  v_slug         text;
  v_step         jsonb;
  v_assertion    jsonb;
  v_position     int;
  v_ac_id        uuid;
begin
  -- The user story must exist, be active, and carries the project scope.
  select us.project_id, us.module_id
    into v_us_project, v_us_module
    from public.user_stories us
    where us.id = p_user_story_id and us.archived_at is null;
  if v_us_module is null then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;

  -- AuthZ: explicit actor must be a writer of the project's workspace.
  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_us_project);

  -- (a) every acceptance criterion must exist, be active, and belong to this US.
  if coalesce(array_length(p_ac_ids, 1), 0) = 0 then
    raise exception 'ac_outside_user_story' using errcode = '45020';
  end if;
  select count(*) into v_ac_count
    from public.acceptance_criteria ac
    where ac.id = any(p_ac_ids)
      and ac.user_story_id = p_user_story_id
      and ac.archived_at is null;
  select count(distinct x) into v_distinct_ac from unnest(p_ac_ids) as x;
  if v_ac_count <> v_distinct_ac then
    raise exception 'ac_outside_user_story' using errcode = '45020';
  end if;

  -- (b) module must equal the US's module OR be a descendant in the SAME project.
  select m.path into v_us_path
    from public.modules m
    where m.id = v_us_module and m.archived_at is null;

  select m.project_id, m.path
    into v_cand_project, v_cand_path
    from public.modules m
    where m.id = p_module_id and m.archived_at is null;
  if v_cand_path is null then
    raise exception 'module_not_found' using errcode = 'P0002';
  end if;
  if not (
    v_cand_project = v_us_project
    and (v_cand_path = v_us_path or v_cand_path like v_us_path || '/%')
  ) then
    raise exception 'module_outside_project_subtree' using errcode = '45021';
  end if;

  -- Slug: <module-slug>/atc-<8 hex>. Module slug = last path segment. The 8-hex
  -- suffix comes from a fresh uuid (deterministic-free, near-collision-proof).
  v_module_slug := lower(regexp_replace(v_cand_path, '^.*/', ''));
  v_slug := v_module_slug || '/atc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- Header (unique(project_id, slug) -> 23505 = slug_collision). project_id and
  -- module_id come from the validated user story / candidate module.
  insert into public.atcs (project_id, module_id, user_story_id, slug, title, layer, version, tags)
  values (v_us_project, p_module_id, p_user_story_id, v_slug, p_title, p_layer, 1, coalesce(p_tags, '{}'))
  returning id into v_atc_id;

  -- Steps: persist the submitted position (the route validated it as strictly
  -- increasing from 1); fall back to array ordinal when a caller omits it.
  -- Assertions carry no client position, so they take the 1..N ordinal.
  v_position := 1;
  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.atc_steps (atc_id, position, content, input_data, expected)
    values (
      v_atc_id, coalesce((v_step ->> 'position')::int, v_position),
      coalesce(v_step ->> 'content', ''),
      nullif(v_step ->> 'input_data', ''),
      nullif(v_step ->> 'expected', '')
    );
    v_position := v_position + 1;
  end loop;

  v_position := 1;
  for v_assertion in select * from jsonb_array_elements(coalesce(p_assertions, '[]'::jsonb))
  loop
    insert into public.atc_assertions (atc_id, position, content)
    values (v_atc_id, v_position, coalesce(v_assertion ->> 'content', ''));
    v_position := v_position + 1;
  end loop;

  foreach v_ac_id in array p_ac_ids loop
    insert into public.atc_acceptance_criteria (atc_id, acceptance_criterion_id)
    values (v_atc_id, v_ac_id)
    on conflict do nothing;
  end loop;

  -- Event: atc.created.
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'atc', v_atc_id, 'atc.created',
    jsonb_build_object('slug', v_slug, 'title', p_title, 'version', 1, 'affected_test_ids', '[]'::jsonb)
  );

  return public.bunkai_atc_json(v_atc_id);
end;
$$;

revoke execute on function public.bunkai_create_atc(uuid, uuid, uuid, text, text, text[], jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.bunkai_create_atc(uuid, uuid, uuid, text, text, text[], jsonb, jsonb, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- UPDATE: bunkai_update_atc (full replace; user_story_id/module_id/slug fixed)
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_update_atc(
  p_actor_user_id uuid,
  p_atc_id        uuid,
  p_if_match      int,
  p_title         text,
  p_layer         text,
  p_tags          text[],
  p_steps         jsonb,
  p_assertions    jsonb,
  p_ac_ids        uuid[]
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
  v_workspace_id  uuid;
  v_ac_count      int;
  v_distinct_ac   int;
  v_step          jsonb;
  v_assertion     jsonb;
  v_position      int;
  v_ac_id         uuid;
begin
  -- Lock the header; capture scope + current version.
  select project_id, user_story_id, version
    into v_project_id, v_user_story_id, v_version
    from public.atcs
    where id = p_atc_id and archived_at is null
    for update;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  -- Optimistic lock: If-Match must match the locked version. Current version is
  -- embedded in the message so the route can surface it in the 409 body.
  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45022';
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
  update public.atcs
    set title = p_title,
        layer = p_layer,
        tags = coalesce(p_tags, '{}'),
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

  -- Event: atc.updated (affected_test_ids empty in MVP — test_steps not yet built).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'atc', p_atc_id, 'atc.updated',
    jsonb_build_object('title', p_title, 'version', v_version + 1, 'affected_test_ids', '[]'::jsonb)
  );

  return public.bunkai_atc_json(p_atc_id);
end;
$$;

revoke execute on function public.bunkai_update_atc(uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.bunkai_update_atc(uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- READ (membership-gated): bunkai_get_atc — for the empty-body no-op PATCH.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_get_atc(
  p_actor_user_id uuid,
  p_atc_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id
    from public.atcs
    where id = p_atc_id and archived_at is null;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);
  return public.bunkai_atc_json(p_atc_id);
end;
$$;

revoke execute on function public.bunkai_get_atc(uuid, uuid) from public, anon;
grant execute on function public.bunkai_get_atc(uuid, uuid) to authenticated, service_role;
