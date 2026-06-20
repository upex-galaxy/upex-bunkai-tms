-- Migration: 0030 — Test tags (tags text[] column + set/normalize/filter RPCs) (BK-33)
-- Authored: 2026-06-20
--
-- BK-33 ships tag assignment + tag-filtering for Tests: a workspace writer
-- assigns / replaces / clears the tag set on a Test (reserved suite tags
-- `smoke` `sanity` `regression` plus free-text custom tags), and any member
-- filters the workspace's Tests by a single tag. This mirrors `atcs.tags`
-- (0004) for storage and the BK-28 reorder rulebook line-for-line for the
-- optimistic-lock write path — no new patterns are invented.
--
-- Storage decision (TD-1): a `tags text[] not null default '{}'` column on
-- `public.tests`, replaced atomically by a SECURITY DEFINER RPC under the
-- existing `version` lock — NOT a tags table. Tags are values on the Test
-- (no registry/colors/ownership in MVP), replacement semantics map cleanly to
-- overwriting an array column, and single-tag filtering is a GIN `@>`
-- containment with no join. Mirrors `atcs.tags` exactly.
--
-- Casing rule (PO-flagged, comments.md:123): RESERVED tags (smoke/sanity/
-- regression) are lowercased; CUSTOM tags preserve the user's casing. Dedupe
-- happens AFTER normalization (so `Smoke` and `smoke` collapse to one).
--
-- Write path (bunkai_set_test_tags) is PUT/replace-whole-set, validation order
-- load-bearing and observable, identical in shape to bunkai_reorder_test_steps:
--   1. test exists + FOR UPDATE lock                         -> P0002
--   2. write gate (active member/admin/owner)                -> 42501
--   3. normalize + validate (count <=20, len <=50, no comma) -> 45126 tags_invalid
--   4. If-Match (when supplied) matches current version      -> 45125 version_conflict
--   5. no-op (normalized set == current set)                 -> return current json,
--      NO version bump, NO event, NO updated_at touch
--   6. real change: update tags + version bump, activity_log
--      `test.tags_changed` (old_tags/new_tags), return json.
--
-- Filter path (bunkai_filter_tests_by_tag) is a workspace-scoped, read-only
-- SECURITY DEFINER RPC restricted to the actor's active memberships (any active
-- role, viewers included — mirrors bunkai_search_atcs). A `tags @> array[$tag]`
-- GIN containment; an unused tag yields `[]`, never a leak, never a 404.
--
-- All functions are additive (create or replace), schema-qualified
-- (search_path = ''), and follow the 0024/0026/0027 grant/revoke pattern.

-- =============================================================================
-- 1. tags column on tests (additive; default '{}' — backward-compatible)
-- =============================================================================

alter table public.tests
  add column if not exists tags text[] not null default '{}';

-- Backs the single-tag containment filter (bunkai_filter_tests_by_tag).
create index if not exists tests_tags_gin_idx on public.tests using gin (tags);

-- Defence-in-depth shape validator. A CHECK constraint cannot itself contain a
-- subquery (`unnest`/`not exists`), so the per-element rules live in an
-- IMMUTABLE scalar helper the CHECK references. Twin of the RPC's shape rules
-- (like the title CHECK on tests): every element trimmed + non-empty, <= 50
-- chars, comma-free, and at most 20 elements. Reserved-lowercasing and dedupe
-- stay RPC-only (a CHECK cannot express them).
create or replace function public.bunkai_test_tags_shape_ok(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tags is null
    or (
      coalesce(array_length(p_tags, 1), 0) <= 20
      and not exists (
        select 1 from unnest(p_tags) as e(val)
        where val is null
          or val <> btrim(val)
          or char_length(val) > 50
          or char_length(btrim(val)) = 0
          or position(',' in val) > 0
      )
    );
$$;

revoke execute on function public.bunkai_test_tags_shape_ok(text[]) from public, anon;
grant execute on function public.bunkai_test_tags_shape_ok(text[]) to authenticated, service_role;

-- Guarded so re-applying the migration is idempotent.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tests_tags_valid'
  ) then
    alter table public.tests
      add constraint tests_tags_valid check (public.bunkai_test_tags_shape_ok(tags));
  end if;
end;
$$;

-- =============================================================================
-- 2. Normalization helper — pure, shared by the set RPC. Trim each element,
--    drop empties, lowercase ONLY the reserved suite tags, dedupe AFTER
--    normalization (first occurrence wins, preserving order). language sql /
--    immutable so it inlines and can be reasoned about in isolation.
-- =============================================================================

create or replace function public.bunkai_normalize_test_tags(p_tags text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(norm order by ord),
    '{}'::text[]
  )
  from (
    select norm, min(ord) as ord
    from (
      select
        case
          when lower(btrim(t.val)) in ('smoke', 'sanity', 'regression')
            then lower(btrim(t.val))
          else btrim(t.val)
        end as norm,
        t.ord
      from unnest(coalesce(p_tags, '{}'::text[])) with ordinality as t(val, ord)
      where btrim(t.val) <> ''
    ) trimmed
    group by norm
  ) deduped;
$$;

revoke execute on function public.bunkai_normalize_test_tags(text[]) from public, anon;
grant execute on function public.bunkai_normalize_test_tags(text[]) to authenticated, service_role;

-- =============================================================================
-- 3. read-path: expose `tags` in the composed Test json (additive). One edit
--    surfaces tags on the detail page, the reorder response, and the API GET.
-- =============================================================================

