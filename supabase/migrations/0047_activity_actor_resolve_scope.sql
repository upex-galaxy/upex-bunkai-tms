-- Migration: 0047 — fix bunkai_resolve_activity_actors' missing per-id scope
-- (BK-49 final-review BLOCKER, found by full-diff adversarial review of the
-- assembled feat/BK-49-activity-stream chain before its staging PR)
--
-- THE BUG (0045_activity_stream.sql, already live): bunkai_resolve_activity_actors
-- asserted the CALLER's own membership in p_workspace_id (bunkai_is_workspace_member,
-- correct and unconditional) but then selected `auth.users` rows for p_user_ids with
-- NO filter tying those ids back to p_workspace_id at all. The assert and the
-- disclosed data were two different resources — exactly the "assert vs filter"
-- bug class the original Stage-1 v1 proposal was rejected for on the LIST rpc,
-- just relocated to this one, where nobody re-checked it during per-slice review.
--
-- Exploitable as shipped: any authenticated user can self-provision a workspace
-- via bunkai_bootstrap_workspace (0006, `grant execute ... to authenticated`, no
-- precondition beyond being signed in), which satisfies bunkai_is_workspace_member
-- for that workspace. Calling bunkai_resolve_activity_actors directly via
-- PostgREST (no application-level RPC gateway exists — the app's own
-- lib/supabase/client.ts is a plain anon-key browser client, and ADR-0001 Path B
-- treats db.rpc() as a first-class sanctioned calling pattern, not server-only)
-- with that throwaway workspace id and an arbitrary target uuid returns that
-- target's email, with zero relationship between the target and the workspace
-- used to pass the gate. ADR-0011's own Decision text claims "every actor_user_id
-- on an activity_log row is already guaranteed... to have been an active member
-- of p_workspace_id at write time" — true only for the trusted Next.js caller
-- (app/api/v1/activity/response.ts's fetchActivityPage, which correctly harvests
-- actorIds only from that workspace's own activity_log rows), never enforced for
-- a direct RPC caller who controls p_user_ids freely.
--
-- THE FIX: scope the SELECT itself to p_user_ids that actually appear as an
-- actor on THIS workspace's activity_log — the same provenance guarantee
-- ADR-0011 already claims, now actually enforced at the one place that matters.
-- `create or replace` keeps the function's existing grants (belt-and-braces
-- re-assert below, same convention as 0039's redefinition of
-- bunkai_list_test_runs). Signature unchanged, so every existing caller
-- (lib/supabase/rpc.ts's resolveActivityActors, app/api/v1/activity/response.ts's
-- fetchActivityPage) needs no change.
--
-- SECOND, PRE-EXISTING BUG found while writing this fix's own regression test
-- (the first time this function was ever actually invoked against live
-- Postgres — route.test.ts fully mocks db.rpc, so it never caught this):
-- `auth.users.email` is `character varying(255)`, but the function declares
-- `RETURNS TABLE(user_id uuid, email text)`. `RETURN QUERY` requires an exact
-- type match per output column — Postgres raised 42804 ("structure of query
-- does not match function result type") on every real call. Fixed here with
-- an explicit `::text` cast; unrelated to the security fix above, bundled in
-- the same migration because both live in the same function body and this
-- one was un-shippable without it (no valid pre-0047 call to compare against —
-- the leak this migration closes never actually returned data through this
-- exact code path in production use, since nothing had called it for real).

create or replace function public.bunkai_resolve_activity_actors(
  p_workspace_id uuid,
  p_user_ids     uuid[]
)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Unconditional guard (runs before the query, every call, regardless of
  -- p_user_ids' contents) — unchanged from 0045, this half was already correct.
  if not public.bunkai_is_workspace_member(p_workspace_id) then
    raise exception 'not_workspace_member' using errcode = '42501';
  end if;

  -- Per-id provenance check (the fix): only resolve ids that genuinely wrote an
  -- activity_log row in THIS workspace. A caller-supplied id with no such row
  -- is silently excluded from the result set, never disclosed — matching
  -- bunkai_list_activity's own "non-member yields zero rows, not an error"
  -- non-disclosure posture rather than raising (a raise here would let a caller
  -- distinguish "wrong workspace" from "id never wrote here", a needless signal).
  return query
    select u.id, u.email::text
      from auth.users u
      where u.id = any(p_user_ids)
        and exists (
          select 1
            from public.activity_log al
           where al.workspace_id = p_workspace_id
             and al.actor_user_id = u.id
        );
end;
$$;

-- Re-assert the 0039-established pattern. `create or replace` keeps the
-- existing ACL, so this is idempotent belt-and-braces, not a change.
revoke all on function public.bunkai_resolve_activity_actors(uuid, uuid[]) from public, anon;
grant execute on function public.bunkai_resolve_activity_actors(uuid, uuid[]) to authenticated, service_role;
