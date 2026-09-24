-- Migration: 0089 — deny reads and writes on soft-deleted workspaces in the
-- explicit-actor helpers (BK-991, defect of BK-512 / ADR-0015)
-- Authored: 2026-09-24
--
-- ROOT CAUSE. ADR-0015 point 6 (migration 0084) added `deleted_at is null` to
-- the workspaces SELECT policy and the four auth.uid()-keyed helpers in
-- 0005_rls_helpers.sql. Those only guard the cookie-session / RLS path. Every
-- headless route that runs on the admin client instead calls a SECURITY
-- DEFINER RPC that takes the actor EXPLICITLY (p_actor_user_id) and gates it
-- through one of three explicit-actor helpers, or an inline copy of the same
-- predicate. None of them joined `workspaces`, so an ex-member of a
-- soft-deleted workspace kept full read AND write access to its Tests, Runs,
-- ATCs and Environments for the whole 30-day grace window. This is the
-- "DEFINER audit" item ADR-0015's Consequences §2 called out.
--
-- FIX. Each function below is re-created with an IDENTICAL signature, return
-- type, volatility, SECURITY DEFINER, `set search_path = ''`, and IDENTICAL
-- error codes. The only change is that the membership predicate now also
-- requires the owning workspace to be live (`w.deleted_at is null`), exactly
-- the join shape 0084 used for the 0005 helpers. A deleted workspace
-- therefore produces the same refusal the function already gives a caller
-- who is not a member — no new error code, so no new existence signal:
--
--   bunkai_assert_actor_can_read_workspace   (0025)  -> P0002 (404)
--   bunkai_assert_actor_can_write_workspace  (0024)  -> 42501 (as non-member)
--   bunkai_assert_actor_can_write_project    (0021)  -> 42501 (as non-member)
--   bunkai_atc_usage                         (0029)  -> P0002 (404)
--   bunkai_rename_environment                (0063)  -> P0002 (404)
--   bunkai_delete_environment                (0063)  -> P0002 (404)
--   bunkai_search_atcs                       (0087)  -> empty result
--   bunkai_search_tests                      (0081)  -> empty result
--   bunkai_filter_tests_by_tag               (0082)  -> empty result
--   bunkai_notification_digest_candidates    (0078)  -> no digest rows
--
-- The three helpers are called by 22 DEFINER RPCs (latest definitions
-- before this file): Test read/create/reorder/tags, Run create/read/finish/
-- abort/step-mark/history, Bug create/list, ATC get/create/update/duplicate,
-- environment create, and the coverage, defect-heatmap, recovery-cycle,
-- project-runs and story-traceability reports. Fixing the helpers closes all
-- 22 at once.
--
-- The other seven functions never called a helper. Each has its own inline
-- `workspace_members` join, found by auditing every SECURITY DEFINER function
-- whose latest definition joins `workspace_members` and has no `deleted_at`
-- check. atc_usage and the two environment RPCs are three of the four BK-991
-- repro paths. The two search RPCs and tag filter list ATCs/Tests, which
-- AC-07 also requires to be out of reach. The digest feed would keep emailing
-- ex-members about unread notifications, and AC-07 says notifications stop
-- at the same instant. For each of the seven, the body is copied verbatim
-- from its latest definition and only the `workspaces` join plus
-- `deleted_at is null` is added.
--
-- Audited and left unchanged: bunkai_assign_bug (0054) gates through the
-- auth.uid() helpers bunkai_is_workspace_member / bunkai_can_write_workspace,
-- which 0084 already made deleted-aware, and its only inline read is the
-- assignee lookup inside that already-authorized workspace.
-- bunkai_leave_workspace (0044) and bunkai_bugs_check_consistency (0054
-- trigger) expose no entity data.
--
-- `create or replace` preserves each function's existing ACL (including the
-- qa_inspector_* grants from 0085/0086/0088), so nothing is dropped and no
-- BK-884-style regrant is needed. The revoke/grant pairs below are re-emitted
-- verbatim from the original migrations for idempotence only.

