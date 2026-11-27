-- 0142_access_token_revoke_only.sql — BK-2588: the data API may only revoke a token
--
-- ADDITIVE, no row rewritten. Narrows what the anon and authenticated roles may write
-- on public.access_tokens and makes a revocation final for every role.
--
-- Writers of access_tokens and the role each one runs as (inventory, 2026-11-27):
--   service_role   POST /api/v1/tokens, the sign-in and sign-up confirm mints
--                  (lib/api/pat.ts mintPat) and the bearer last_used_at touch
--   authenticated  DELETE /api/v1/tokens/{id} and POST /api/v1/auth/sign-out with
--                  revoke_pats: both set revoked_at on the caller's own active rows
--   postgres       the SECURITY DEFINER functions bunkai_leave_workspace,
--                  bunkai_remove_workspace_member and bunkai_request_workspace_deletion,
--                  which only set revoked_at where it is null
-- No shipped flow inserts or deletes a row as anon or authenticated, so both grants go.
--
-- 1. Privileges: anon and authenticated keep SELECT (the list stays RLS-scoped);
--    authenticated gets UPDATE on revoked_at alone. Revoking the table-level UPDATE
--    also revokes the column-level grants, so the order makes a re-run converge.
-- 2. Policies: the INSERT policy goes, and the UPDATE policy only matches the
--    caller's own unrevoked row and only accepts a row that comes out revoked.
-- 3. Trigger: a revocation by anon or authenticated is stamped with the database
--    clock, so a client cannot write its own timestamp. Once revoked_at is set, no
--    role (service_role included) may clear or change it. It fires only on UPDATE OF
--    revoked_at, so the per-request last_used_at touch never runs it.
--
-- qa_inspector_rw keeps its grants (non-client QA tooling role, out of scope here).

revoke insert, update, delete, truncate, references, trigger on public.access_tokens from public, anon, authenticated;
grant update (revoked_at) on public.access_tokens to authenticated;

drop policy if exists access_tokens_insert_own on public.access_tokens;
drop policy if exists access_tokens_update_own on public.access_tokens;
drop policy if exists access_tokens_revoke_own on public.access_tokens;

create policy access_tokens_revoke_own on public.access_tokens
  for update to authenticated
  using (user_id = (select auth.uid()) and revoked_at is null)
  with check (user_id = (select auth.uid()) and revoked_at is not null);

create or replace function public.bunkai_access_token_revocation_is_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'token_revocation_final' using errcode = '42501';
  end if;
  if old.revoked_at is null and new.revoked_at is not null and current_user in ('anon', 'authenticated') then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.bunkai_access_token_revocation_is_final() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_access_token_revocation_is_final() from qa_inspector_ro;
  end if;
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_rw') then
    revoke all on function public.bunkai_access_token_revocation_is_final() from qa_inspector_rw;
  end if;
end;
$$;

create or replace trigger access_tokens_revocation_is_final
  before update of revoked_at on public.access_tokens
  for each row execute function public.bunkai_access_token_revocation_is_final();
