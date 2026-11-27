-- 0143_workspace_owner_rename_only.sql — BK-2590: the data API may only rename a workspace
--
-- ADDITIVE, no row rewritten. Narrows what the anon and authenticated roles may write
-- on public.workspaces: plan, seats, ownership and deletion state change only through
-- the server flows.
--
-- Writers of workspaces and the role each one runs as (inventory, 2026-11-27, the same
-- on origin/staging and origin/main unless noted):
--   authenticated  PATCH /api/v1/workspaces/{id}: sets name on a workspace the caller
--                  owns (cookie session, and on staging also a bearer PAT through the
--                  impersonating client)
--   postgres       the SECURITY DEFINER functions bunkai_bootstrap_workspace (insert),
--                  bunkai_request_workspace_deletion and bunkai_restore_workspace_deletion
--                  (deleted_at, deletion_requested_by), bunkai_apply_billing_checkout_webhook_event
--                  and bunkai_apply_billing_subscription_event (plan, purchased_seats;
--                  service_role only) and bunkai_purge_deleted_workspaces (delete;
--                  service_role only)
--   service_role   the billing and webhook routes read through the admin client and
--                  write only through the functions above
-- No shipped flow inserts or deletes a row as anon or authenticated, so both grants go.
--
-- 1. Privileges: anon and authenticated keep SELECT (reads stay RLS-scoped);
--    authenticated gets UPDATE on name alone. Revoking the table-level UPDATE also
--    revokes the column-level grants, so the order makes a re-run converge.
-- 2. Policies: the INSERT and DELETE policies go with their grants. The owner-only
--    UPDATE policy stays as it is and now only ever sees a rename.
--
-- qa_inspector_rw keeps its grants (non-client QA tooling role, out of scope here).

revoke insert, update, delete, truncate, references, trigger on public.workspaces from public, anon, authenticated;
grant update (name) on public.workspaces to authenticated;

drop policy if exists workspaces_insert_self_owner on public.workspaces;
drop policy if exists workspaces_delete_owner on public.workspaces;
