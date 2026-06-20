-- Migration: 0028 — ATC duplicate RPC (BK-23)
-- Authored: 2026-06-20
--
-- BK-23 ships ATC duplication: deep-copy one existing ATC into a brand-new ATC
-- in the SAME project, carrying over every step + assertion (in order) and the
-- AC bindings, with a fresh slug, version = 1, and an independent set of child
-- rows (no FK link back to the source). Editing the copy never touches the
-- source.
--
-- Like the BK-18 create/update RPCs this is SECURITY DEFINER and takes the
-- resolved actor user id EXPLICITLY (p_actor_user_id) so PAT callers (no
-- auth.uid()) can be authorized, and so the activity_log audit row (no client
-- INSERT policy, 0009) can be written. It reuses the SAME write model as
-- bunkai_create_atc (0021): the auto-minted slug `<module-slug>/atc-<8 hex>`,
-- the `bunkai_assert_actor_can_write_project` authZ guard, the
-- `bunkai_atc_json` return composition, and the `atc.created` event — so the
-- copy is indistinguishable from a normal create to downstream consumers (the
-- BK-20 `atc_search` index needs ZERO changes).
--
-- It does NOT re-run the create-time cross-entity validation (AC-in-US,
-- module-in-subtree): the source ATC already satisfied those invariants when it
-- was created, and module_id / user_story_id / AC bindings are copied verbatim.
-- This is additive — no existing table or RPC is modified.

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
  v_module_slug   text;
  v_module_path   text;
  v_new_title     text;
  v_workspace_id  uuid;
  v_new_atc_id    uuid;
  v_slug          text;
begin
  -- Read the source header. Workspace-scoped via the authZ guard below: a
  -- cross-workspace / archived source surfaces as not_found (P0002).
  select project_id, module_id, user_story_id, title, layer, tags
    into v_project_id, v_module_id, v_user_story_id, v_src_title, v_layer, v_tags
    from public.atcs
    where id = p_source_atc_id and archived_at is null;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  -- AuthZ: explicit actor must be a writer of the project's workspace.
  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

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

  -- Header: a new atcs row, version = 1, same scope as the source.
  insert into public.atcs (project_id, module_id, user_story_id, slug, title, layer, version, tags)
  values (v_project_id, v_module_id, v_user_story_id, v_slug, v_new_title, v_layer, 1, coalesce(v_tags, '{}'))
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

revoke execute on function public.bunkai_duplicate_atc(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_duplicate_atc(uuid, uuid, text) to authenticated, service_role;
