-- ============================================================================
-- 0075_run_inactivity_sweep
--
-- BK-269 — Abandoned Runs sit in 'running' forever, so the Home active-runs
-- widget and every report built on Run status count work nobody is doing.
-- A scheduled sweep closes each idle Run as 'aborted', carrying a
-- system-generated reason that reads distinctly from a person-typed one.
--
-- SHAPE (ratified 2026-08-24, operator; supersedes the ticket's `## PO
-- Responses` comment). The sweep runs ENTIRELY inside Postgres: pg_cron
-- invokes the SECURITY DEFINER function below directly. There is no Edge
-- Function, no POST /api/v1/admin/sweep/* route, no service-role HTTP call
-- and no CRON_SECRET. That shape was rejected because a service-role HTTP
-- sweep is a THIRD principal class — neither cookie session nor PAT — which
-- amends ADR-0001 rather than applying it, and because neither pg_net nor
-- http is installed on this project, so there is no path from Postgres out to
-- a Node process anyway.
--
-- Verified on the live instance (PostgreSQL 17.6, project fmbpikzpkafptqximhxn)
-- BEFORE writing this file:
--   select name, default_version, installed_version
--     from pg_available_extensions where name in ('pg_cron','pg_net','http');
--   -> pg_cron 1.6.4 installed_version NULL   (available, not yet installed)
--   -> pg_net  0.20.0 installed_version NULL
--   -> http    1.6    installed_version NULL
--
-- IDLE SIGNAL — no schema change. Idle time is
--   coalesce(max(run_steps.executed_at), runs.started_at)
-- run_steps.executed_at is written ONLY by bunkai_mark_run_step (0042:155);
-- abort and finish only flip status to 'skipped' and never touch it, so it is
-- already a clean "last human activity" signal. It is also the same signal
-- lib/home/active-runs.ts:47-54 computes, so this sweep and the Home widget
-- cannot disagree about what counts as idle.
--
-- runs.updated_at is DELIBERATELY NOT USED: the runs_set_updated_at trigger
-- (0031_runs.sql:96-98) fires on this sweep's own abort, so a freshly swept
-- Run would read as "recently active" to the next pass. The ticket's
-- `## Dev Responses` comment proposed a dedicated runs.last_step_activity_at
-- column to dodge that; it is not needed, and adding it would have required a
-- create-or-replace of the live bunkai_mark_run_step plus a first-ever
-- mid-run UPDATE of the runs row, which changes runs.updated_at semantics for
-- runs_workspace_id_updated_at_idx (0059:56-57) and lib/home/recent-projects.ts.
--
-- KNOWN, ACCEPTED SIDE EFFECT — a swept Run bumps runs.updated_at, and
-- lib/home/recent-projects.ts:150-153 reads that column as a project-recency
-- signal, so closing an abandoned Run nudges its project up Home's "recent
-- projects" list. Recorded rather than fixed, for three reasons: that widget's
-- own header (recent-projects.ts:29) defines runs.updated_at as "execution (a
-- run was started, finished OR ABORTED)", and a sweep close IS an abort;
-- bunkai_abort_run performs the identical UPDATE today, so this is the
-- established behaviour of an abort rather than something this story
-- introduces; and it happens exactly ONCE per Run, not repeatedly — an
-- 'aborted' Run never re-enters the candidate set (AC5). The only visible
-- artefact is that clearing a large backlog nudges several projects at once,
-- which is a one-time property of the first pass.
--
-- Custom SQLSTATE codes allocated for the run domain (class 45xxx, 452xx
-- block; 45203 RESERVED per 0031; 45204/45205 in 0036; 45206/45207 in 0037;
-- 45208 in 0038; 45209 in 0039; 45210/45211 in 0032; 45212/45213 in 0042;
-- 45214 in 0045):
--   45215  sweep_threshold_invalid  (p_threshold_hours below the 1-hour floor;
--                                     a 0 threshold would close every running
--                                     Run on the next tick)
-- ============================================================================


