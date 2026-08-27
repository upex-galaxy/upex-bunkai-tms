-- 0082_bk635_search_rpc_actor_bind_and_grant_revoke.sql — BK-635.
--
-- Two SECURITY DEFINER search RPCs shipped with a caller-supplied
-- p_actor_user_id that is never compared to auth.uid(), AND an EXECUTE grant
-- to `authenticated`:
--
--   * public.bunkai_search_atcs(uuid, text, uuid, uuid, text, int) — 0027:145
--   * public.bunkai_filter_tests_by_tag(uuid, text)                 — 0030:326
--
-- Because they are DEFINER, RLS on `atcs` / `tests` never applies inside them
-- (FORCE ROW LEVEL SECURITY appears nowhere in this schema — ADR-0012), so the
-- `join workspace_members wm ... where wm.user_id = p_actor_user_id` clause is
-- a SELECTION FILTER keyed on a value the caller chose, not an authorization
-- check. lib/supabase/client.ts:19 hands every signed-in user a role=authenticated
-- JWT, so anyone could POST /rest/v1/rpc/<fn> with another member's uuid and read
-- ATC and Test metadata out of workspaces they are not a member of.
--
-- This is the SAME defect and the SAME two-part fix that 0081 applied to
-- bunkai_search_tests for BK-203; 0081's header names these two functions as
-- BK-635 explicitly. Nothing new is being decided here — the posture was
-- ratified in ADR-0012 and the shape is copied verbatim from 0081.
--
--   1. Revoke `authenticated` (and re-assert public/anon), leaving service_role
--      as the only grantee. Neither function is reached from a session client:
--      app/api/v1/atcs/search/route.ts and app/api/v1/tests/route.ts both go
--      through createAdminClient().
--   2. Add the actor bind at STEP 0 of each body, before any table read, as
--      defense in depth for any future caller that arrives with a user JWT.
--
-- `auth.uid() is not null` is LOAD-BEARING and must not be dropped: the whole
-- reason p_actor_user_id exists is that PAT callers carry no auth.uid()
-- (0027's own header says so). Removing the precondition would break the PAT
-- rail. auth.uid() is schema-qualified, so `set search_path = ''` is fine.
--
-- Function bodies below are otherwise byte-identical to the live definitions;
-- signatures and return shapes are unchanged. Per ADR-0012 this shrinks the
-- closed set of unbound DEFINER functions by two — it is not a retrofit
-- campaign, and BK-249 / BK-263 still own the remainder.
--
-- Regression guard: lib/atcs/search-rpc-grant-isolation.test.ts.

create or replace function public.bunkai_search_atcs(
  p_actor_user_id uuid,
  p_query         text,
  p_project_id    uuid,
  p_module_id     uuid    default null,
  p_layer         text    default null,
  p_limit         int     default 20
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
    order by rank desc, a.updated_at desc
    limit v_limit
  ) ranked;

  return v_result;
end;
$$;

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
  -- 0. Actor bind (BK-635). Same contract as bunkai_search_atcs above: NULL
  --    auth.uid() is the trusted server-side rail (admin client / PAT); a
  --    present-but-different uid is a spoof attempt.
  if auth.uid() is not null and p_actor_user_id <> auth.uid() then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;

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

-- service_role only. Both functions take a caller-supplied p_actor_user_id and
-- are SECURITY DEFINER, so an `authenticated` grant lets any signed-in user
-- name someone else as the actor and read across a workspace boundary. Their
-- only real callers go through createAdminClient(). The binds above are
-- defense in depth if either is ever reached with a user JWT.
revoke execute on function public.bunkai_search_atcs(uuid, text, uuid, uuid, text, int) from public, anon, authenticated;
grant  execute on function public.bunkai_search_atcs(uuid, text, uuid, uuid, text, int) to service_role;

revoke execute on function public.bunkai_filter_tests_by_tag(uuid, text) from public, anon, authenticated;
grant  execute on function public.bunkai_filter_tests_by_tag(uuid, text) to service_role;
