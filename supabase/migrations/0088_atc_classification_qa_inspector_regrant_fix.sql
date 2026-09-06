-- 0088_atc_classification_qa_inspector_regrant_fix
--
-- Repairs a privilege regression that 0087_atc_classification introduced, and
-- documents the mechanism so the next migration to widen a DEFINER function
-- signature does not reintroduce it.
--
-- WHAT WENT WRONG.
-- 0085_qa_inspector_role_bootstrap_and_function_grants installed
--
--   alter default privileges in schema public
--     grant execute on functions to qa_inspector_ro, qa_inspector_rw;
--
-- A default privilege is applied at CREATE time. So when 0087 dropped the
-- 9-argument signatures of bunkai_create_atc and bunkai_update_atc and created
-- the 11-argument ones, the freshly created functions picked up EXECUTE for
-- BOTH QA roles — including qa_inspector_ro, the read-only inspection role that
-- 0086 had deliberately excluded from every write-capable function.
--
-- This is specific to drop + create. bunkai_duplicate_atc, which 0087 only
-- `create or replace`d, kept 0086's curated grants and is correctly still
-- unreachable from qa_inspector_ro. Verified on the live database after the
-- 0087 apply: ro EXECUTE was true for bunkai_create_atc and bunkai_update_atc,
-- false for bunkai_duplicate_atc.
--
-- WHY IT MATTERS. Both functions are SECURITY DEFINER and VOLATILE: they write,
-- and they bypass RLS by running as the owner. A role whose entire purpose is
-- read-only SQL inspection through DBHub could create and mutate ATCs. That is
-- exactly the invariant 0086 states in its own verification block:
--
--   -- expect 0: no write-capable DEFINER function is callable by the RO role
--
-- After 0087 that query returned 6 rows. Two of them are 0087's doing and are
-- repaired here. The other four (bunkai_bugs_check_consistency,
-- bunkai_log_export_requested, bunkai_notify_bug_event, bunkai_notify_run_event)
-- PRE-DATE this story and are deliberately NOT touched here — repairing them is
-- an untested security change in a diff nobody reviewed for it, which is the
-- same reasoning ADR-0012 applies to the unbound-actor-bind debt set. They are
-- filed separately, together with the root cause: qa_inspector_ro should almost
-- certainly not be in 0085's `alter default privileges` grant at all, since
-- every future drop-and-recreate silently re-grants it.
--
-- SCOPE. Grants to qa_inspector_rw are correct and are left alone: 0086 grants
-- that role every DEFINER function except the auth.users readers. Only the
-- read-only role is over-privileged.

revoke all on function public.bunkai_create_atc(
  uuid, uuid, uuid, text, text, text[], jsonb, jsonb, uuid[], text, text
) from qa_inspector_ro;

revoke all on function public.bunkai_update_atc(
  uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[], text, text
) from qa_inspector_ro;

-- Fail closed. If either revoke did not take, this migration must not report
-- success: a silent no-op here leaves the read-only role able to write.
do $$
declare
  leaked text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into leaked
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('bunkai_create_atc', 'bunkai_update_atc')
     and has_function_privilege('qa_inspector_ro', p.oid, 'EXECUTE');

  if leaked is not null then
    raise exception 'qa_inspector_ro still holds EXECUTE on write-capable DEFINER function(s): %', leaked;
  end if;

  raise notice 'qa_inspector_ro EXECUTE revoked on bunkai_create_atc and bunkai_update_atc.';
end;
$$;

-- Verification, to run by hand against the live database:
--
--   -- expect 4, not 6: only the pre-existing offenders remain, none of them
--   -- introduced by BK-399. See the separate ticket for those.
--   select p.proname
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.prosecdef
--      and p.provolatile = 'v'
--      and has_function_privilege('qa_inspector_ro', p.oid, 'EXECUTE');
--
--   -- expect false, false, true: BK-635's posture on the widened signature
--   select has_function_privilege('authenticated', oid, 'EXECUTE'),
--          has_function_privilege('anon',          oid, 'EXECUTE'),
--          has_function_privilege('service_role',  oid, 'EXECUTE')
--     from pg_proc where proname = 'bunkai_search_atcs';