-- ============================================================================
-- 1. pg_cron
-- ============================================================================
--
-- pg_cron declares its own `cron` schema, so no WITH SCHEMA clause.
--
-- NO manual grants on the `cron` schema. Supabase's docs show
--   grant usage on schema cron to postgres;
--   grant all privileges on all tables in schema cron to postgres;
-- but on Supabase Cloud those are already issued — WITH GRANT OPTION — by the
-- platform's own after-create hook for this extension
-- (/etc/postgresql-custom/extension-custom-scripts/pg_cron/after-create.sql).
-- Issuing them again from a migration is not merely redundant: it makes that
-- hook's own `revoke all on table cron.job from postgres` fail with
-- `2BP01 dependent privileges exist`, so a re-run of this migration aborts.
-- Verified the hard way on 2026-08-24 — the first apply succeeded, the second
-- failed on exactly that revoke. The grants belong in a self-hosted setup, not
-- here.

create extension if not exists pg_cron;


-- ============================================================================
-- 2. bunkai_sweep_abandoned_runs — close idle Runs. SECURITY DEFINER.
-- ============================================================================
--
-- AUTHORIZATION. This function takes NO caller-supplied identity or scope
-- parameter, which is ADR-0012's preferred outcome ("prefer deleting the
-- identity parameter over guarding it") rather than an exemption from it: with
-- nothing to spoof, the actor-bind requirement is vacuous by construction —
-- the same reasoning 0066_run_event_notifications.sql records for its trigger.
-- ADR-0012 requirement (4), result scoping, still binds and is satisfied:
-- every row touched is reached from runs.id through the candidate query,
-- never from an external input.
--
-- It is therefore NOT granted to anon or authenticated (§3 below). pg_cron
-- runs the job as the database owner, which needs no grant. A function that
-- closes every idle Run in every Workspace, reachable over PostgREST by any
-- signed-in user, would be a cross-tenant denial of service with a friendly
-- name — `authenticated` is where that risk actually lives, and it is closed.
--
-- IT CANNOT CALL bunkai_abort_run. That RPC's step 2 is
-- `perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, …)`
-- (0067_run_finish_abort_via.sql:182), and that helper raises 42501 whenever no
-- active member/admin/owner row matches the actor (0024_tests.sql:146-167) —
-- which a null system actor never does. So steps 5a/5b/5c and the audit insert
-- are replicated inline below, byte-for-byte with 0067 §2, which stays the
-- canonical shape for the close sequence. A system-actor bypass was NOT added
-- to the live RPC: that would weaken a shipped authorization gate to save a
-- dozen lines.
--
-- LOCK DISCIPLINE. The candidate query is a FILTER, never the authority. Each
-- Run is taken with `for update … skip locked`, and the idle predicate is
-- RE-EVALUATED under that lock before anything is written. Without the
-- re-check, a step marked between the candidate SELECT and the UPDATE is
-- silently discarded and a live Run is closed — the defect AC-E1 exists to
-- prevent. bunkai_mark_run_step already takes `for update of r` on this same
-- header specifically to serialize against a concurrent abort (0042:122-130),
-- and raises 45212 run_step_marking_closed on a Run that is no longer
-- 'running' (0042:139-142), so the sweep-wins branch needs no new code here.
-- `skip locked` additionally makes two overlapping passes safe.
--
-- IDEMPOTENCE (AC5) needs no machinery: `status = 'running'` plus the
-- under-lock re-check means a second pass finds an already-aborted Run outside
-- its candidate set.
--
-- PER-RUN ISOLATION. Each close sits in its own BEGIN … EXCEPTION block, so
-- one bad Run cannot strand the rest of the pass and the sweep is resumable
-- after a mid-pass failure without carrying any state of its own.
--
-- NOTIFICATION, inherited not built. The activity_log insert fires the live
-- activity_log_notify_run_event trigger (0066). With actor_user_id = NULL its
-- suppression predicate is false, so exactly one run.aborted notification
-- reaches the Run's starter (runs.executor_user_id), scoped to that Run's
-- workspace; if the starter's account is gone, 0066's null-recipient early
-- return fires and nothing is written. The story's Out of Scope field defers
-- owner notification as an open question — it is answered here by
-- inheritance, at zero cost, and suppressing it would mean an approval-gated
-- rewrite of a live trigger to buy strictly less product value.

