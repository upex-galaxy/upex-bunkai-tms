-- BK-60: POST /invites must reject emails that already belong to an active
-- workspace member. workspace_members stores user_id only; email lives in
-- auth.users, which PostgREST does not expose. This SECURITY DEFINER helper
-- resolves an email to a user id without exposing auth.users to clients.
-- Callable only by the service role (revoked from anon/authenticated).

create or replace function public.bunkai_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.bunkai_user_id_by_email(text) from public;
revoke all on function public.bunkai_user_id_by_email(text) from anon;
revoke all on function public.bunkai_user_id_by_email(text) from authenticated;
