-- 0133_bugs_realtime_replication.sql — BK-718: enable Realtime replication
-- for defect records, so the Defect Heatmap updates itself when a defect is
-- filed (FR-040 "Realtime row subscriptions" names `bugs`; mvp-scope.md:
-- "updates within 5s of a new Bug").
--
-- Third application of ADR-0010 (Supabase Realtime, Postgres Changes), after
-- 0043_run_realtime_replication.sql (run_atcs, run_steps) and
-- 0053_notifications.sql (notifications); 0104 added chat_messages the same
-- way.
--
-- RLS scoping (AI Tech Lead decision on BK-718, option A): publication
-- membership is database-global, and the only scoping is the subscriber's own
-- read policy, which Supabase Realtime enforces on every `postgres_changes`
-- event it delivers. `bugs_select_workspace_member` (0046_bugs.sql) gates
-- SELECT on active workspace membership, so a subscriber is only ever told
-- about a defect it could already read. Same argument as 0043's header,
-- applied a third time. No policy change here.
--
-- The client binds INSERT only, filtered on `project_id=eq.<projectId>`
-- (lib/bugs/realtime-heatmap-channel.ts): heatmap figures depend only on a
-- defect's created_at and module, and the client re-reads the whole report on
-- an event instead of merging the payload. Default REPLICA IDENTITY is enough
-- for that (no OLD-row diffing), as 0043 explains.
--
-- Additive and idempotent: a re-apply is a no-op (the 0104 guard shape).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bugs'
  ) then
    alter publication supabase_realtime add table public.bugs;
  end if;
end;
$$;
