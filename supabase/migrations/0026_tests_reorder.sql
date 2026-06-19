-- Migration: 0026 — Test chain reorder (version column + bunkai_reorder_test_steps RPC) (BK-28)
-- Authored: 2026-06-19
--
-- BK-28 ships ATC-chain reorder inside an existing Test: a member rearranges the
-- ordered chain, preserving the EXACT multiset of chained ATCs (no add, no
-- remove — those are BK-27). One server-side rulebook, bunkai_reorder_test_steps,
-- is consumed identically by the headless PATCH /api/v1/tests/{id}/reorder
-- surface and the UI drag-reorder (BK-32 detail page). PAT callers carry no
-- Supabase JWT (auth.uid() is NULL), so the resolved actor arrives EXPLICITLY as
-- p_actor_user_id, per the 0021/0024 precedent. DEFINER is also the only
-- sanctioned write path for the activity_log audit row (no client INSERT policy,
-- 0009).
--
-- The reorder HANDLE is step_id (test_steps.id), NOT atc_id: a chain may legally
-- hold the same atc_id at multiple positions (surrogate PK, no
-- unique(test_id,atc_id) — 0024 Business Rule 5), so atc_id cannot identify a
-- row. step_id is the stable per-row chain handle the read path already exposes
-- (0025:69). The activity_log old_chain/new_chain stay atc_id arrays (the
-- human-meaningful run order).
--
-- Optimistic locking: the tests table gains a `version int` column here (BK-27
-- shipped without it; the BK-28 architect clarification assigns the migration to
-- this Story). The lock token rides X-If-Match (BK-96) at the API layer; the RPC
-- guards version under FOR UPDATE, mirroring bunkai_update_atc (0021).
--
-- Validation order is load-bearing (observable behavior):
--   1. test exists + FOR UPDATE lock                         -> P0002
--   2. write gate (active member/admin/owner)                -> 42501
--   3. chain non-empty                                       -> 45124 chain_invalid
--   4. no duplicate step_ids in the payload                  -> 45124 chain_invalid
--   5. submitted multiset == existing test_steps.id set      -> 45123 chain_mismatch
--   6. If-Match (when supplied) matches current version      -> 45125 version_conflict
--   7. no-op: submitted ordered step_ids == current order
--      -> return current json, NO version bump, NO event,
--         NO updated_at change
--   8. real reorder: two-phase position rewrite (offset then
--      finals — keeps the unique(test_id,position) constraint
--      satisfied without DDL and keeps step_ids stable),
--      version bump, activity_log test.reordered, return json.

-- =============================================================================
-- 1. version column on tests (additive; default 1 — backward-compatible)
-- =============================================================================

alter table public.tests
  add column if not exists version int not null default 1;

-- =============================================================================
-- 2. RLS — defence-in-depth UPDATE policies (member+). The reorder RPC is
--    SECURITY DEFINER and bypasses RLS, but parity with the 0024 INSERT policies
--    keeps a direct PostgREST UPDATE closed to viewers / non-members.
-- =============================================================================

drop policy if exists tests_update_workspace_role_member_plus on public.tests;
create policy tests_update_workspace_role_member_plus
  on public.tests
  for update
  using ( public.bunkai_can_write_workspace(workspace_id) )
  with check ( public.bunkai_can_write_workspace(workspace_id) );

