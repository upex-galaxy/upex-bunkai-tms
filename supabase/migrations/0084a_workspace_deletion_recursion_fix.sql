-- Migration: 0084a — fix 42P17 infinite recursion, one introduced by 0084
-- and one pre-existing
-- Authored: 2026-08-30
--
-- PART 1 — introduced by 0084. `workspace_members_select_self_or_admin`'s
-- edit added a PLAIN (non-SECURITY-DEFINER) `exists (select 1 from
-- public.workspaces w where ...)` subquery directly inside workspace_members'
-- own SELECT policy. Fix: wrap the liveness check in its own narrow
-- SECURITY DEFINER helper that touches ONLY `workspaces` (never
-- `workspace_members`), matching the convention every other cross-table
-- check in this file already follows.
--
-- PART 2 — PRE-EXISTING, discovered while diagnosing Part 1, unrelated to
-- ADR-0015. The SAME policy's admin branch has, since 0001_tenancy.sql,
-- been a raw self-referential `exists (select 1 from public.workspace_members
-- wm where ...)` -- unlike its three sibling policies on the same table
-- (`workspace_members_delete_admin`/`_insert_admin`/`_update_admin`), which
-- all correctly call the SECURITY DEFINER `bunkai_is_workspace_admin`
-- helper. A self-referential subquery inside a table's own RLS policy trips
-- Postgres' 42P17 guard at query-rewrite time regardless of which row or
-- role is involved -- confirmed by reverting ALL FIVE RLS objects this
-- migration touches to their exact pre-0084 (origin/staging) text and
-- re-running `bun test lib/billing/billing-overview-isolation.test.ts`: it
-- still failed with the identical 42P17. Fix: reuse the existing
-- `bunkai_is_workspace_admin` helper instead of the raw self-join, exactly
-- matching the sibling policies.
--
-- Both parts verified together against the live database (project
-- fmbpikzpkafptqximhxn) via `bun test lib/billing/billing-overview-
-- isolation.test.ts` (5/5 pass) before this file was written.

create or replace function public.bunkai_workspace_is_live(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws_id
      and w.deleted_at is null
  );
$$;

revoke execute on function public.bunkai_workspace_is_live(uuid) from public, anon;
grant execute on function public.bunkai_workspace_is_live(uuid) to authenticated;

drop policy if exists workspace_members_select_self_or_admin on public.workspace_members;
create policy workspace_members_select_self_or_admin
  on public.workspace_members
  for select
  using (
    public.bunkai_workspace_is_live(workspace_id)
    and (
      user_id = auth.uid()
      or public.bunkai_is_workspace_admin(workspace_id)
    )
  );
