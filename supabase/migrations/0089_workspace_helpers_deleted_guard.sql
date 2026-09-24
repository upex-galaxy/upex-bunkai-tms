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
--
-- The three helpers are called by ~47 DEFINER RPCs (Tests, Runs, run steps,
-- run history/reports, Bugs, ATC create/update/duplicate, coverage and
-- traceability reports, export), so fixing them closes all of those at once.
-- atc_usage and the two environment RPCs inline their own membership check
-- (they never called a helper), and they are three of the four repro paths
-- in BK-991, so they are amended here too.
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
