-- =============================================================================
-- 0124_atc_bulk_edit
-- BK-507 : bulk-edit tags, Module, layer or priority on selected ATCs.
-- =============================================================================
--
-- WHY. A Senior QA Engineer reorganising a Project's ATCs after a refactor had to
-- open each ATC one at a time. `bunkai_update_atc` cannot serve a batch: it is a
-- full-replace single-ATC edit and it never writes module_id (the subtree rule
-- lives only in the create RPC). A bulk Module move is therefore new capability.
-- Contract and rulings: ADR-0027.
--
-- WHAT. ONE new function, bunkai_bulk_edit_atcs. Nothing existing is redefined:
-- bunkai_update_atc and bunkai_list_activity keep their bodies (the shared
-- database also serves production, ADR-0009 decision 5). The activity feed
-- already projects `atc.updated` from title, version and affected_test_ids, so
-- the extra payload keys written here ride along without touching it.
--
--   * ONE field per call: tags (op add | remove), module, layer or priority.
--   * Per-ATC subtransaction (BEGIN ... EXCEPTION): one ATC failing rolls back
--     that ATC's write and its event, never the others. The result lists one
--     outcome per requested ATC: changed | unchanged | refused, with a reason
--     from a fixed vocabulary: not_found, archived, stale_version,
--     tags_limit_exceeded, module_outside_story_subtree, slug_conflict,
--     write_failed. Raw database text never leaves the function.
--   * A no-op is a success and is evaluated BEFORE the stale check: no version
--     bump, no event. That makes a double confirm idempotent.
--   * A stale ATC (the version the caller saw differs from the locked one, and
--     the value is not already the target) is refused, never overwritten.
--   * Module move: validated per ATC against that ATC's own User Story Module
--     subtree, inclusive (the rule bunkai_create_atc applies). The destination is
--     locked FOR SHARE before any ATC, and ATCs are locked in id order, the order
--     the archive cascades use, so a concurrent Module archive cannot leave a live
--     ATC under an archived Module. The module segment of the slug is
--     regenerated and the 8-hex suffix is kept.
--   * p_dry_run runs the same evaluation with no lock, no write and no event, so
--     the confirmation can pre-report refusals.
--   * Ceiling: 200 ATCs per call, raised before any lock.
--   * One `atc.updated` event per changed ATC, with the distinct chaining Test
--     ids computed in the same transaction, exactly like the single edit.
--
-- AUTHORIZATION (ADR-0012, rpc-authorization.md section 4).
--   1. SECURITY DEFINER with p_actor_user_id, like the rest of the ATC family:
--      the route uses the admin client and PAT callers have no auth.uid().
--   2. Actor bind at step 0, before any table read. A spoofed actor raises the
--      same P0002 as a missing project.
--   3. One write-gate assert on p_project_id. Every ATC read or written is
--      constrained to that project, so an id from another project is reported as
--      `not_found` exactly like a nonexistent one (no existence signal).
--   4. Execute goes to service_role only. A signed-in session cannot reach it
--      through PostgREST. qa_inspector_ro is revoked explicitly (0085 default
--      privileges, 0086 rule).
--   5. A viewer is refused by the write gate (42501), before anything is read.
--
-- Error codes for request-level failures (nothing is written):
--   45026 bulk_selection_invalid  empty, malformed or over the 200 ceiling
--   45027 bulk_change_invalid     unknown field, bad op, bad value
--   P0002 module_not_found        destination Module missing, archived or in
--                                 another Project (also project_not_found)
--
-- Failpoint atc_bulk_edit.before_event uses the ADR-0022 test table: it lets a
-- DB test prove the per-ATC write and its event are one transaction. The table
-- has no privilege for any user or QA role.
--
-- Additive and idempotent.
-- =============================================================================

