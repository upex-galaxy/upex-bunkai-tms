-- Migration: 0024 — Tests (tests, test_steps) + bunkai_create_test RPC (BK-27)
-- Authored: 2026-06-12
--
-- BK-27 ships Test creation: a Test (capital T) is a named container owning an
-- ordered CHAIN of ATC references — references, never copies (snapshots belong
-- to Runs). Tests are workspace-scoped (unlike project-scoped atcs) and bind to
-- exactly one workspace at save-commit time.
--
--   tests       : header — workspace_id, trimmed 1–200 char title, created_by.
--   test_steps  : the chain. Surrogate uuid PK because the SAME atc_id may
--     appear at multiple positions (a chain is a sequence, not a set) — so
--     there is deliberately NO unique(test_id, atc_id). Order is held by
--     position (>= 1, unique per test). test_id CASCADEs with its Test;
--     atc_id is ON DELETE RESTRICT so deleting a chained ATC fails loudly
--     (matches the atcs.user_story_id precedent, 0004).
--
-- One server-side rulebook: bunkai_create_test is a SECURITY DEFINER RPC
-- consumed identically by the UI builder and the headless POST /api/v1/tests
-- surface (PAT callers carry no Supabase JWT, so auth.uid() is NULL — the
-- resolved actor arrives EXPLICITLY as p_actor_user_id, per the 0021
-- bunkai_create_atc precedent). DEFINER is also the only sanctioned write path
-- for the activity_log audit row (no client INSERT policy, 0009).
--
-- Validation order is load-bearing (observable behavior):
--   1. role gate (active member/admin/owner)            -> 42501
--   2. title: trim, then 1–200 chars                    -> 45121
--   3. chain must contain >= 1 ATC                      -> 45120
--   4. every distinct ATC id must resolve inside the
--      target workspace; foreign-workspace, nonexistent
--      and NULL ids collapse into ONE uniform raise
--      that echoes NO ids (INV-3 non-disclosure)        -> 45122
--   5. insert tests row, then test_steps at positions 1..n in array order
--      (duplicates preserved verbatim), then the activity_log row, then
--      return the composed json — all in one transaction (plpgsql body).

-- =============================================================================
-- 1. tables + indexes
-- =============================================================================

create table if not exists public.tests (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  -- Defence-in-depth twin of the RPC's 45121 rule: untrimmed, whitespace-only
  -- and >200 titles are unstorable even via a direct (RLS-passing) insert.
  title         text not null check (title = btrim(title) and char_length(title) between 1 and 200),
  created_by    uuid not null references auth.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tests_workspace_id_idx on public.tests (workspace_id);

-- updated_at trigger (function from 0004)
drop trigger if exists tests_set_updated_at on public.tests;
create trigger tests_set_updated_at
  before update on public.tests
  for each row
  execute function public.bunkai_set_updated_at();

create table if not exists public.test_steps (
  -- Surrogate PK: duplicates of the same atc_id in one chain are legal
  -- (Business Rule 5) — order alone distinguishes them.
  id        uuid primary key default gen_random_uuid(),
  test_id   uuid not null references public.tests(id) on delete cascade,
  atc_id    uuid not null references public.atcs(id) on delete restrict,
  position  int not null check (position >= 1),
  unique (test_id, position)
);

-- RESTRICT enforcement + future BK-22 "used by N tests" report. test_id
-- lookups are covered by the unique(test_id, position) index.
create index if not exists test_steps_atc_id_idx on public.test_steps (atc_id);

-- =============================================================================
-- 2. RLS — defence-in-depth even though writes go through the RPC
-- =============================================================================

alter table public.tests enable row level security;

-- SELECT: active member of the owning workspace (helpers from 0005).
drop policy if exists tests_select_workspace_member on public.tests;
create policy tests_select_workspace_member
  on public.tests
  for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

-- INSERT: role >= member.
drop policy if exists tests_insert_workspace_role_member_plus on public.tests;
create policy tests_insert_workspace_role_member_plus
  on public.tests
  for insert
  with check ( public.bunkai_can_write_workspace(workspace_id) );

-- No client UPDATE/DELETE policies — BK-27 is create-only (edit/reorder are
-- BK-28+); default-deny keeps those surfaces closed until their stories ship.

alter table public.test_steps enable row level security;

-- SELECT: workspace resolved through the parent Test.
drop policy if exists test_steps_select_workspace_member on public.test_steps;
create policy test_steps_select_workspace_member
  on public.test_steps
  for select
  using (
    exists (
      select 1 from public.tests t
      where t.id = test_steps.test_id
        and public.bunkai_is_workspace_member(t.workspace_id)
    )
  );

-- INSERT: role >= member on the parent Test's workspace, AND the chained
-- atc_id must resolve to a non-archived ATC inside that SAME workspace —
-- mirrors the RPC's 45122 containment so a direct PostgREST insert cannot
-- cross-link a foreign workspace's ATC (INV-3 holds at the RLS layer too,
-- not only inside bunkai_create_test).
drop policy if exists test_steps_insert_workspace_role_member_plus on public.test_steps;
create policy test_steps_insert_workspace_role_member_plus
  on public.test_steps
  for insert
  with check (
    exists (
      select 1
      from public.tests t
      join public.atcs a on a.id = test_steps.atc_id
      join public.projects p on p.id = a.project_id
      where t.id = test_steps.test_id
        and p.workspace_id = t.workspace_id
        and a.archived_at is null
        and public.bunkai_can_write_workspace(t.workspace_id)
    )
  );

