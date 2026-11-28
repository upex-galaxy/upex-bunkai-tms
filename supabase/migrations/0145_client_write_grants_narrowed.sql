-- 0145_client_write_grants_narrowed.sql — BK-2592: the data API writes only what the client flows send
--
-- ADDITIVE, no row rewritten. Narrows what the anon and authenticated roles may write on
-- eight tables whose rows the server flows fill in, and adds the length check the rename
-- route already applies to public.workspaces.name.
--
-- Writers and the role each one runs as (inventory, 2026-11-28, origin/staging and
-- origin/main; main writes only idempotency_keys, through the service role):
--   authenticated  POST /api/v1/workspaces/{id}/data-export inserts workspace_id and
--                  requested_by; POST /api/v1/imports inserts workspace_id, project_id
--                  and jql; the mark-one and mark-all notification routes set read_at
--   service_role   the export and import workers (lib/workspace-export/export-runner.ts,
--                  lib/jira/import-runner.ts), the digest sender (emailed_at), the
--                  idempotency middleware (lib/api/idempotency.ts, every write) and
--                  bunkai_upsert_project_tracker_settings (SECURITY INVOKER, service_role only)
--   postgres       the SECURITY DEFINER run, bug and notification functions
--                  (bunkai_create_run, bunkai_mark_run_step, bunkai_finish_run,
--                  bunkai_abort_run, bunkai_submit_automated_run, the two run sweeps on
--                  pg_cron, bunkai_create_bug, bunkai_assign_bug, bunkai_correct_bug,
--                  bunkai_transition_bug_status, bunkai_notify_run_event,
--                  bunkai_notify_bug_event, bunkai_chat_sync_mentions)
-- No shipped flow writes runs, run_atcs, run_steps, bugs or idempotency_keys as anon or
-- authenticated, and none deletes a row of these tables as either role.
--
-- 1. Privileges: anon and authenticated keep SELECT (reads stay RLS-scoped) and lose
--    INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER. authenticated gets back
--    only the columns its flows send. Revoking the table-level privilege also revokes the
--    column-level grants, so the order makes a re-run converge.
-- 2. Policies: the INSERT policies of runs, run_atcs, run_steps and bugs and the INSERT
--    and UPDATE policies of idempotency_keys go with their grants. The export, import and
--    notification policies stay as they are and now only ever see the granted columns.
-- 3. workspaces.name: at most 80 characters, at least one of them not whitespace, as the
--    create and rename routes already require. Every existing row passes, so the check
--    validates without a rewrite.
--
-- qa_inspector_rw keeps its grants (non-client QA tooling role, out of scope here).

revoke insert, update, delete, truncate, references, trigger on public.workspace_exports from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.runs from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.run_atcs from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.run_steps from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.bugs from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.import_jobs from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.notifications from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.idempotency_keys from public, anon, authenticated;

grant insert (workspace_id, requested_by) on public.workspace_exports to authenticated;
grant insert (workspace_id, project_id, jql) on public.import_jobs to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists runs_insert_workspace_role_member_plus on public.runs;
drop policy if exists run_atcs_insert_workspace_role_member_plus on public.run_atcs;
drop policy if exists run_steps_insert_workspace_role_member_plus on public.run_steps;
drop policy if exists bugs_insert_workspace_role_member_plus on public.bugs;
drop policy if exists idempotency_keys_insert_self on public.idempotency_keys;
drop policy if exists idempotency_keys_update_self on public.idempotency_keys;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspaces'::regclass and conname = 'workspaces_name_length'
  ) then
    alter table public.workspaces
      add constraint workspaces_name_length check (char_length(name) <= 80 and name ~ '\S');
  end if;
end;
$$;
