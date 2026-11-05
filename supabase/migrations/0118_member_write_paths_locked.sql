-- Migration: 0118 — funnel every membership write through locked RPCs (BK-1589)
-- Authored: 2026-11-05
--
-- Governing record: the BK-1589 AI Product Owner ruling of 2026-11-05 (G1-G6),
-- ADR-0012 (RPC authorization invariant) and ADR-0022 with its 2026-11-05
-- addendum. Additive and idempotent: no table, column or row is removed; every
-- object is `create or replace`, `drop policy if exists` or a `revoke`.
--
-- What it does:
--   1. G1: drops the INSERT, UPDATE and DELETE policies of workspace_members
--      and revokes those table privileges from anon and authenticated.

-- ============================================================================
-- 1. workspace_members — no write path through a user session (G1)
-- ============================================================================
-- Every shipped writer already bypasses user-session RLS: bootstrap (0006),
-- leave (0044) and removal (0114) are SECURITY DEFINER, and invite accept runs
-- on the service role. What the 0114 ladder policies still allowed was the
-- problem: an Admin could add a lower-ranked row with no invite, and delete one
-- with none of the removal side effects. Replaying those side effects in a
-- trigger was rejected (two code paths to one operation drift), so the write
-- path goes away instead. The privileges go too, so a future permissive policy
-- cannot reopen it. SELECT is unchanged (0084a). bunkai_caller_workspace_rank
-- stays: dropping it is not needed to close the gap.

drop policy if exists workspace_members_insert_admin on public.workspace_members;
drop policy if exists workspace_members_update_admin on public.workspace_members;
drop policy if exists workspace_members_delete_admin on public.workspace_members;

revoke insert, update, delete, truncate on public.workspace_members from public, anon, authenticated;