-- =============================================================================
-- 3. helper + RPC + grants
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: assert an explicit actor can write a workspace. Mirrors
-- bunkai_assert_actor_can_write_project (0021) minus the project hop — Tests
-- are workspace-scoped, so the workspace id is already in hand. SECURITY
-- DEFINER so the membership lookup is not itself subject to RLS. An unknown
-- workspace id falls through the same 42501 as a non-member (no existence
-- disclosure).
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
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_actor_user_id
      and status = 'active'
      and role in ('member', 'admin', 'owner')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.bunkai_assert_actor_can_write_workspace(uuid, uuid) from public, anon;
grant execute on function public.bunkai_assert_actor_can_write_workspace(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CREATE: bunkai_create_test
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_create_test(
  p_actor_user_id uuid,
  p_workspace_id  uuid,
  p_title         text,
  p_atc_ids       uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title        text;
  v_resolved     int;
  v_distinct     int;
  v_test_id      uuid;
  v_created_at   timestamptz;
  v_atc_id       uuid;
  v_position     int;
begin
  -- 1. AuthZ: explicit actor must be a writer of the target workspace (E1).
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, p_workspace_id);

  -- 2. Title: trim, then validate 1–200 ("  Cart  " -> valid "Cart").
  v_title := btrim(p_title);
  if v_title is null or char_length(v_title) not between 1 and 200 then
    raise exception 'title_invalid' using errcode = '45121';
  end if;

  -- 3. Chain: at least one ATC — checked BEFORE any ATC resolution (TC-08).
  if coalesce(array_length(p_atc_ids, 1), 0) < 1 then
    raise exception 'chain_empty' using errcode = '45120';
  end if;

  -- 4. ATC resolution: every distinct id must be a non-archived ATC inside the
  -- target workspace (atcs -> projects -> workspace_id). Foreign-workspace and
  -- nonexistent ids produce the IDENTICAL raise, with no id echoed back
  -- (INV-3 non-disclosure). No hard chain-length cap server-side (Decision 9).
  select count(*) into v_resolved
    from public.atcs a
    join public.projects p on p.id = a.project_id
    where a.id = any(p_atc_ids)
      and p.workspace_id = p_workspace_id
      and a.archived_at is null;
  -- count(*) over SELECT DISTINCT (unlike count(distinct x)) counts a NULL
  -- element as one distinct value, so NULL ids hit the same uniform 45122
  -- below instead of surfacing a later not-null violation (23502).
  select count(*) into v_distinct
    from (select distinct x from unnest(p_atc_ids) as t(x)) d;
  if v_resolved <> v_distinct then
    raise exception 'atc_not_in_workspace' using errcode = '45122';
  end if;

  -- 5. Header — the Test binds to p_workspace_id at this instant (E2).
  insert into public.tests (workspace_id, title, created_by)
  values (p_workspace_id, v_title, p_actor_user_id)
  returning id, created_at into v_test_id, v_created_at;

  -- Chain: positions 1..n follow p_atc_ids array order verbatim — duplicates
  -- of the same ATC land at distinct positions (Business Rules 4–5).
  v_position := 1;
  foreach v_atc_id in array p_atc_ids loop
    insert into public.test_steps (test_id, atc_id, position)
    values (v_test_id, v_atc_id, v_position);
    v_position := v_position + 1;
  end loop;

  -- Event: test.created (atomic with the inserts — 0021/0023 precedent).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    p_workspace_id, p_actor_user_id, 'test', v_test_id, 'test.created',
    jsonb_build_object('title', v_title, 'atc_count', array_length(p_atc_ids, 1))
  );

  -- Composed response: header + ordered chain.
  return jsonb_build_object(
    'id', v_test_id,
    'workspace_id', p_workspace_id,
    'title', v_title,
    'created_by', p_actor_user_id,
    'created_at', v_created_at,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('position', s.position, 'atc_id', s.atc_id)
                       order by s.position)
        from public.test_steps s where s.test_id = v_test_id), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.bunkai_create_test(uuid, uuid, text, uuid[]) from public, anon;
grant execute on function public.bunkai_create_test(uuid, uuid, text, uuid[]) to authenticated, service_role;