drop policy if exists test_steps_update_workspace_role_member_plus on public.test_steps;
create policy test_steps_update_workspace_role_member_plus
  on public.test_steps
  for update
  using (
    exists (
      select 1 from public.tests t
      where t.id = test_steps.test_id
        and public.bunkai_can_write_workspace(t.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.tests t
      where t.id = test_steps.test_id
        and public.bunkai_can_write_workspace(t.workspace_id)
    )
  );

-- =============================================================================
-- 3. read-path: expose `version` in the composed Test json (additive)
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
-- 4. REORDER: bunkai_reorder_test_steps
-- =============================================================================

create or replace function public.bunkai_reorder_test_steps(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_if_match      int,
  p_step_ids      uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_version      int;
  v_submitted    int;
  v_distinct     int;
  v_existing     int;
  v_matched      int;
  v_current      uuid[];
  v_old_chain    uuid[];
  v_new_chain    uuid[];
begin
  -- 1. Lock the Test header; capture workspace + current version.
  select workspace_id, version
    into v_workspace_id, v_version
    from public.tests
    where id = p_test_id
    for update;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: explicit actor must be a writer of the Test's workspace (viewer
  --    and non-member both hit 42501).
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 3. Chain must be non-empty (defensive twin of the route's Zod .min(1)).
  v_submitted := coalesce(array_length(p_step_ids, 1), 0);
  if v_submitted < 1 then
    raise exception 'chain_invalid' using errcode = '45124';
  end if;

  -- 4. No duplicate step_ids in the payload (a repeat would silently drop a row).
  select count(*) into v_distinct
    from (select distinct x from unnest(p_step_ids) as t(x)) d;
  if v_distinct <> v_submitted then
    raise exception 'chain_invalid' using errcode = '45124';
  end if;

  -- 5. Set equality under the lock: the submitted multiset must equal the Test's
  --    existing step_id set EXACTLY — same length and every id belongs to THIS
  --    Test. (Friendly missing/extra detail is computed in the route.)
  select count(*) into v_existing
    from public.test_steps where test_id = p_test_id;
  select count(*) into v_matched
    from public.test_steps
    where test_id = p_test_id and id = any(p_step_ids);
  if v_existing <> v_submitted or v_matched <> v_submitted then
    raise exception 'chain_mismatch' using errcode = '45123';
  end if;

  -- 6. Optimistic lock: If-Match (when supplied) must match the locked version.
  --    Current version is embedded in the message so the route surfaces it in
  --    the 409 body without a second round-trip.
  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45125';
  end if;

  -- 7. No-op: submitted order identical to the current order -> return current
  --    json with NO version bump, NO event, NO updated_at touch. Covers
  --    same-order submit, single-step Tests, and retry-safe double-click.
  select array_agg(id order by position) into v_current
    from public.test_steps where test_id = p_test_id;
  if v_current = p_step_ids then
    return public.bunkai_test_json(p_test_id);
  end if;

  -- 8. Real reorder. Capture old/new atc_id chains (run order) for the event.
  select array_agg(atc_id order by position) into v_old_chain
    from public.test_steps where test_id = p_test_id;
  select array_agg(ts.atc_id order by v.ord) into v_new_chain
    from unnest(p_step_ids) with ordinality as v(sid, ord)
    join public.test_steps ts on ts.id = v.sid and ts.test_id = p_test_id;

  -- Two-phase position rewrite: park all positions beyond the live range, then
  -- assign 1..n from the submitted order. Avoids transient unique(test_id,
  -- position) collisions without making the constraint deferrable, and keeps
  -- step_ids stable (no delete/reinsert — the UI keys on them).
  update public.test_steps
    set position = position + 1000000
    where test_id = p_test_id;

  update public.test_steps ts
    set position = v.ord::int
    from (select sid, ord from unnest(p_step_ids) with ordinality as u(sid, ord)) v
    where ts.id = v.sid and ts.test_id = p_test_id;

  -- Version bump (updated_at trigger from 0004 fires on this UPDATE).
  update public.tests
    set version = version + 1
    where id = p_test_id;

  -- Event: test.reordered (atomic with the position rewrite).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'test', p_test_id, 'test.reordered',
    jsonb_build_object(
      'version', v_version + 1,
      'old_chain', to_jsonb(v_old_chain),
      'new_chain', to_jsonb(v_new_chain)
    )
  );

  return public.bunkai_test_json(p_test_id);
end;
$$;

revoke execute on function public.bunkai_reorder_test_steps(uuid, uuid, int, uuid[]) from public, anon;
grant execute on function public.bunkai_reorder_test_steps(uuid, uuid, int, uuid[]) to authenticated, service_role;
