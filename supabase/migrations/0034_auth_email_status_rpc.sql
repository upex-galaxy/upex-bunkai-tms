-- 0034_auth_email_status_rpc.sql — BK-166: email-first existence lookup
--
-- The email-first login flow (BK-166) needs to know, before asking for a
-- password, whether an account exists for a typed email and whether it is
-- confirmed. The `auth` schema is NOT exposed to PostgREST on this project
-- (PGRST106 "Only public, graphql_public are exposed"), so the API route cannot
-- read `auth.users` directly. This migration is ADDITIVE only: it adds one
-- SECURITY DEFINER function in `public` that returns just two booleans and is
-- callable by `service_role` ONLY — `auth.users` is never exposed to anon /
-- authenticated clients.
--
-- Enumeration of account existence is a knowingly-accepted tradeoff for the
-- email-first UX (see ADR-0007), mitigated by rate-limiting. The route
-- (app/api/v1/auth/check-email) calls this via `admin.rpc('auth_email_status')`.
--
-- Conventions mirror prior DEFINER RPCs (0032_project_environments_crud.sql):
-- `set search_path = ''`, schema-qualified references, explicit grants.

create or replace function public.auth_email_status(p_email text)
returns table(email_exists boolean, email_confirmed boolean)
language sql
security definer
set search_path = ''
as $$
  select
    count(*) > 0,
    count(*) filter (where u.email_confirmed_at is not null) > 0
  from auth.users u
  where u.email = lower(trim(p_email));
$$;

revoke all on function public.auth_email_status(text) from public, anon, authenticated;
grant execute on function public.auth_email_status(text) to service_role;
