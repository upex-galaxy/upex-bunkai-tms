-- Migration: 0072 — BK-229: Billing | View my workspace plan, seats, and
-- usage
-- Authored: 2026-08-16
--
-- ADDITIVE ONLY: adds one new function. No table, no RLS policy, no seed
-- data. Ruled by Jira comments 12414 (TQ2, authorization — still binding),
-- 12417 (AI Tech Lead — reverses TQ1/TQ3 of 12414: the tier ladder lives as
-- TypeScript constants in `lib/billing/plan-tiers.ts`, not a `plan_tiers`
-- table), 12415/12416 (AI Product Owner — tier ladder values, retention and
-- seat-denominator semantics), 12418 (reconciliation), 12419 (D34 storage
-- clause correction). All binding on BK-229; not re-derived here.
--
-- AUTHORIZATION (ADR-0012 / the standing BK-267 ruling, comment 12316,
-- followed again by BK-398 comment 12406 and here per comment 12414 TQ2):
-- SECURITY INVOKER, NO caller-supplied identity parameter. The only identity
-- in this function is `auth.uid()`, read indirectly through the step-0 call
-- to `bunkai_is_workspace_admin` (itself SECURITY DEFINER, self-binds to
-- auth.uid(), takes no caller-supplied identity to spoof). `p_workspace_id`
-- is a narrowing filter only, never the authorization boundary — the step-0
-- gate already proves the caller is an active admin/owner of exactly that
-- workspace before any other table is read, so no further row can leak.
-- Returns `null` (never raises) for: a non-admin caller, an unknown
-- workspace, or a workspace the caller cannot see — one uniform outcome, no
-- existence disclosure. The route maps `null` to 404, never 403.
--
-- The caller MUST invoke this through getAuth(ctx).db — NEVER
-- createAdminClient() — or auth.uid() is NULL and bunkai_is_workspace_admin
-- always returns false, silently breaking the feature (fails closed, but
-- defeats it).
--
-- BODY ORDER (do not reorder — step 0 precedes every table read):
--   1. bunkai_is_workspace_admin(p_workspace_id) gate — return null if false.
--   2. Read workspaces.plan — null result (unknown workspace) returns null.
--   3. count(*) over workspace_members where status = 'active' — active only,
--      per business rule 2; pending and suspended never consume a seat.
--   4. count(*) over projects — NO soft-delete predicate: verified live,
--      `projects` carries no `archived_at` column (unlike `modules`/`atcs`).
--   5. Oldest-run age in days via now() - min(runs.created_at) — null when
--      the workspace has no runs. Per comment 12416: this is USAGE of the
--      retention window, not a statement that anything is pruned — nothing
--      in this product prunes runs.
--
-- Returns approximately {plan, active_seats, project_count,
-- oldest_run_age_days}. Deliberately NO limits, NO percentages, NO display
-- labels — all limit/percentage/warning-threshold math and the tier ladder
-- itself live in lib/billing/plan-tiers.ts (TS layer), unit-testable with no
-- database.

create or replace function public.bunkai_workspace_billing_overview(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_plan text;
  v_active_seats int;
  v_project_count int;
  v_oldest_run_age_days int;
begin
  -- Step 0 — actor bind, before any table read. bunkai_is_workspace_admin
  -- is SECURITY DEFINER and binds internally to auth.uid(); it takes no
  -- caller-supplied identity parameter, so there is nothing here to spoof.
  if not public.bunkai_is_workspace_admin(p_workspace_id) then
    return null;
  end if;

  select w.plan into v_plan
  from public.workspaces w
  where w.id = p_workspace_id;

  if v_plan is null then
    return null;
  end if;

  select count(*) into v_active_seats
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.status = 'active';

  select count(*) into v_project_count
  from public.projects p
  where p.workspace_id = p_workspace_id;

  select extract(day from now() - min(r.created_at))::int into v_oldest_run_age_days
  from public.runs r
  where r.workspace_id = p_workspace_id;

  return jsonb_build_object(
    'plan', v_plan,
    'active_seats', v_active_seats,
    'project_count', v_project_count,
    'oldest_run_age_days', v_oldest_run_age_days
  );
end;
$$;

comment on function public.bunkai_workspace_billing_overview(uuid) is
  'BK-229 — workspace billing overview: plan key + live seat/project/retention counts for the caller''s own workspace, admin/owner only. Returns null (not an exception) for a non-admin caller, an unknown workspace, or a workspace the caller cannot see. No limits or percentages here — those are computed in lib/billing/plan-tiers.ts against the returned plan key.';

revoke execute on function public.bunkai_workspace_billing_overview(uuid) from public, anon;
grant  execute on function public.bunkai_workspace_billing_overview(uuid) to authenticated, service_role;
