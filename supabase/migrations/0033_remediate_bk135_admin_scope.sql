-- 0033_remediate_bk135_admin_scope.sql — BK-135: revoke illegitimate workspace:admin PATs
--
-- BK-135 (privilege escalation): /api/v1/auth/signin, /auth/signup and
-- POST /api/v1/tokens issued Personal Access Tokens carrying the workspace:admin
-- scope to users who do not hold an admin/owner role in the target workspace,
-- and even as GLOBAL tokens (workspace_id = NULL) for which no admin role can
-- exist. The code fix (ADR-0005) closes the issuance paths going forward; this
-- migration remediates tokens already in circulation.
--
-- A token's workspace:admin scope is ILLEGITIMATE when:
--   * workspace_id IS NULL  (a global admin token — never allowed; no global role), OR
--   * the holder is not an active admin/owner member of the token's workspace.
--
-- Remediation is SCOPE-STRIP, not full revoke: workspace:admin has no
-- consumption-side enforcement yet (requireScope is unused), so removing just
-- that scope is non-disruptive — the token keeps its atc:read/write/run access.
-- Exception: a token whose ONLY scope is workspace:admin cannot be left with an
-- empty scopes[] (access_tokens_scopes_nonempty CHECK), so it is revoked instead.
--
-- Idempotent: re-running matches nothing once remediated. Single shared Supabase
-- project across local/staging/production, so this applies to every environment.

begin;

-- A reusable predicate: TRUE when this token's workspace:admin grant is illegitimate.
-- (Inlined into both statements below rather than a helper fn — one-shot migration.)

-- 1. Tokens whose ONLY scope is workspace:admin → revoke (cannot empty scopes[]).
update public.access_tokens t
set revoked_at = now()
where t.revoked_at is null
  and t.scopes = array['workspace:admin']::text[]
  and (
    t.workspace_id is null
    or not exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = t.workspace_id
        and m.user_id = t.user_id
        and m.status = 'active'
        and m.role in ('admin', 'owner')
    )
  );

-- 2. Tokens carrying workspace:admin alongside other scopes → strip only the
--    admin scope, leave the rest intact.
update public.access_tokens t
set scopes = array_remove(t.scopes, 'workspace:admin')
where 'workspace:admin' = any(t.scopes)
  and coalesce(array_length(t.scopes, 1), 0) > 1
  and (
    t.workspace_id is null
    or not exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = t.workspace_id
        and m.user_id = t.user_id
        and m.status = 'active'
        and m.role in ('admin', 'owner')
    )
  );

commit;
