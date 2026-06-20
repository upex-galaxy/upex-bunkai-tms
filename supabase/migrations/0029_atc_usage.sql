-- Migration: 0029 — ATC usage report "used in N tests" RPC (BK-22)
-- Authored: 2026-06-20
--
-- BK-22 ships a read-only "Used in N tests" report for a single ATC: which
-- Tests chain this ATC, and how many. A Test (capital T) is a workspace-scoped
-- container of an ordered chain of ATC references (0024); `test_steps.atc_id`
-- is the relationship this report walks, and `test_steps_atc_id_idx` (0024:72)
-- was built explicitly for this lookup. Consumers: GET /api/v1/atcs/{id}/usage
-- (PAT or cookie) and the ATC editor's "Used by" preview section.
--
-- This migration is ADDITIVE — a single read-only SECURITY DEFINER function. It
-- adds no tables/columns and does NOT touch the 0024 schema, indexes, or RLS.
--
-- AuthZ + isolation (mirrors bunkai_search_atcs, 0027): the report runs for an
-- EXPLICIT actor (PAT callers carry no auth.uid(), so we cannot use the
-- auth.uid()-based bunkai_is_workspace_member helper — we inline the membership
-- predicate against workspace_members keyed on p_actor_user_id, exactly as 0027
-- does). The ATC's workspace is resolved via atcs -> projects -> workspace_id;
-- the actor must be an `active` member of THAT workspace (any role, viewers
-- included — this is a read). A nonexistent ATC, an ATC whose project is in a
-- workspace the actor is not a member of, or an archived ATC all collapse into
-- ONE uniform `not_found` raise (P0002) — no existence leak (INV-3 precedent,
-- 0024:31).
--
-- Usage model (PO-PENDING — see implementation-plan §2 R3 / AC2.2):
--   * count = number of DISTINCT Tests that chain this ATC (PO-suggested model).
--   * one returned row PER TEST; if the same ATC appears at multiple positions
--     in one Test (a chain is a sequence, not a set — 0024:60-68), the row lists
--     ALL those positions, ascending (positions array). This avoids exploding
--     the list into one entry per step while still surfacing multi-position use.
--   * ordered by tests.title ASC. PO-PENDING: the refinement said "order by Test
--     slug", but `tests` has NO slug column (0024:40-49 — only id/title) — we
--     order by and return `title`. Do NOT invent a slug column (impl-plan §5 R1).
--   * Tests are workspace-scoped, so the JOIN is naturally confined to the ATC's
--     own workspace (AC4.1) — a Test in another workspace cannot chain this ATC
--     anyway (the 0024 RLS/RPC containment forbids cross-workspace chaining).
--
-- Zero usage is NOT an error: a valid, reachable ATC with no chaining Tests
-- returns an EMPTY array; the route surfaces 200 { used_in: [] } (AC3.1/3.2).

drop function if exists public.bunkai_atc_usage(uuid, uuid);

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
  -- comes back when the ATC exists, is not archived, and the explicit actor is
  -- an active member of the owning workspace. A miss on ANY of those leaves
  -- v_workspace_id null -> uniform not_found below (no existence disclosure).
  select p.workspace_id
    into v_workspace_id
    from public.atcs a
    join public.projects p on p.id = a.project_id
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where a.id = p_atc_id
      and a.archived_at is null
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
