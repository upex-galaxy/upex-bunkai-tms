-- ============================================================================
-- 0086_qa_inspector_definer_grants
--
-- Completes what 0085 left half-done, and corrects a false claim in its header.
--
-- WHAT 0085 GOT WRONG
--   0085 backfilled EXECUTE on the SECURITY INVOKER functions only, and its
--   header argued that excluding SECURITY DEFINER functions kept the QA roles
--   away from `postgres`-privileged code "regardless of what lands next".
--   That is not true. `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS`
--   does not distinguish prosecdef: every function created in `public` from
--   0085 onward is auto-granted to both QA roles, DEFINER included. So the
--   database was left incoherent — the 63 pre-existing DEFINER functions
--   denied, function number 64 granted automatically.
--
--   A QA engineer hit this immediately: `bunkai_sweep_abandoned_runs(4)`
--   returned `permission denied for function`, blocking any test of the
--   inactivity sweep shipped in 0075.
--
-- WHY GRANTING IS SAFE HERE — audited across all 67 DEFINER functions:
--   * 0 use dynamic SQL. There is no `EXECUTE format(...)` anywhere, so no
--     parameter can be turned into arbitrary SQL running as `postgres`.
--   * 0 reference the three secret tables isolated by 0011.
--   * 0 lack `SET search_path`. Every one is hardened against search-path
--     capture.
--   * The bodies operate on tables the QA roles already hold direct CRUD on,
--     so EXECUTE grants no reach that a hand-written statement did not already
--     have.
--
-- THE ONE REAL ESCALATION VECTOR — functions that read `auth.users`.
--   `auth` is the schema the QA roles are deliberately denied: it holds bcrypt
--   password hashes, sessions and refresh tokens. A DEFINER function reading it
--   runs as `postgres` and would become an indirect window into that schema.
--   Five functions qualify and are explicitly revoked below:
--     auth_email_status(text)
--     bunkai_notification_digest_candidates()
--     bunkai_request_workspace_deletion(uuid)
--     bunkai_resolve_activity_actors(uuid,uuid[])
--     bunkai_user_id_by_email(text)
--   The loop below is driven by the same `auth.users` predicate rather than by
--   that list, so a function added later that reads `auth.users` is skipped on
--   a re-run even if nobody updates the names.
--
-- WHY qa_inspector_ro IS TREATED DIFFERENTLY.
--   For a SECURITY INVOKER function the caller's own table grants still bind,
--   which is why 0085 could grant both roles the same set: `_ro` calling a
--   write RPC simply fails on the INSERT. A SECURITY DEFINER function executes
--   as `postgres` and bypasses that entirely, so granting a volatile one to
--   `_ro` would let the read-only credential write. `_ro` therefore receives
--   only STABLE and IMMUTABLE DEFINER functions, which cannot write by
--   definition. That is 9 functions, against 53 for `_rw`.
--
-- RESIDUAL RISK, ACCEPTED AND MADE DETECTABLE.
--   The default privilege from 0085 still auto-grants FUTURE functions to both
--   roles, so a new function that reads `auth.users`, or a new volatile DEFINER
--   function reaching `_ro`, would slip through. Postgres cannot express
--   "default privileges, but only for SECURITY INVOKER". Rather than give up
--   the default that fixed the original bug, `bun run db:qa-roles` now audits
--   both conditions and reports them, turning an invisible drift into a
--   detectable one.
-- ============================================================================

-- ============================================================================
-- 1. qa_inspector_rw — every DEFINER function except the auth.users readers
-- ============================================================================
do $$
declare
  fn      record;
  granted int := 0;
begin
  -- The CTE is MATERIALIZED on purpose. Postgres does not guarantee predicate
  -- evaluation order, and pg_get_functiondef() throws on an aggregate
  -- (`array_agg` is one), so the prokind/prosecdef filter must be forced to run
  -- first rather than merely written first.
  for fn in
    with definers as materialized (
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and p.prosecdef
    )
    select d.oid::regprocedure as sig
    from definers d
    where pg_get_functiondef(d.oid) !~ 'auth\.users'
      and not has_function_privilege('qa_inspector_rw', d.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to qa_inspector_rw', fn.sig);
    granted := granted + 1;
  end loop;

  raise notice 'qa_inspector_rw: granted EXECUTE on % SECURITY DEFINER function(s).', granted;
end $$;

-- ============================================================================
-- 2. qa_inspector_ro — only the non-writing ones, to keep read-only honest
-- ============================================================================
do $$
declare
  fn      record;
  granted int := 0;
begin
  for fn in
    with definers as materialized (
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and p.prosecdef
        and p.provolatile in ('s', 'i')   -- STABLE / IMMUTABLE: cannot write
    )
    select d.oid::regprocedure as sig
    from definers d
    where pg_get_functiondef(d.oid) !~ 'auth\.users'
      and not has_function_privilege('qa_inspector_ro', d.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to qa_inspector_ro', fn.sig);
    granted := granted + 1;
  end loop;

  raise notice 'qa_inspector_ro: granted EXECUTE on % non-writing SECURITY DEFINER function(s).', granted;
end $$;

-- ============================================================================
-- 3. Revoke every function that reads auth.users, from both roles
-- ============================================================================
-- Written as a loop rather than a list so it also catches anything the default
-- privilege auto-granted between 0085 and this migration.
do $$
declare
  fn      record;
  revoked int := 0;
begin
  for fn in
    with routines as materialized (
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
    )
    select r.oid::regprocedure as sig
    from routines r
    where pg_get_functiondef(r.oid) ~ 'auth\.users'
  loop
    execute format(
      'revoke all on function %s from qa_inspector_ro, qa_inspector_rw',
      fn.sig
    );
    revoked := revoked + 1;
  end loop;

  raise notice 'Revoked EXECUTE on % function(s) reading auth.users.', revoked;
end $$;

-- ============================================================================
-- 4. Re-assert secret-table isolation (unchanged from 0011 and 0085)
-- ============================================================================
revoke all on public.access_token_secrets,
                public.magic_link_token_secrets,
                public.workspace_invite_secrets
  from qa_inspector_ro, qa_inspector_rw;

-- ============================================================================
-- Verification — run `bun run db:qa-roles`, or by hand:
-- ============================================================================
--   -- expect 0: no function reading auth.users is callable by QA
--   select count(*) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and pg_get_functiondef(p.oid) ~ 'auth\.users'
--      and (has_function_privilege('qa_inspector_rw', p.oid, 'EXECUTE')
--        or has_function_privilege('qa_inspector_ro', p.oid, 'EXECUTE'));
--
--   -- expect 0: no write-capable DEFINER function is callable by the RO role
--   select count(*) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef and p.provolatile = 'v'
--      and has_function_privilege('qa_inspector_ro', p.oid, 'EXECUTE');