-- ---------------------------------------------------------------------------
-- 1. Read helper (0025) — any active role, live workspace only. P0002.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_assert_actor_can_read_workspace(
  p_actor_user_id uuid,
  p_workspace_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      and w.deleted_at is null
  ) then
    -- Non-disclosing: same code a missing Test raises (P0002), never 42501.
    -- A soft-deleted workspace (BK-991) lands here too.
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.bunkai_assert_actor_can_read_workspace(uuid, uuid) from public, anon;
grant execute on function public.bunkai_assert_actor_can_read_workspace(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Write helper (0024) — member+, live workspace only. 42501.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_assert_actor_can_write_workspace(
  p_actor_user_id uuid,
  p_workspace_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      and wm.role in ('member', 'admin', 'owner')
      and w.deleted_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.bunkai_assert_actor_can_write_workspace(uuid, uuid) from public, anon;
grant execute on function public.bunkai_assert_actor_can_write_workspace(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Project write helper (0021) — resolves project -> workspace, member+,
--    live workspace only. P0002 for a missing project, 42501 otherwise.
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
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = v_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      and wm.role in ('member', 'admin', 'owner')
      and w.deleted_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_workspace_id;
end;
$$;

revoke execute on function public.bunkai_assert_actor_can_write_project(uuid, uuid) from public, anon;
grant execute on function public.bunkai_assert_actor_can_write_project(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. bunkai_atc_usage (0029) — body unchanged except the workspaces join in
--    the resolve-and-gate query.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_atc_usage(
  p_actor_user_id uuid,
  p_atc_id        uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_result       jsonb;
begin
  -- Resolve the ATC's workspace AND gate membership in one shot: the row only
  -- comes back when the ATC exists, is not archived, the explicit actor is
  -- an active member of the owning workspace, and that workspace is not
  -- soft-deleted (BK-991). A miss on ANY of those leaves v_workspace_id null
  -- -> uniform not_found below (no existence disclosure).
  select p.workspace_id
    into v_workspace_id
    from public.atcs a
    join public.projects p on p.id = a.project_id
    join public.workspaces w on w.id = p.workspace_id
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where a.id = p_atc_id
      and a.archived_at is null
      and w.deleted_at is null
      and wm.user_id = p_actor_user_id
      and wm.status = 'active';

  if v_workspace_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  -- Distinct Tests that chain this ATC, ordered by title; each row carries the
  -- ascending list of positions the ATC occupies in that Test. The Test's
  -- workspace must equal the ATC's workspace (AC4.1) — redundant with the chain
  -- containment guarantee but asserted explicitly for isolation clarity.
  select coalesce(jsonb_agg(row_json order by sort_title asc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'test_id', t.id,
        'title', t.title,
        'positions', (
          select coalesce(jsonb_agg(ts2.position order by ts2.position), '[]'::jsonb)
            from public.test_steps ts2
            where ts2.test_id = t.id
              and ts2.atc_id = p_atc_id
        )
      ) as row_json,
      t.title as sort_title
    from public.tests t
    where t.workspace_id = v_workspace_id
      and exists (
        select 1 from public.test_steps ts
        where ts.test_id = t.id
          and ts.atc_id = p_atc_id
      )
  ) used;

  return jsonb_build_object('count', jsonb_array_length(v_result), 'used_in', v_result);
end;
$$;

revoke execute on function public.bunkai_atc_usage(uuid, uuid) from public, anon;
grant execute on function public.bunkai_atc_usage(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. bunkai_rename_environment (0063) — body unchanged except the workspaces
--    join in the non-disclosing membership gate.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_rename_environment(
  p_actor_user_id  uuid,
  p_environment_id uuid,
  p_name           text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_name         text;
  v_row          public.project_environments%rowtype;
begin
  -- Resolve the env's project + workspace together. project_environments.project_id
  -- is NOT NULL with an ON DELETE CASCADE FK to projects, so the join can only miss
  -- when the environment row itself does not exist -> NULL -> not_found.
  select pe.project_id, p.workspace_id
    into v_project_id, v_workspace_id
    from public.project_environments pe
    join public.projects p on p.id = pe.project_id
    where pe.id = p_environment_id;

  if v_project_id is null then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- BK-200: non-disclosing 404. A foreign-workspace environment id resolves to a
  -- real project above (this query bypasses RLS as the postgres/DEFINER owner),
  -- so the only way to honor the RPC's own documented contract is to raise the
  -- SAME not_found error for "actor cannot write this workspace" as for a
  -- genuinely missing row. Never 42501/forbidden here — that would re-disclose
  -- existence through the mapped 403. BK-991: a soft-deleted workspace is
  -- treated exactly like one the actor is not a member of.
  if not exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = v_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      and wm.role in ('member', 'admin', 'owner')
      and w.deleted_at is null
  ) then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- Trim + length 1..50 (unchanged from 0032).
  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'environment_name_length' using errcode = '45210';
  end if;

  -- Update (case-insensitive uniqueness enforced by the unique index -> 23505).
  update public.project_environments
    set name = v_name
    where id = p_environment_id
    returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'project_id', v_row.project_id,
    'name', v_row.name,
    'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_rename_environment(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_rename_environment(uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. bunkai_delete_environment (0063) — body unchanged except the workspaces
--    join in the non-disclosing membership gate. The gate runs BEFORE the
--    in-use count, so a deleted workspace now gets 404, not 409 "in use".
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_delete_environment(
  p_actor_user_id  uuid,
  p_environment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_run_count    int;
begin
  select pe.project_id, p.workspace_id
    into v_project_id, v_workspace_id
    from public.project_environments pe
    join public.projects p on p.id = pe.project_id
    where pe.id = p_environment_id;

  if v_project_id is null then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- BK-200: same non-disclosing 404 fix as bunkai_rename_environment above.
  -- BK-991: a soft-deleted workspace is treated as not-a-member.
  if not exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = v_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      and wm.role in ('member', 'admin', 'owner')
      and w.deleted_at is null
  ) then
    raise exception 'environment_not_found' using errcode = 'P0002';
  end if;

  -- Delete-guard: BLOCK when any run references this environment (unchanged from
  -- 0032). Pre-count so the message carries the exact count; row-lock first so a
  -- concurrent run insert + this count serialize against the same row the
  -- delete will target.
  perform 1 from public.project_environments where id = p_environment_id for update;

  select count(*) into v_run_count
    from public.runs
    where environment_id = p_environment_id;
  if v_run_count > 0 then
    raise exception 'environment_in_use: % run(s) reference this environment', v_run_count
      using errcode = '45211';
  end if;

  -- Hard delete (the FK ON DELETE RESTRICT is the backstop -> 23503 if a run
  -- raced in after the count above).
  delete from public.project_environments where id = p_environment_id;

  return jsonb_build_object('deleted', true, 'id', p_environment_id);
end;
$$;

revoke execute on function public.bunkai_delete_environment(uuid, uuid) from public, anon;
grant execute on function public.bunkai_delete_environment(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. bunkai_search_atcs (latest: 0087, 8-arg signature) — body copied from
--    0087 verbatim, including the step-0 actor bind; only the workspaces join
--    and `w.deleted_at is null` are added.
-- ---------------------------------------------------------------------------
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
    join public.workspaces w on w.id = p.workspace_id
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where a.archived_at is null
      and a.tsv @@ v_query
      and a.project_id = p_project_id
      and wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- BK-991: a soft-deleted workspace is out of reach (ADR-0015).
      and w.deleted_at is null
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

revoke execute on function public.bunkai_search_atcs(
  uuid, text, uuid, uuid, text, int, text, text
) from public, anon, authenticated;
grant  execute on function public.bunkai_search_atcs(
  uuid, text, uuid, uuid, text, int, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 8. bunkai_search_tests (latest: 0081) — body copied from 0081 verbatim;
--    only the workspaces join and `w.deleted_at is null` are added.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_search_tests(
  p_actor_user_id uuid,
  p_query         text,
  p_project_id    uuid,
  p_limit         int default 20
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query  text;
  v_limit  int;
  v_result jsonb;
begin
  if auth.uid() is not null and p_actor_user_id <> auth.uid() then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query := btrim(coalesce(p_query, ''));
  if v_query = '' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb)
      ) as row_json,
      t.created_at
    from public.tests t
    join public.workspaces w on w.id = t.workspace_id
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- BK-991: a soft-deleted workspace is out of reach (ADR-0015).
      and w.deleted_at is null
      -- Same ALL-match posture as bunkai_add_tests_to_plan: a Test whose
      -- chain spans two projects is not a member of either search result set
      -- — searching in Project A must not surface a Test that
      -- bunkai_add_tests_to_plan would then reject with 45604.
      and exists (
        select 1 from public.test_steps ts
        where ts.test_id = t.id
      )
      and not exists (
        select 1
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id
          and a.project_id <> p_project_id
      )
      and (
        t.title ilike '%' || v_query || '%'
        or exists (select 1 from unnest(t.tags) as tag where tag ilike '%' || v_query || '%')
      )
    order by t.created_at desc
    limit v_limit
  ) matched;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_search_tests(uuid, text, uuid, int) from public, anon, authenticated;
grant  execute on function public.bunkai_search_tests(uuid, text, uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- 9. bunkai_filter_tests_by_tag (latest: 0082) — body copied from 0082
--    verbatim; only the workspaces join and `w.deleted_at is null` are added.
-- ---------------------------------------------------------------------------
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
    join public.workspaces w on w.id = t.workspace_id
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- BK-991: a soft-deleted workspace is out of reach (ADR-0015).
      and w.deleted_at is null
      and t.tags @> array[v_tag]
    order by t.created_at desc
  ) ranked;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_filter_tests_by_tag(uuid, text) from public, anon, authenticated;
grant  execute on function public.bunkai_filter_tests_by_tag(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. bunkai_notification_digest_candidates (latest: 0078) — the digest cron
--     would otherwise keep emailing ex-members about a soft-deleted
--     workspace's unread notifications during the grace window. Body copied
--     from 0078 verbatim; only the workspaces join is added.
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_notification_digest_candidates()
returns table (
  recipient_user_id uuid,
  recipient_email    text,
  workspace_id       uuid,
  project_id         uuid,
  project_name       text,
  project_slug       text,
  notification_id    uuid,
  event_type         text,
  entity_type        text,
  entity_id          uuid,
  payload            jsonb,
  created_at         timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    n.recipient_user_id,
    u.email,
    n.workspace_id,
    p.id,
    p.name,
    p.slug,
    n.id,
    n.event_type,
    n.entity_type,
    n.entity_id,
    n.payload,
    n.created_at
  from public.notifications n
  join public.workspace_members wm
    on wm.workspace_id = n.workspace_id
   and wm.user_id = n.recipient_user_id
   and wm.status = 'active'
  -- BK-991: no digest for a soft-deleted workspace (AC-07: notifications
  -- stop at the same instant as read access).
  join public.workspaces w
    on w.id = n.workspace_id
   and w.deleted_at is null
  join auth.users u
    on u.id = n.recipient_user_id
   and u.email is not null
  left join public.runs r
    on n.entity_type = 'run' and r.id = n.entity_id
  left join public.bugs b
    on n.entity_type = 'bug' and b.id = n.entity_id
  join public.projects p
    on p.id = coalesce(r.project_id, b.project_id)
  where n.read_at is null
    and n.created_at >= now() - interval '90 days'
    and n.event_type in (
      'run.finished', 'run.aborted',
      'bug.assigned', 'bug.reassigned', 'bug.status_changed'
    )
    and not exists (
      select 1
        from public.notification_preferences np
        where np.user_id = n.recipient_user_id
          and np.channel = 'email'
          and np.enabled = false
          and np.event_type = case
                when n.event_type like 'run.%' then 'run_lifecycle'
                when n.event_type like 'bug.%' then 'bug_lifecycle'
              end
    )
  order by n.recipient_user_id, p.name, n.created_at desc;
$$;

revoke execute on function public.bunkai_notification_digest_candidates() from public;
revoke execute on function public.bunkai_notification_digest_candidates() from anon;
revoke execute on function public.bunkai_notification_digest_candidates() from authenticated;
grant  execute on function public.bunkai_notification_digest_candidates() to service_role;
