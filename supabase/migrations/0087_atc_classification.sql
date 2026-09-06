-- Migration: 0087 — BK-399: ATC classification (test-design technique + priority)
--
-- Adds two OPTIONAL classification columns to public.atcs, following the exact
-- shape of the existing `layer` column (0004_atcs.sql:60): text + a named
-- table-level CHECK. This schema declares zero native enum types across all 86
-- prior migrations; every constrained value is text + CHECK (atcs.layer,
-- atcs.status, bugs.severity 0046:106, workspace_members.role, ...).
--
-- Canonical values are the exact display labels, case-sensitive, per
-- .context/business/domain-glossary.md §2/§3 and the BK-399 PO ruling.
--
-- Pre-existing rows stay NULL BY CONSTRUCTION: `add column` with no default is
-- a metadata-only operation in PG 11+, so there is no table rewrite and no
-- value to backfill. out-of-scope.md forbids defaulting legacy rows to any
-- real value; this satisfies it structurally rather than by policy.
--
-- NO INDEX. `atcs.layer` — the identical-shape optional narrow filtered by the
-- same RPC — has none (0004:70-73 indexes only project_id, module_id,
-- user_story_id, tsv). In bunkai_search_atcs the plan is driven by the GIN tsv
-- index plus project_id, with the result capped at limit <= 50, so these are
-- residual filters over a tiny candidate set. A 5-value / 4-value column has
-- no useful selectivity.
--
-- Constraints are added VALIDATED, not `not valid`. 0058 needed `not valid`
-- because live rows could already violate its new floor; here the columns are
-- created empty in the same migration, so nothing can violate them.
--
-- FUNCTION REWRITES BELOW — READ BEFORE EDITING:
--   * bunkai_create_atc and bunkai_update_atc gain two parameters. Postgres
--     treats a changed parameter list as a DIFFERENT function, so
--     `create or replace` would leave the old signature live and PostgREST's
--     named-argument calls would keep resolving to the stale body. The
--     explicit `drop function` is load-bearing — see 0067's header.
--   * The two new parameters carry `default null` on every widened signature.
--     With the old signature dropped there is no overload to be ambiguous
--     with (the hazard 0067 documents is a SECOND coexisting overload, which
--     cannot occur here), and the default keeps a still-deployed 9-name
--     PostgREST call resolvable while the code half of BK-399 ships. Without
--     it, dropping the 9-arg signature leaves that call with no candidate
--     function and breaks ATC create/edit between this migration and the
--     route deploy. `default null` is also 0067's own idiom (0067:66).
--   * EXECUTE is granted to PUBLIC by default on every newly created function,
--     and anon/authenticated are members of PUBLIC. Every recreate below MUST
--     re-emit its revoke/grant pair. For bunkai_search_atcs the
--     `revoke ... from authenticated` line IS BK-635's fix (0082) — dropping
--     the function without re-emitting it silently reopens that vulnerability.
--   * bunkai_search_atcs's step-0 actor bind (0082) is re-emitted VERBATIM in
--     the widened body, and the two new predicates are narrowing conjuncts
--     inside the SAME where clause — never a post-filter and never a second
--     read of public.atcs (rpc-authorization.md §3).
--   * ADR-0012: the missing actor bind on bunkai_create_atc /
--     bunkai_update_atc / bunkai_duplicate_atc is known debt (BK-249/BK-263)
--     and is deliberately NOT retrofitted here. The closed set of 22 does not
--     grow: each dropped signature and its widened twin are one function.
--   * ADR-0009 §5: only ADDITIVE jsonb keys are added to bunkai_atc_json. No
--     RPC return shape changes, so this is safe to apply against the shared
--     project ahead of the code deploy.

-- ===========================================================================
-- 1. Columns + constraints
-- ===========================================================================

alter table public.atcs add column if not exists technique text;
alter table public.atcs add column if not exists priority  text;

alter table public.atcs
  add constraint atcs_technique_allowed
  check (
    technique is null
    or technique in (
      'Equivalence Partitioning',
      'Boundary Value Analysis',
      'State Transition',
      'Decision Table',
      'Pairwise'
    )
  );

alter table public.atcs
  add constraint atcs_priority_allowed
  check (
    priority is null
    or priority in ('Critical', 'High', 'Medium', 'Low')
  );

comment on column public.atcs.technique is
  'BK-399. Test-design technique that produced this ATC. NULL = not specified; never defaulted.';
