-- Migration: 0006 — first-workspace bootstrap RPC
-- Authored: 2026-05-20
--
-- Resolves the multi-tenant chicken-and-egg flagged in Phase C bug #10:
--   * `workspaces.INSERT` policy lets the caller insert a row with
--     `owner_user_id = auth.uid()`.
--   * `workspace_members.INSERT` policy requires the caller to already be an
--     admin or owner of the target workspace.
-- The two rows MUST be created atomically. We do that inside a SECURITY DEFINER
-- function that bypasses RLS internally, exposes a single round-trip RPC to
-- the authenticated client, and rolls back as a unit on any failure.
--
-- Idempotency: relies on the existing UNIQUE constraint on `workspaces.slug`.
-- Collision raises SQLSTATE 23505 which the onboarding page surfaces to the
-- user; we do not silently coalesce because the slug is part of the URL and
-- ambiguity here would let one user accidentally adopt another user's slug.

create or replace function public.bunkai_bootstrap_workspace(
  p_slug text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Slug shape: lowercase, digits, hyphens; 3..40 chars; cannot start or end
  -- with a hyphen. Matches the validation we will run client-side.
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  if p_name is null or length(trim(p_name)) < 1 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.workspaces (slug, name, owner_user_id, plan)
  values (p_slug, trim(p_name), v_user_id, 'community')
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (v_workspace_id, v_user_id, 'owner', 'active');

  return v_workspace_id;
end;
$$;

-- Permission shape mirrors 0005_rls_helpers.sql:
--   * `authenticated` needs EXECUTE because this RPC is the only safe entry
--     for a logged-in user to create their first workspace.
--   * `anon` and `public` get nothing — anonymous tenancy is not a feature.
revoke execute on function public.bunkai_bootstrap_workspace(text, text) from public, anon;
grant execute on function public.bunkai_bootstrap_workspace(text, text) to authenticated;
