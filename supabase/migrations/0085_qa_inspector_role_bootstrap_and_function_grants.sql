-- ============================================================================
-- 0085_qa_inspector_role_bootstrap_and_function_grants
--
-- Makes the QA database-inspection roles (qa_inspector_ro / qa_inspector_rw)
-- both COMPLETE and REPRODUCIBLE. Two defects are fixed here; they are filed
-- together because the second one cannot be expressed without the first.
--
-- DEFECT 1 — the roles exist nowhere in migration history.
--   qa_inspector_ro and qa_inspector_rw were provisioned out-of-band directly
--   against the live database. No migration creates them, so a rebuilt
--   environment silently loses the entire QA access path, and every GRANT
--   statement in 0011 (and below) would fail on a fresh database with
--   "role does not exist". This migration creates them if absent.
--
-- DEFECT 2 — ALTER DEFAULT PRIVILEGES never covered FUNCTIONS.
--   Observed live on 2026-09-01 in pg_default_acl, grantor `postgres`,
--   schema `public`:
--       objtype 'r' (tables)    -> qa_inspector_ro=r,  qa_inspector_rw=arwd   OK
--       objtype 'S' (sequences) -> qa_inspector_rw=rwU                 (no _ro)
--       objtype 'f' (functions) -> {postgres, anon, authenticated, service_role}
--                                  ^ no qa_inspector entry at all
--   That asymmetry is why the roles hold full CRUD on 35 of 38 public tables
--   (the default auto-grants every new table) while 75 of 82 public functions
--   return `permission denied`. Since roughly 0006, every migration follows
--   `revoke execute ... from public` + `grant execute ... to authenticated,
--   service_role`, which strips the PUBLIC default the 7 surviving legacy
--   functions still rely on. Each new RPC therefore lands unreachable to QA,
--   silently, with no failing check anywhere.
--
--   This matters because Bunkai routes essentially every business write
--   through a `bunkai_*` RPC. QA could manipulate rows directly but could not
--   exercise a single operation the application itself performs.
--
-- SCOPE — SECURITY INVOKER only. The 63 SECURITY DEFINER functions are
-- deliberately NOT granted:
--   * They execute as `postgres`, so an auto-grant here would turn any future
--     DEFINER function that touches a secret table into a QA-readable leak.
--     Verified 2026-09-01: no function in `public` currently references
--     access_token_secrets / magic_link_token_secrets / workspace_invite_secrets.
--     This exclusion keeps that true regardless of what lands next.
--   * They bind on auth.uid(), which is NULL on a direct psql connection, so
--     nearly all of them would no-op for a QA session anyway.
--
-- SECURITY POSTURE — this grants the QA roles no data they cannot already
-- reach. Both roles carry BYPASSRLS and direct table CRUD; EXECUTE on an
-- INVOKER function runs with the caller's own privileges, so the existing
-- table grants remain the binding constraint. In particular qa_inspector_ro
-- receives EXECUTE on write RPCs too, and still cannot write: the function
-- body's INSERT fails against its read-only table grants.
--
-- NOT FIXED HERE, tracked as follow-up: a competing default-ACL set owned by
-- `supabase_admin` exists for schema `public` with no qa_inspector entry.
-- Default privileges only apply to objects created by the grantor that set
-- them, so any table created while connected as `supabase_admin` (dashboard
-- SQL editor, some MCP paths) does NOT receive the QA grant. All 38 current
-- tables are postgres-owned, so this has not bitten yet. The mitigation is
-- operational, not schema: apply migrations as `postgres`.
-- ============================================================================

-- ============================================================================
-- 1. Role bootstrap (idempotent, non-destructive)
-- ============================================================================
-- Created NOLOGIN and with no password on purpose: a credential must never be
-- committed to git. On the existing database both roles are already present
-- with LOGIN, so this block is a no-op there and will NOT strip their LOGIN
-- attribute. On a fresh environment an operator finishes provisioning with:
--
--     alter role qa_inspector_ro login password '<from the secret store>';
--     alter role qa_inspector_rw login password '<from the secret store>';
--
-- The matching connection strings live in .env as QA_INSPECTOR_RO_URL /
-- QA_INSPECTOR_RW_URL (see .env.example).
--
-- BYPASSRLS is intentional and load-bearing: QA needs to inspect rows across
-- every tenant. The direct consequence is that these credentials CANNOT be
-- used to test tenant isolation — a cross-tenant RLS probe must run as a real
-- `authenticated` JWT instead. That is already documented in app/qa/qa-config.ts.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    create role qa_inspector_ro nologin bypassrls;
    raise notice 'Created role qa_inspector_ro (NOLOGIN, no password). Run: alter role qa_inspector_ro login password ''<secret>'';';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    create role qa_inspector_rw nologin bypassrls;
    raise notice 'Created role qa_inspector_rw (NOLOGIN, no password). Run: alter role qa_inspector_rw login password ''<secret>'';';
  end if;
end $$;

grant usage on schema public to qa_inspector_ro, qa_inspector_rw;

-- ============================================================================
-- 2. Default privileges — the actual root-cause fix
-- ============================================================================
-- Everything postgres creates in `public` from now on is reachable by QA
-- without a per-migration grant, exactly as tables already are.
alter default privileges for role postgres in schema public
  grant execute on functions to qa_inspector_ro, qa_inspector_rw;

-- Close the sequence asymmetry noted in the header while we are here. No
-- sequences exist today (every PK is a UUID), so this is purely forward-looking.
alter default privileges for role postgres in schema public
  grant usage, select on sequences to qa_inspector_ro;

-- ============================================================================
-- 3. Backfill the existing SECURITY INVOKER functions
-- ============================================================================
-- Default privileges apply only to objects created AFTER the rule is set, so
-- the 12 already-denied INVOKER functions need an explicit grant.
do $$
declare
  fn      record;
  granted int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not p.prosecdef
      and not has_function_privilege('qa_inspector_rw', p.oid, 'EXECUTE')
  loop
    execute format(
      'grant execute on function %s to qa_inspector_ro, qa_inspector_rw',
      fn.sig
    );
    granted := granted + 1;
  end loop;

  raise notice 'Backfilled EXECUTE on % SECURITY INVOKER function(s) in public.', granted;
end $$;

-- ============================================================================
-- 4. Re-assert secret-table isolation (belt and braces over 0011)
-- ============================================================================
-- Nothing above touches table grants, but these three tables are the one place
-- where a mistake is unrecoverable (PAT forgery, auth bypass, unauthorized
-- workspace join), so the REVOKE is restated rather than assumed.
revoke all on public.access_token_secrets,
                public.magic_link_token_secrets,
                public.workspace_invite_secrets
  from qa_inspector_ro, qa_inspector_rw;

-- ============================================================================
-- Verification — both queries must return 0
-- ============================================================================
--   -- no SECURITY INVOKER function left denied to QA
--   select count(*) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and not p.prosecdef
--      and not has_function_privilege('qa_inspector_rw', p.oid, 'EXECUTE');
--
--   -- no secret table readable by QA
--   select count(*) from unnest(array[
--            'public.access_token_secrets',
--            'public.magic_link_token_secrets',
--            'public.workspace_invite_secrets']) t(rel)
--    where has_table_privilege('qa_inspector_rw', t.rel, 'SELECT');