comment on column public.atcs.priority is
  'BK-399. ATC Priority (not Bug Severity, not Jira priority). NULL = not specified.';

-- ===========================================================================
-- 2. bunkai_atc_json — signature unchanged, ADDITIVE keys only (ADR-0009 §5)
-- ===========================================================================
-- Body copied from 0021:69-104, plus 'technique' and 'priority' after 'layer'.

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
    'technique', a.technique,
    'priority', a.priority,
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

-- ===========================================================================
-- 3. bunkai_duplicate_atc — signature UNCHANGED (uuid, uuid, text)
-- ===========================================================================
-- Body copied from 0028 (the live definition). The function uses an EXPLICIT
-- column list on both the `select ... into` and the `insert`, so the two new
-- columns must be named in both or a duplicate silently loses the source's
-- classification (business rule 7 / E4). Nothing else changes: slug, version
-- and status are still deliberately NOT copied.

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
begin
  -- Read the source header. Workspace-scoped via the authZ guard below: a
  -- cross-workspace / archived source surfaces as not_found (P0002).
  select project_id, module_id, user_story_id, title, layer, tags, technique, priority
    into v_project_id, v_module_id, v_user_story_id, v_src_title, v_layer, v_tags, v_technique, v_priority
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

revoke execute on function public.bunkai_duplicate_atc(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_duplicate_atc(uuid, uuid, text) to authenticated, service_role;

-- ===========================================================================
-- 4. bunkai_create_atc — WIDENED 9 -> 11 args
-- ===========================================================================
-- Body copied from 0065 (the live definition), changed only by naming
-- technique/priority in the header insert. No new raise: the CHECK constraint
-- above is the guard, and 23514 already maps to validation_failed 422
-- (lib/atcs/errors.ts:17-27).
--
-- ADR-0012: this function is one of the 22 known-unbound DEFINER functions.
-- The actor bind is deliberately NOT retrofitted here.

drop function if exists public.bunkai_create_atc(
  uuid, uuid, uuid, text, text, text[], jsonb, jsonb, uuid[]
);

create or replace function public.bunkai_create_atc(
  p_actor_user_id uuid,
  p_module_id     uuid,
  p_user_story_id uuid,
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
  -- module_id come from the validated user story / candidate module. BK-399 —
  -- technique/priority are written verbatim; NULL means "not specified".
  insert into public.atcs (project_id, module_id, user_story_id, slug, title, layer, version, tags, technique, priority)
  values (v_us_project, p_module_id, p_user_story_id, v_slug, p_title, p_layer, 1, coalesce(p_tags, '{}'), p_technique, p_priority)
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

revoke execute on function public.bunkai_create_atc(
  uuid, uuid, uuid, text, text, text[], jsonb, jsonb, uuid[], text, text
) from public, anon;
grant execute on function public.bunkai_create_atc(
  uuid, uuid, uuid, text, text, text[], jsonb, jsonb, uuid[], text, text
) to authenticated, service_role;

-- ===========================================================================
-- 5. bunkai_update_atc — WIDENED 9 -> 11 args
-- ===========================================================================
-- Body copied from 0065 (the live definition), changed only by adding
-- technique/priority to the header `update ... set` list. version and
-- updated_at therefore bump for a classification-only edit, exactly as for
-- layer/tags (business rule 6). atcs_refresh_tsv fires `of title, tags` only,
-- so tsv is correctly untouched.
--
-- ADR-0012: this function is one of the 22 known-unbound DEFINER functions.
-- The actor bind is deliberately NOT retrofitted here.

drop function if exists public.bunkai_update_atc(
  uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[]
);

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

revoke execute on function public.bunkai_update_atc(
  uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[], text, text
) from public, anon;
grant execute on function public.bunkai_update_atc(
  uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[], text, text
) to authenticated, service_role;

-- ===========================================================================
-- 6. bunkai_search_atcs — WIDENED 6 -> 8 args
-- ===========================================================================
-- Body copied from 0082 (the live definition), INCLUDING the step-0 actor bind
-- verbatim, plus two narrowing conjuncts in the SAME where clause immediately
-- after the existing `and (p_layer is null or a.layer = p_layer)`.

drop function if exists public.bunkai_search_atcs(uuid, text, uuid, uuid, text, int);

create or replace function public.bunkai_search_atcs(
  p_actor_user_id uuid,
  p_query         text,
  p_project_id    uuid,
  p_module_id     uuid    default null,
  p_layer         text    default null,
  p_limit         int     default 20,
  p_technique     text    default null,
  p_priority      text    default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query        tsquery;
  v_module_path  text;
  v_module_proj  uuid;
  v_limit        int;
  v_result       jsonb;
begin
  -- 0. Actor bind (BK-635). A NULL auth.uid() is the trusted server-side rail
  --    (admin client / PAT), for which p_actor_user_id is the only identity
  --    available. A present-but-different uid is a spoof attempt.
  if auth.uid() is not null and p_actor_user_id <> auth.uid() then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;

  -- Defensive clamp (the route validates 1..50 via zod, but the RPC is a public
  -- contract: keep it self-consistent if called directly).
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  -- Build the tsquery with the SAME regconfig as the index (0004 = 'english').
  -- Single token → prefix-aware autocomplete (`tok:*`); multi-word → plainto
  -- (AND semantics, no prefix). A blank/whitespace query produces a NULL
  -- tsquery, which matches nothing — but the route already rejects empty input
  -- with 400 before reaching here (BK-20 AC5).
  if p_query is null or btrim(p_query) = '' then
    return '[]'::jsonb;
  end if;

  if array_length(regexp_split_to_array(btrim(p_query), '\s+'), 1) = 1 then
    -- to_tsquery requires a sanitized lexeme; strip tsquery operator chars so
    -- raw user input can never form a malformed query, then append `:*`.
    v_query := to_tsquery('english', regexp_replace(btrim(p_query), '[:&|!()<>*]', '', 'g') || ':*');
  else
    v_query := plainto_tsquery('english', p_query);
  end if;

  if v_query is null then
    return '[]'::jsonb;
  end if;

  -- Resolve the module subtree filter (when provided) to a path prefix. A
  -- non-existent / cross-workspace module_id leaves v_module_path null → the
  -- predicate below excludes everything → empty result (BK-20 AC3.2).
  if p_module_id is not null then
    select m.path, m.project_id
      into v_module_path, v_module_proj
      from public.modules m
      where m.id = p_module_id and m.archived_at is null;
  end if;

  select coalesce(jsonb_agg(row_json order by rank desc, updated_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id', a.id,
        'slug', a.slug,
        'title', a.title,
        'layer', a.layer,
        'status', a.status,
        'module_path', m.path
      ) as row_json,
      ts_rank(a.tsv, v_query)
        * exp(-greatest(0, extract(epoch from (now() - a.updated_at))) / 604800.0) as rank,
      a.updated_at
    from public.atcs a
    join public.modules m on m.id = a.module_id
    join public.projects p on p.id = a.project_id
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where a.archived_at is null
      and a.tsv @@ v_query
      and a.project_id = p_project_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- Module subtree: the module itself or any descendant in the same project.
      and (
        p_module_id is null
        or (
          v_module_path is not null
          and m.project_id = v_module_proj
          and (m.path = v_module_path or m.path like v_module_path || '/%')
        )
      )
      -- Optional layer narrow (BK-20 SG4).
      and (p_layer is null or a.layer = p_layer)
      -- Optional classification narrows (BK-399). Narrowing conjuncts in the
      -- SAME where clause as the membership scope — they can only shrink an
      -- already-authorized result set, never widen it.
      and (p_technique is null or a.technique = p_technique)
      and (p_priority  is null or a.priority  = p_priority)
    order by rank desc, a.updated_at desc
    limit v_limit
  ) ranked;

  return v_result;
end;
$$;

-- service_role only. This function takes a caller-supplied p_actor_user_id and
-- is SECURITY DEFINER, so an `authenticated` grant lets any signed-in user name
-- someone else as the actor and read across a workspace boundary. Its only real
-- caller goes through createAdminClient(). Re-emitted for the NEW signature —
-- this IS BK-635's fix (0082), not boilerplate: a `drop function` discards the
-- old signature's grants, and Postgres grants EXECUTE to PUBLIC by default on
-- every newly created function.
revoke execute on function public.bunkai_search_atcs(
  uuid, text, uuid, uuid, text, int, text, text
) from public, anon, authenticated;
grant  execute on function public.bunkai_search_atcs(
  uuid, text, uuid, uuid, text, int, text, text
) to service_role;
