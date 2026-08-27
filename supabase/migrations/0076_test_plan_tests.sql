-- 0076_test_plan_tests.sql — BK-203: TMS-Test Plan | Add and remove tests
-- from a plan
--
-- ADDITIVE ONLY: new table, new indexes, new RLS, new RPCs. Nothing is
-- dropped, renamed or rewritten.
--
-- Membership is a reference, never a copy: a Test may belong to any number of
-- Plans in its project, a Plan holds a given Test at most once, and removing
-- a membership row never touches the Test itself (business-rules.md).
--
-- Shape follows `0073_test_plans.sql` (the sibling container this extends)
-- rather than the Tests domain's own `0024_tests.sql`:
--   1. Both mutating RPCs are SECURITY DEFINER with NO caller-supplied actor
--      parameter — auth.uid() is read internally, same as
--      bunkai_create_test_plan / bunkai_update_test_plan. This is a
--      test_plans-domain write, so it inherits that domain's ADR-0012
--      posture rather than the Tests domain's explicit-actor convention
--      (which exists there because PAT callers hit that domain admin-side).
--   2. NO write policy of any kind on test_plan_tests — SELECT-only RLS, the
--      two DEFINER RPCs are the only path that creates or removes a row.
--      Same reasoning 0073 §2 measured and recorded for test_plans itself:
--      Supabase's default `authenticated` grants make an INSERT/DELETE
--      policy a live second write path, not defense in depth.
--   3. Uniqueness is a DB-level unique index on (test_plan_id, test_id),
--      never an app-level check — the second writer of a duplicate pair gets
--      23505 from Postgres itself (AC 3.2), and the SAME index is the
--      second, independent backstop behind the Idempotency-Key header
--      middleware for a rapid double-submit (AC E3, Dev-answered).
--   4. A Test's "project", for the cross-project isolation gate (AC E2), is
--      derived via `test_steps -> atcs -> projects`, since `public.tests`
--      itself carries no project_id column (Tests are workspace-scoped,
--      BK-27) — same join `bunkai_start_run` (0031_runs.sql) walks, but NOT
--      the same match rule: `bunkai_create_test` (0024) validates a chained
--      ATC only against the Test's WORKSPACE, never against a single
--      project, so one Test's chain can legally span two projects. An
--      ANY-match gate (at least one chained ATC in the plan's project) would
--      let such a Test join plans in BOTH projects at once — a real
--      integrity gap, not merely a hypothetical. Both
--      bunkai_add_tests_to_plan and bunkai_search_tests therefore require
--      the ENTIRE chain to resolve inside the target project: non-empty, and
--      no chained ATC outside it. A test_id that fails this — nonexistent,
--      foreign-workspace, empty-chain, single-foreign-project, or
--      multi-project — collapses into ONE uniform raise with no id echoed
--      back (INV-3 non-disclosure, mirrors `atc_not_in_workspace` in 0024).
--
-- Custom SQLSTATE codes allocated for this migration (456xx block, verified
-- unused: 0073 claims 45600-45603, nothing else in this block exists):
--   45604  test_outside_plan_project    (AC E2 — cross-project / missing / foreign test)
--   45605  test_selection_empty         (add-tests called with zero test ids)
--   45606  test_plan_test_not_found     (remove — the membership row does not exist)
-- Closed-plan rejection (AC E1) reuses 45603 test_plan_not_open (0073) —
-- same code, same message, for both add and remove.
-- Duplicate add (AC 3.2) reuses the native 23505 unique_violation raised by
-- test_plan_tests_plan_test_idx — same convention 0073 uses for plan names.

-- ============================================================================
-- 1. Table
-- ============================================================================

create table if not exists public.test_plan_tests (
  id            uuid primary key default gen_random_uuid(),
  test_plan_id  uuid not null references public.test_plans(id) on delete cascade,
  test_id       uuid not null references public.tests(id) on delete cascade,
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- The core duplicate-prevention constraint (AC 3.1/3.2) and the leading edge
-- for "list a plan's member tests" (test_plan_id-first).
create unique index if not exists test_plan_tests_plan_test_idx
  on public.test_plan_tests (test_plan_id, test_id);

-- Reverse lookup (a future "used by N plans" report, and FK-delete performance).
create index if not exists test_plan_tests_test_id_idx
  on public.test_plan_tests (test_id);

-- ============================================================================
-- 2. RLS — SELECT-only, workspace member via the parent plan (viewers
--    included: seeing membership is role-agnostic, only add/remove is gated).
-- ============================================================================

alter table public.test_plan_tests enable row level security;

drop policy if exists test_plan_tests_select_workspace_member on public.test_plan_tests;
create policy test_plan_tests_select_workspace_member
  on public.test_plan_tests for select
  using (
    exists (
      select 1 from public.test_plans tp
      where tp.id = test_plan_tests.test_plan_id
        and public.bunkai_is_workspace_member(tp.workspace_id)
    )
  );

-- NO INSERT, UPDATE or DELETE policy — see header decision 2. The two
-- DEFINER RPCs below are the only way a row is created or removed.
drop policy if exists test_plan_tests_insert_workspace_role_member_plus on public.test_plan_tests;
drop policy if exists test_plan_tests_update_workspace_role_member_plus on public.test_plan_tests;
drop policy if exists test_plan_tests_delete_workspace_role_member_plus on public.test_plan_tests;

-- ============================================================================
-- 3. bunkai_add_tests_to_plan — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_add_tests_to_plan(
  p_test_plan_id uuid,
  p_test_ids     uuid[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_project_id   uuid;
  v_status       text;
  v_distinct     int;
  v_resolved     int;
  v_added_count  int;
begin
  -- 1. Resolve + lock the plan (serializes against a concurrent Close, same
  --    shape as bunkai_update_test_plan's row lock).
  select workspace_id, project_id, status
    into v_workspace_id, v_project_id, v_status
    from public.test_plans
    where id = p_test_plan_id
    for update;
  if v_workspace_id is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0073 shape): not a member at all -> 404;
  --    member but viewer -> 403.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Membership can only be edited while Open (AC E1).
  if v_status <> 'open' then
    raise exception 'test_plan_not_open' using errcode = '45603';
  end if;

  -- 4. At least one test id (defense in depth — the route's Zod schema
  --    already requires min(1)).
  if coalesce(array_length(p_test_ids, 1), 0) < 1 then
    raise exception 'test_selection_empty' using errcode = '45605';
  end if;

  -- 5. Every distinct submitted id must resolve to a Test in THIS workspace
  --    whose ENTIRE chain resolves inside THIS plan's project (AC E2):
  --    non-empty, and no chained ATC outside v_project_id. ANY-match (at
  --    least one chained ATC in the project) would let a Test whose chain
  --    spans two projects become a member of plans in BOTH — bunkai_create_test
  --    (0024) validates a chained ATC only against the Test's WORKSPACE, not
  --    against a single project, so a multi-project chain is legal and must
  --    be handled here, not assumed away. Nonexistent, foreign-workspace,
  --    empty-chain and cross-project ids all collapse into the SAME raise,
  --    with no id echoed back (INV-3, mirrors 0024's atc_not_in_workspace).
  select count(*) into v_resolved
    from public.tests t
    where t.id = any(p_test_ids)
      and t.workspace_id = v_workspace_id
      and exists (
        select 1 from public.test_steps ts
        where ts.test_id = t.id
      )
      and not exists (
        select 1
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id
          and a.project_id <> v_project_id
      );
  select count(*) into v_distinct
    from (select distinct x from unnest(p_test_ids) as t(x)) d;
  if v_resolved <> v_distinct then
    raise exception 'test_outside_plan_project' using errcode = '45604';
  end if;

  -- 6. Insert every distinct id in one statement. Any (test_plan_id, test_id)
  --    pair that already exists raises 23505 and aborts the WHOLE insert —
  --    the entire batch is rejected, not partially applied (AC 3.2's "no new
  --    row is created", read as all-or-nothing for a multi-select add).
  insert into public.test_plan_tests (test_plan_id, test_id, added_by)
  select p_test_plan_id, x, auth.uid()
  from (select distinct x from unnest(p_test_ids) as t(x)) d;

  get diagnostics v_added_count = row_count;

  -- 7. Audit — one row per call, positive projection (0073's own convention).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'test_plan', p_test_plan_id, 'test_plan.tests_added',
    jsonb_build_object('test_ids', to_jsonb(p_test_ids), 'count', v_added_count)
  );

  return jsonb_build_object(
    'test_plan_id', p_test_plan_id,
    'added_count', v_added_count,
    'member_count', (select count(*) from public.test_plan_tests where test_plan_id = p_test_plan_id)
  );
end;
$$;

revoke execute on function public.bunkai_add_tests_to_plan(uuid, uuid[]) from public, anon;
grant  execute on function public.bunkai_add_tests_to_plan(uuid, uuid[]) to authenticated;

-- ============================================================================
-- 4. bunkai_remove_test_from_plan — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_remove_test_from_plan(
  p_test_plan_id uuid,
  p_test_id      uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status       text;
  v_deleted      int;
begin
  -- 1. Resolve + lock the plan.
  select workspace_id, status
    into v_workspace_id, v_status
    from public.test_plans
    where id = p_test_plan_id
    for update;
  if v_workspace_id is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split, same as add.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Membership can only be edited while Open (AC E1) — identical gate on
  --    remove as on add.
  if v_status <> 'open' then
    raise exception 'test_plan_not_open' using errcode = '45603';
  end if;

  -- 4. Delete. Removing a Test from a Plan never touches the Test itself —
  --    this statement only ever reaches test_plan_tests.
  delete from public.test_plan_tests
    where test_plan_id = p_test_plan_id and test_id = p_test_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'test_plan_test_not_found' using errcode = '45606';
  end if;

  -- 5. Audit.
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'test_plan', p_test_plan_id, 'test_plan.test_removed',
    jsonb_build_object('test_id', p_test_id)
  );

  return jsonb_build_object(
    'test_plan_id', p_test_plan_id,
    'removed_test_id', p_test_id,
    'member_count', (select count(*) from public.test_plan_tests where test_plan_id = p_test_plan_id)
  );
end;
$$;

revoke execute on function public.bunkai_remove_test_from_plan(uuid, uuid) from public, anon;
grant  execute on function public.bunkai_remove_test_from_plan(uuid, uuid) to authenticated;

-- ============================================================================
-- 5. bunkai_search_tests — read-only, EXPLICIT actor (mirrors
--    bunkai_search_atcs/0027 and bunkai_filter_tests_by_tag/0030: search
--    endpoints in this codebase consistently take an explicit actor and run
--    off the admin client, unlike the no-actor test_plans mutation RPCs
--    above). Project-scoped substring match on title and tags — the Tests
--    domain has no tsvector column (0027's full-text index is atcs-only), so
--    this is a plain ILIKE, not ranked full-text search. Any active member
--    (viewers included) may search — this backs a read-only picker.
-- ============================================================================

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
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
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

-- service_role only: the route calls this through createAdminClient() (never
-- the browser client), and p_actor_user_id is caller-supplied — granting to
-- authenticated would let any signed-in user pass someone else's uuid and a
-- foreign project_id to read Tests out of a workspace they are not a member
-- of. The auth.uid() guard above is defense in depth if this is ever called
-- with a user JWT.
revoke execute on function public.bunkai_search_tests(uuid, text, uuid, int) from public, anon, authenticated;
grant  execute on function public.bunkai_search_tests(uuid, text, uuid, int) to service_role;
