-- Migration: 0025 — Test read path (expanded Test detail view) (BK-32)
-- Authored: 2026-06-19
--
-- BK-32 ships the read-only expanded Test view: open a Test and see its header
-- plus the ordered chain of ATC references, each ATC expanded inline with its
-- ordered steps and ordered assertions, in ONE round trip. References, never
-- copies — content is read LIVE from atcs/atc_steps/atc_assertions at request
-- time (snapshots belong to Runs, not to this definition view).
--
-- One server-side read rulebook: bunkai_get_test_expanded is a SECURITY DEFINER
-- RPC consumed identically by the headless GET /api/v1/tests/{id} surface and
-- the UI detail page. Route handlers run on the admin client (auth.uid() is
-- NULL), so the BK-27/BK-04 RLS SELECT policies — all keyed on
-- bunkai_is_workspace_member -> auth.uid() — return zero rows there. The DEFINER
-- RPC takes the resolved actor EXPLICITLY as p_actor_user_id and re-checks
-- READ-level membership in-band (mirrors the bunkai_get_atc precedent, 0021:366).
--
-- Read-level membership is DELIBERATELY broader than write: any ACTIVE member
-- (incl. role 'viewer') may read. The existing write asserts
-- (bunkai_assert_actor_can_write_workspace, 0024) gate role in
-- (member,admin,owner) and would wrongly deny viewers — hence a new read helper.
--
-- Non-disclosure (INV-3): a missing Test, a foreign-workspace Test, and a
-- non-member actor ALL collapse into the same P0002 raise — never 403 — so a
-- caller cannot distinguish "exists but forbidden" from "does not exist".
--
-- All functions are additive (create or replace), read-only, schema-qualified
-- (search_path = ''), and follow the 0021/0024 grant/revoke pattern. No table,
-- column, policy, or data change.

-- ---------------------------------------------------------------------------
-- Helper: assert an explicit actor can READ a workspace. Unlike the write
-- asserts, ANY active membership role passes (viewer included). Raises P0002
-- (NOT 42501) on failure so non-membership is indistinguishable from a
-- nonexistent Test. SECURITY DEFINER so the membership lookup is not itself
-- subject to RLS.
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
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_actor_user_id
      and status = 'active'
  ) then
    -- Non-disclosing: same code a missing Test raises (P0002), never 42501.
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.bunkai_assert_actor_can_read_workspace(uuid, uuid) from public, anon;
grant execute on function public.bunkai_assert_actor_can_read_workspace(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helper: compose the full expanded-Test response json — header + ordered
-- chain; each chain item carries the LIVE atc header + ordered steps + ordered
-- assertions. Sibling of bunkai_atc_json (0021:69). Ordering is load-bearing:
-- the outer chain is ordered by test_steps.position, children by their own
-- position. step_id (= test_steps.id) is the stable per-row chain handle (React
-- key here; the reorder handle BK-28 will need). language sql / stable.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- READ (membership-gated): bunkai_get_test_expanded. Validation order is
-- load-bearing and observable: existence probe -> read-membership re-check ->
-- compose. Foreign-workspace and nonexistent collapse into the same P0002
-- (the membership check fails identically whether the Test is foreign or the
-- id is random — no existence leak). Mirrors bunkai_get_atc (0021:366).
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_get_test_expanded(
  p_actor_user_id uuid,
  p_test_id       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);
  return public.bunkai_test_json(p_test_id);
end;
$$;

revoke execute on function public.bunkai_get_test_expanded(uuid, uuid) from public, anon;
grant execute on function public.bunkai_get_test_expanded(uuid, uuid) to authenticated, service_role;