create or replace function public.bunkai_sweep_abandoned_runs(
  p_threshold_hours int default 4
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff      timestamptz;
  v_run         record;
  v_last_active timestamptz;
  v_reason      text;
  v_skipped     int;
  v_examined    int := 0;
  v_swept       int := 0;
  v_failed      int := 0;
begin
  -- 1. Threshold floor. A 0 (or negative) threshold would close every running
  --    Run on the next tick, so it is refused rather than clamped.
  if p_threshold_hours is null or p_threshold_hours < 1 then
    raise exception 'sweep_threshold_invalid' using errcode = '45215';
  end if;

  v_cutoff := now() - make_interval(hours => p_threshold_hours);

  -- 2. Candidate pass. Only 'running' Runs are ever considered — the Run-grain
  --    vocabulary is exactly running|passed|failed|aborted (0031:79-80), and a
  --    Run is created directly in 'running', so there is no earlier state to
  --    sweep. Served by runs_workspace_id_started_at_running_idx (0060) plus
  --    run_atcs_run_id_idx (0031:131) and run_steps_run_atc_id_idx (0031:181).
  for v_run in
    select r.id, r.workspace_id
      from public.runs r
      where r.status = 'running'
        and coalesce(
              (select max(rs.executed_at)
                 from public.run_steps rs
                 join public.run_atcs ra on ra.id = rs.run_atc_id
                where ra.run_id = r.id),
              r.started_at
            ) < v_cutoff
      order by r.started_at
      for update of r skip locked
  loop
    v_examined := v_examined + 1;

    -- 2a. Re-evaluate under the lock the cursor already holds. A step marked
    --     since the candidate row was read makes the Run fresh again, and real
    --     activity always beats the sweep (AC-E1.1). A Run closed by another
    --     transaction in the meantime drops out on the status predicate.
    select coalesce(
             (select max(rs.executed_at)
                from public.run_steps rs
                join public.run_atcs ra on ra.id = rs.run_atc_id
               where ra.run_id = r.id),
             r.started_at
           )
      into v_last_active
      from public.runs r
      where r.id = v_run.id
        and r.status = 'running';

    if v_last_active is null or v_last_active >= v_cutoff then
      continue;
    end if;

    begin
      -- 2b. The reason. Distinguishable from a person-typed one by the
      --     'Auto-closed by inactivity sweep:' prefix (AC6.1), and ASCII-only
      --     because this string is stored, transported and asserted by tests.
      --     86 chars at a 4-hour threshold, against runs_abort_reason_chk's
      --     3..500 (0036:38-44). The closure time is carried in the text even
      --     though finished_at duplicates it, because RunnerView.tsx:639-653
      --     renders the reason block for an aborted Run while the closure-time
      --     block at :656 renders only for passed/failed — on the runner this
      --     text is the only place a QA Lead sees WHEN the Run was closed.
      v_reason := 'Auto-closed by inactivity sweep: no step activity for '
               || p_threshold_hours::text || 'h (closed '
               || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
               || ' UTC)';

      -- 2c. Close the Run. Mirrors 0067 §2 step 5a.
      update public.runs
        set status       = 'aborted',
            abort_reason = v_reason,
            finished_at  = now(),
            version      = version + 1
        where id = v_run.id;

      -- 2d. Skip every not-yet-executed step; preserve recorded results.
      --     Mirrors 0067 §2 step 5b.
      update public.run_steps rs
        set status = 'skipped'
        from public.run_atcs ra
        where ra.id = rs.run_atc_id
          and ra.run_id = v_run.id
          and rs.status = 'pending';
      get diagnostics v_skipped = row_count;

      -- 2e. Skip still-pending chain positions so the chain reads coherently.
      --     Mirrors 0067 §2 step 5c.
      update public.run_atcs
        set status = 'skipped'
        where run_id = v_run.id
          and status = 'pending';

      -- 2f. Audit. actor_user_id is NULL because no person did this, and
      --     via='sweep' is the machine-readable counterpart to the reason
      --     prefix (AC6.2) — a prefix alone is spoofable by anyone who types
      --     it into the manual abort dialog. `via`'s contract explicitly
      --     tolerates new values (0067 header: an unrecognised value "behaves
      --     identically to NULL from the trigger's point of view … never a new
      --     failure mode").
      insert into public.activity_log
        (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
      values (
        v_run.workspace_id, null, 'run', v_run.id, 'run.aborted',
        jsonb_build_object(
          'reason', v_reason,
          'skipped_steps', v_skipped,
          'via', 'sweep'
        )
      );

      v_swept := v_swept + 1;
    exception
      when others then
        -- One bad Run does not strand the pass. The subtransaction rolls back
        -- this Run's writes only; the next iteration proceeds.
        --
        -- Swallowing the FAILURE is what makes the pass resumable. Swallowing
        -- the DIAGNOSTIC would just hide it: pg_cron's job log keeps only this
        -- function's return jsonb, so without the warning below an operator
        -- reads `"failed": 1` on every tick forever with no way to learn which
        -- Run or why. The warning lands in the Postgres log, where that is
        -- recoverable.
        v_failed := v_failed + 1;
        raise warning 'bunkai_sweep_abandoned_runs: run % failed to close: % (%)',
          v_run.id, sqlerrm, sqlstate;
    end;
  end loop;

  return jsonb_build_object(
    'examined', v_examined,
    'swept', v_swept,
    'failed', v_failed,
    'threshold_hours', p_threshold_hours
  );
end;
$$;


-- ============================================================================
-- 3. Grants — service_role only
-- ============================================================================
--
-- Revoking from PUBLIC is what actually removes the default EXECUTE that
-- `create function` grants; anon and authenticated are then named explicitly
-- so the intent survives a reader who does not know that.
--
-- `service_role` IS granted, and that is not a hole. It is a server-side-only
-- key that never reaches a browser, it maps to no ADR-0001 principal at the
-- HTTP edge (the two are the cookie session and the PAT), and it already
-- bypasses RLS entirely — anyone holding it can run
-- `update public.runs set status = 'aborted'` directly, so this grant adds
-- exactly zero marginal privilege. What it buys is ADR-0012 requirement (6):
-- the DB-integration test in lib/runs/inactivity-sweep-isolation.test.ts
-- connects as service_role, and a sweep that no test can invoke against the
-- real database would ship on the strength of a mock, which proves nothing
-- about a SECURITY DEFINER function.
--
-- The DoS this function could be is reachable only through `authenticated`,
-- and that is exactly the grant withheld.

revoke execute on function public.bunkai_sweep_abandoned_runs(int) from public;
revoke execute on function public.bunkai_sweep_abandoned_runs(int) from anon;
revoke execute on function public.bunkai_sweep_abandoned_runs(int) from authenticated;
grant  execute on function public.bunkai_sweep_abandoned_runs(int) to service_role;


-- ============================================================================
-- 4. Schedule
-- ============================================================================
--
-- Named, so retuning the threshold or the cadence is an upsert on this
-- cron.job row rather than a create-or-replace of a live function. The
-- signature default (4) is the migration-tracked, code-reviewed value; the
-- literal below is the operational one. Both are 4 today.
--
-- Every 15 minutes: an abandoned Run disappears within threshold+0..15 min.

select cron.schedule(
  'bunkai-sweep-abandoned-runs',
  '*/15 * * * *',
  $$select public.bunkai_sweep_abandoned_runs(4)$$
);
