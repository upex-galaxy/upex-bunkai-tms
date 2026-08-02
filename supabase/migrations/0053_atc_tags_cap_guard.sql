-- 0053_atc_tags_cap_guard.sql — BK-144: enforce the 10-tag cap on ATCs at the
-- RPC + DB layers, not just the UI/API-route layers.
--
-- Context: the web editor's `saveAtcAction` server action calls
-- `bunkai_update_atc` directly and does NOT go through the `AtcWriteBodySchema`
-- zod validation (`.max(MAX_ATC_TAGS)`, @lib/atcs/validation.ts) that the
-- headless POST/PATCH /api/v1/atcs routes already enforce. Both
-- `bunkai_create_atc` (0021) and `bunkai_update_atc` (0021, superseded by
-- 0035) are SECURITY DEFINER RPCs granted to `authenticated` — i.e. directly
-- callable via PostgREST (`/rest/v1/rpc/bunkai_update_atc`) by any signed-in
-- user, bypassing the Next.js route layer (and its zod check) entirely. That
-- makes the RPC the only real gate for a caller who skips the app layer, so
-- BK-144's root-cause fix adds the same 10-tag cap there, plus a DB CHECK
-- constraint as the final backstop against any future write path (including
-- the legacy `bunkai_save_atc`, 0007 — retained but unused by app code, see
-- lib/supabase/rpc.ts) that forgets to validate.
--
-- The literal `10` mirrors `MAX_ATC_TAGS` in @lib/atcs/validation.ts (single
-- source of truth on the TS side); SQL has no shared-constant mechanism across
-- migrations, so this follows the same inline-literal convention already used
-- for the title-length cap (0028_atc_duplicate.sql:71, mirrors ATC_TITLE_MAX).

-- ---------------------------------------------------------------------------
-- DB backstop: no row can ever carry more than 10 tags, regardless of caller.
-- ---------------------------------------------------------------------------
alter table public.atcs
  add constraint atcs_tags_max_10 check (coalesce(array_length(tags, 1), 0) <= 10);

-- ---------------------------------------------------------------------------
-- CREATE: bunkai_create_atc — add the tags-cap guard (body otherwise
-- unchanged from 0021_atc_create_update.sql).
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

  -- BK-144: cap mirrors MAX_ATC_TAGS (@lib/atcs/validation.ts). Checked here
  -- because this SECURITY DEFINER RPC is directly PostgREST-callable by any
  -- `authenticated` caller, bypassing the route's zod schema.
  if coalesce(array_length(p_tags, 1), 0) > 10 then
    raise exception 'atc_tags_limit_exceeded' using errcode = '45024';
  end if;

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
-- UPDATE: bunkai_update_atc — add the tags-cap guard (body otherwise
-- unchanged from 0035_atc_update_propagation.sql, the current live version).
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
  v_affected_ids  uuid[];
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

revoke execute on function public.bunkai_update_atc(uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.bunkai_update_atc(uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[]) to authenticated, service_role;