create or replace function public.bunkai_test_json(p_test_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'workspace_id', t.workspace_id,
    'title', t.title,
    'version', t.version,
    'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb),
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'atc_count', (select count(*) from public.test_steps ts where ts.test_id = t.id),
    'atcs', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'position', ts.position,
                 'step_id', ts.id,
                 'id', a.id,
                 'slug', a.slug,
                 'title', a.title,
                 'layer', a.layer,
                 'status', a.status,
                 'steps', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', s.id, 'position', s.position, 'content', s.content,
                            'input_data', s.input_data, 'expected', s.expected) order by s.position)
                     from public.atc_steps s where s.atc_id = a.id), '[]'::jsonb),
                 'assertions', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', x.id, 'position', x.position, 'content', x.content) order by x.position)
                     from public.atc_assertions x where x.atc_id = a.id), '[]'::jsonb)
               ) order by ts.position)
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id), '[]'::jsonb)
  )
  from public.tests t
  where t.id = p_test_id;
$$;

revoke execute on function public.bunkai_test_json(uuid) from public, anon;
grant execute on function public.bunkai_test_json(uuid) to authenticated, service_role;

-- =============================================================================
-- 4. SET TAGS (replace-whole-set under the optimistic lock):
--    bunkai_set_test_tags. Shape mirrors bunkai_reorder_test_steps (0026).
-- =============================================================================

create or replace function public.bunkai_set_test_tags(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_if_match      int,
  p_tags          text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_version      int;
  v_current      text[];
  v_norm         text[];
  v_count        int;
begin
  -- 1. Lock the Test header; capture workspace + current version + tags.
  select workspace_id, version, tags
    into v_workspace_id, v_version, v_current
    from public.tests
    where id = p_test_id
    for update;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: explicit actor must be a writer of the Test's workspace (viewer
  --    and non-member both hit 42501).
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 3. Normalize (trim, reserved-lowercase, dedupe) then validate the SHAPE:
  --    at most 20 tags, each <= 50 chars, comma-free. A comma or over-length
  --    element raises tags_invalid (45126); the route surfaces it as a 422.
  v_norm := public.bunkai_normalize_test_tags(p_tags);
  v_count := coalesce(array_length(v_norm, 1), 0);
  if v_count > 20 then
    raise exception 'tags_invalid' using errcode = '45126';
  end if;
  if exists (
    select 1 from unnest(v_norm) as e(val)
    where char_length(val) > 50 or position(',' in val) > 0
  ) then
    raise exception 'tags_invalid' using errcode = '45126';
  end if;

  -- 4. Optimistic lock: If-Match (when supplied) must match the locked version.
  --    Current version is embedded in the message so the route surfaces it in
  --    the 409 body without a second round-trip (identical to reorder).
  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45125';
  end if;

  -- 5. No-op: the normalized set equals the current set (order-insensitive) ->
  --    return current json with NO version bump, NO event, NO updated_at touch.
  --    Tags are a set, so compare as sorted arrays (the column preserves insert
  --    order but two equal sets in different orders are still a no-op).
  if (select array_agg(x order by x) from unnest(coalesce(v_current, '{}'::text[])) as t(x))
     is not distinct from
     (select array_agg(x order by x) from unnest(v_norm) as t(x)) then
    return public.bunkai_test_json(p_test_id);
  end if;

  -- 6. Real change. Write the normalized set, bump version (updated_at trigger
  --    from 0004 fires on this UPDATE), and emit the audit event.
  update public.tests
    set tags = v_norm, version = version + 1
    where id = p_test_id;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'test', p_test_id, 'test.tags_changed',
    jsonb_build_object(
      'version', v_version + 1,
      'old_tags', to_jsonb(coalesce(v_current, '{}'::text[])),
      'new_tags', to_jsonb(v_norm)
    )
  );

  return public.bunkai_test_json(p_test_id);
end;
$$;

revoke execute on function public.bunkai_set_test_tags(uuid, uuid, int, text[]) from public, anon;
grant execute on function public.bunkai_set_test_tags(uuid, uuid, int, text[]) to authenticated, service_role;

-- =============================================================================
-- 5. FILTER (workspace-scoped, read-only): bunkai_filter_tests_by_tag.
--    Restricts to Tests in workspaces where p_actor_user_id is an ACTIVE member
--    (any role, viewers included — mirrors bunkai_search_atcs). A single-tag
--    `@>` containment over the GIN index. An unused tag returns '[]'; a foreign
--    workspace simply never matches (no leak, no 404). The returned rows mirror
--    the explorer's flat Tests list (id/title/tags/step_count).
-- =============================================================================

create or replace function public.bunkai_filter_tests_by_tag(
  p_actor_user_id uuid,
  p_tag           text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tag    text;
  v_result jsonb;
begin
  -- Normalize the lookup tag the SAME way stored tags are normalized, so a
  -- caller passing `Smoke` matches the stored `smoke` (reserved-lowercase).
  v_tag := (public.bunkai_normalize_test_tags(array[coalesce(p_tag, '')]))[1];
  if v_tag is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb),
        'step_count', (select count(*) from public.test_steps ts where ts.test_id = t.id)
      ) as row_json,
      t.created_at
    from public.tests t
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
      and t.tags @> array[v_tag]
    order by t.created_at desc
  ) ranked;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_filter_tests_by_tag(uuid, text) from public, anon;
grant execute on function public.bunkai_filter_tests_by_tag(uuid, text) to authenticated, service_role;