create or replace function public.bunkai_bulk_edit_atcs(
  p_actor_user_id uuid,
  p_project_id    uuid,
  p_items         jsonb,
  p_field         text,
  p_change        jsonb,
  p_dry_run       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_ceiling      constant int := 200;
  v_workspace_id uuid;
  v_op           text;
  v_tags         text[];
  v_layer        text;
  v_priority     text;
  v_dest_id      uuid;
  v_dest_path    text;
  v_dest_slug    text;
  v_item_count   int;
  v_row          record;
  v_atc          record;
  v_expected     int;
  v_us_path      text;
  v_new_tags     text[];
  v_new_slug     text;
  v_noop         boolean;
  v_outcome      text;
  v_reason       text;
  v_slug         text;
  v_title        text;
  v_version      int;
  v_orig_slug    text;
  v_orig_version int;
  v_affected_ids uuid[];
  v_outcomes     jsonb := '[]'::jsonb;
  v_requested    int := 0;
  v_changed      int := 0;
  v_unchanged    int := 0;
  v_refused      int := 0;
begin
  -- 0. Actor bind. A NULL auth.uid() is the service-role / admin client, for which
  --    the parameter is the only identity; a present but different uid is a spoof.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, p_project_id);

  -- Selection shape and ceiling, before any lock.
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > c_ceiling then
    raise exception 'bulk_selection_invalid' using errcode = '45026';
  end if;
  begin
    perform 1 from jsonb_to_recordset(p_items) as x(id uuid, version int);
  exception when others then
    raise exception 'bulk_selection_invalid' using errcode = '45026';
  end;

  -- The change, validated once for the whole request.
  if p_change is null or jsonb_typeof(p_change) <> 'object' then
    raise exception 'bulk_change_invalid' using errcode = '45027';
  end if;

  if p_field = 'tags' then
    v_op := p_change ->> 'op';
    if v_op is null or v_op not in ('add', 'remove')
       or jsonb_typeof(p_change -> 'tags') <> 'array' then
      raise exception 'bulk_change_invalid' using errcode = '45027';
    end if;
    -- Normalised exactly like the editor: trim, collapse inner whitespace, lower-case.
    select coalesce(array_agg(distinct n order by n), '{}')
      into v_tags
      from (
        select lower(btrim(regexp_replace(t, '\s+', ' ', 'g'))) as n
          from jsonb_array_elements_text(p_change -> 'tags') as t
      ) s
      where n <> '';
    if cardinality(v_tags) = 0 or cardinality(v_tags) > 10
       or exists (select 1 from unnest(v_tags) as u(t) where char_length(t) > 50) then
      raise exception 'bulk_change_invalid' using errcode = '45027';
    end if;

  elsif p_field = 'layer' then
    v_layer := p_change ->> 'layer';
    if v_layer is null or v_layer not in ('UI', 'API', 'Unit') then
      raise exception 'bulk_change_invalid' using errcode = '45027';
    end if;

  elsif p_field = 'priority' then
    -- JSON null clears the priority ("not specified"); the key must be present.
    if not (p_change ? 'priority') then
      raise exception 'bulk_change_invalid' using errcode = '45027';
    end if;
    v_priority := p_change ->> 'priority';
    if v_priority is not null and v_priority not in ('Critical', 'High', 'Medium', 'Low') then
      raise exception 'bulk_change_invalid' using errcode = '45027';
    end if;

  elsif p_field = 'module' then
    begin
      v_dest_id := (p_change ->> 'module_id')::uuid;
    exception when others then
      raise exception 'bulk_change_invalid' using errcode = '45027';
    end;
    if v_dest_id is null then
      raise exception 'bulk_change_invalid' using errcode = '45027';
    end if;
    -- FOR SHARE before any ATC lock: the archive cascades lock the Module first.
    if p_dry_run then
      select m.path into v_dest_path
        from public.modules m
        where m.id = v_dest_id and m.project_id = p_project_id and m.archived_at is null;
    else
      select m.path into v_dest_path
        from public.modules m
        where m.id = v_dest_id and m.project_id = p_project_id and m.archived_at is null
        for share;
    end if;
    if v_dest_path is null then
      raise exception 'module_not_found' using errcode = 'P0002';
    end if;
    v_dest_slug := lower(regexp_replace(v_dest_path, '^.*/', ''));

  else
    raise exception 'bulk_change_invalid' using errcode = '45027';
  end if;

  -- One row per distinct id, in id order (the deterministic lock order).
  for v_row in
    select distinct on (x.id) x.id, x.version
      from jsonb_to_recordset(p_items) as x(id uuid, version int)
      order by x.id, x.version nulls last
  loop
    v_requested := v_requested + 1;
    v_expected := v_row.version;
    v_outcome := null;
    v_reason := null;
    v_slug := null;
    v_title := null;
    v_version := null;
    v_orig_slug := null;
    v_orig_version := null;

    -- One subtransaction per ATC: a failure here undoes this ATC only.
    begin
      if p_dry_run then
        select a.id, a.slug, a.title, a.layer, a.version, a.tags, a.priority,
               a.archived_at, a.module_id, a.user_story_id
          into v_atc
          from public.atcs a
          where a.id = v_row.id and a.project_id = p_project_id;
      else
        select a.id, a.slug, a.title, a.layer, a.version, a.tags, a.priority,
               a.archived_at, a.module_id, a.user_story_id
          into v_atc
          from public.atcs a
          where a.id = v_row.id and a.project_id = p_project_id
          for update;
      end if;

      if not found then
        v_outcome := 'refused';
        v_reason := 'not_found';
      else
        v_slug := v_atc.slug;
        v_title := v_atc.title;
        v_version := v_atc.version;
        v_orig_slug := v_atc.slug;
        v_orig_version := v_atc.version;

        if v_atc.archived_at is not null then
          v_outcome := 'refused';
          v_reason := 'archived';
        else
          v_noop := false;
          v_new_tags := null;

          if p_field = 'layer' then
            v_noop := v_atc.layer = v_layer;
          elsif p_field = 'priority' then
            v_noop := v_atc.priority is not distinct from v_priority;
          elsif p_field = 'module' then
            v_noop := v_atc.module_id = v_dest_id;
          elsif v_op = 'add' then
            v_new_tags := v_atc.tags || coalesce((
              select array_agg(u.t order by u.t)
                from unnest(v_tags) as u(t)
                where not exists (
                  select 1 from unnest(v_atc.tags) as e(t)
                   where lower(btrim(regexp_replace(e.t, '\s+', ' ', 'g'))) = u.t
                )
            ), '{}');
            v_noop := cardinality(v_new_tags) = cardinality(v_atc.tags);
          else
            v_new_tags := coalesce((
              select array_agg(e.t order by e.ord)
                from unnest(v_atc.tags) with ordinality as e(t, ord)
                where lower(btrim(regexp_replace(e.t, '\s+', ' ', 'g'))) <> all (v_tags)
            ), '{}');
            v_noop := cardinality(v_new_tags) = cardinality(v_atc.tags);
          end if;

          if v_noop then
            v_outcome := 'unchanged';
          elsif v_expected is not null and v_expected <> v_atc.version then
            v_outcome := 'refused';
            v_reason := 'stale_version';
          elsif p_field = 'tags' and cardinality(v_new_tags) > 10 then
            v_outcome := 'refused';
            v_reason := 'tags_limit_exceeded';
          else
            if p_field = 'module' then
              select m.path into v_us_path
                from public.user_stories us
                join public.modules m on m.id = us.module_id
                where us.id = v_atc.user_story_id;
              if v_us_path is null
                 or not (v_dest_path = v_us_path or starts_with(v_dest_path, v_us_path || '/')) then
                v_outcome := 'refused';
                v_reason := 'module_outside_story_subtree';
              end if;
            end if;

            if v_outcome is null then
              if not p_dry_run then
                if p_field = 'tags' then
                  update public.atcs
                    set tags = v_new_tags, version = version + 1, updated_at = now()
                    where id = v_atc.id;
                elsif p_field = 'layer' then
                  update public.atcs
                    set layer = v_layer, version = version + 1, updated_at = now()
                    where id = v_atc.id;
                elsif p_field = 'priority' then
                  update public.atcs
                    set priority = v_priority, version = version + 1, updated_at = now()
                    where id = v_atc.id;
                else
                  v_new_slug := v_dest_slug || '/' || regexp_replace(v_atc.slug, '^.*/', '');
                  update public.atcs
                    set module_id = v_dest_id, slug = v_new_slug,
                        version = version + 1, updated_at = now()
                    where id = v_atc.id;
                  v_slug := v_new_slug;
                end if;

                if exists (
                  select 1 from public.bunkai_test_failpoints f
                   where f.name = 'atc_bulk_edit.before_event'
                     and f.workspace_id = v_workspace_id
                ) then
                  raise exception 'test_failpoint' using errcode = 'P0001';
                end if;

                -- The DISTINCT Tests that chain this ATC, in the same transaction
                -- (a Test chaining it at several positions counts once, E13).
                select coalesce(array_agg(distinct ts.test_id), '{}')
                  into v_affected_ids
                  from public.test_steps ts
                  where ts.atc_id = v_atc.id;

                insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
                values (
                  v_workspace_id, p_actor_user_id, 'atc', v_atc.id, 'atc.updated',
                  jsonb_build_object(
                    'title', v_atc.title,
                    'version', v_atc.version + 1,
                    'affected_test_ids', to_jsonb(v_affected_ids),
                    'changed_fields', jsonb_build_array(p_field),
                    'bulk', true
                  )
                );
                v_version := v_atc.version + 1;
              end if;
              v_outcome := 'changed';
            end if;
          end if;
        end if;
      end if;
    exception
      when unique_violation then
        v_outcome := 'refused';
        v_reason := 'slug_conflict';
        v_slug := v_orig_slug;
        v_version := v_orig_version;
      when others then
        v_outcome := 'refused';
        v_reason := 'write_failed';
        v_slug := v_orig_slug;
        v_version := v_orig_version;
    end;

    if v_outcome = 'changed' then
      v_changed := v_changed + 1;
    elsif v_outcome = 'unchanged' then
      v_unchanged := v_unchanged + 1;
    else
      v_refused := v_refused + 1;
    end if;

    v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
      'atc_id', v_row.id,
      'slug', v_slug,
      'title', v_title,
      'outcome', v_outcome,
      'reason', v_reason,
      'version', v_version
    ));
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'field', p_field,
    'requested', v_requested,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'refused', v_refused,
    'outcomes', v_outcomes
  );
end;
$$;

comment on function public.bunkai_bulk_edit_atcs(uuid, uuid, jsonb, text, jsonb, boolean) is
  'BK-507: bulk-edit tags (add|remove), module, layer or priority on up to 200 ATCs of one Project. Per-ATC outcomes, partial success, no-op before stale. ADR-0027. service_role only.';

revoke execute on function public.bunkai_bulk_edit_atcs(uuid, uuid, jsonb, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.bunkai_bulk_edit_atcs(uuid, uuid, jsonb, text, jsonb, boolean)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_bulk_edit_atcs(uuid, uuid, jsonb, text, jsonb, boolean)
      from qa_inspector_ro;
  end if;
end;
$$;
