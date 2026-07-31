-- 0042_run_step_mark.sql — BK-35: mark a run step pass/fail/block
--
-- Builds on the Runs foundation (0031_runs.sql, BK-34) and its abort/finish
-- siblings (0036_run_abort.sql, 0037_run_finish.sql, BK-36/BK-39). ADDITIVE
-- only — no schema change: run_steps.status/note/evidence_url/executed_at
-- already exist (0031, commented "-- BK-35 will write").
--
-- Adds:
--   * bunkai_mark_run_step — atomic SECURITY DEFINER mark (one run_steps row
--     + a conditional run_atcs.status verdict recompute)
--
-- No bunkai_run_json change: the mark response reuses the composer as-is
-- (last re-created in 0040_run_module_snapshot.sql) — it already surfaces
-- every run_steps column this story writes.
--
-- Conventions mirror bunkai_abort_run / bunkai_finish_run: explicit-actor
-- contract, member+ write gate via bunkai_assert_actor_can_write_workspace,
-- a row lock (FOR UPDATE) on `runs` to serialize concurrent marks against
-- each other AND against a concurrent abort/finish on the same run (the
-- ATP's BK-39-race scenario), an activity_log audit insert, and the composed
-- Run json return.
--
-- Custom SQLSTATE codes allocated for the run domain (class 45xxx, 452xx
-- block; 45203 RESERVED per 0031; 45204/45205 in 0036; 45206/45207 in 0037;
-- 45208 in 0038; 45209 in 0039; 45210/45211 in 0032):
--   45212  run_step_marking_closed   (run is already closed — not 'running')
--   45213  step_status_invalid       (status not in passed/failed/blocked —
--                                      RPC backstop; 'pending' is never
--                                      accepted, so a re-mark-to-pending
--                                      attempt lands here too)

-- ============================================================================
-- bunkai_mark_run_step — atomic step mark + verdict recompute. SECURITY DEFINER.
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior), mirrors
-- bunkai_abort_run/bunkai_finish_run in shape:
--   1. Resolve the step -> its run_atc_id -> the parent run_atcs.run_id ->
--      runs.workspace_id/status, filtering on BOTH rs.id = p_run_step_id AND
--      ra.run_id = p_run_id in one joined SELECT, under FOR UPDATE OF the
--      `runs` row. A step that doesn't exist, or that belongs to a DIFFERENT
--      run than p_run_id, collapses to the SAME not-found code as a missing
--      run (P0002, non-disclosure — matches bunkai_abort_run's convention).
--      Locking `runs` here (not run_steps/run_atcs) is what serializes this
--      call against a concurrent mark on a sibling step of the same run AND
--      against a concurrent bunkai_abort_run/bunkai_finish_run — whichever
--      transaction's SELECT ... FOR UPDATE commits first decides the run's
--      status for every loser that was waiting on the lock.
--   2. AuthZ gate: actor must have member+ write access on the workspace
--      (42501, no disclosure) — the same run:execute / member+ tier BK-36/39
--      already use (Q4). Viewers are rejected here, server-side.
--   3. Status gate: only a 'running' Run accepts new step results; a Run
--      already closed (passed/failed/aborted) -> run_step_marking_closed
--      (45212). This precedes the status-value backstop so a closed Run
--      reports "already closed" regardless of the requested status (mirrors
--      abort/finish's own precedence between their status gate and their
--      value backstop).
--   4. Status backstop: p_status must be 'passed', 'failed', or 'blocked'.
--      'pending' is never an accepted value, so a client attempting to
--      re-mark a step back to pending lands on the SAME 45213 as any other
--      invalid value — no separate guard is needed (ATP "reject re-mark to
--      pending" is satisfied structurally). The Zod layer is the primary
--      guard at the HTTP edge; this protects direct/PAT callers.
--   5. Normalize note/evidence_url: empty-or-whitespace-only collapses to
--      NULL (Q8's ATP resolution — "normalize to null, not reject"). Neither
--      is otherwise validated here — D7: unlike abort_reason, these columns
--      carry no state-machine invariant to protect at the DB level; length/
--      URL-shape validation lives at the Zod layer only (same precedent as
--      content/expected/test_title, which are also uncapped at the DB).
--   6. UPDATE-in-place the run_steps row (Q7 — no history table; "most
--      recent result stands" is the business rule, and the schema has no
--      column for it either).
--   7. Recompute the parent run_atcs verdict from ALL its sibling run_steps
--      (AC2's 8 combinations): any sibling still 'pending' -> the verdict
--      itself stays 'pending' (D1 — 'pending' IS the PO's "unrun" state, no
--      new enum value; Q1's resolution: verdict is computed once the LAST
--      pending step resolves, not before). Once no sibling is pending:
--      'failed' if any step failed (fail overrides everything else), else
--      'blocked' if any step is blocked, else 'passed'. Recomputing from the
--      full current sibling set (not incrementally) is what makes AC6's
--      last-write-wins re-mark immediately correct — a step flipping from
--      passed to failed recalculates the verdict the same way a first-time
--      mark does, no separate "undo" path needed.
--   8. Audit: activity_log, entity_type='run_step', entity_id=the marked
--      run_steps.id, action='run_step.marked', payload carries the parent
--      run_atc_id + the new/previous step status (DEFINER-only writer).
--   9. Return bunkai_run_json(p_run_id) — unchanged composer, already
--      surfaces status/note/evidence_url/executed_at per run_steps row and
--      status per run_atcs row.
--
-- Double-submit / re-mark: UPDATE-in-place means two calls marking the SAME
-- step just overwrite each other under the `runs` row lock — last commit
-- wins (AC6), no conflict error. This is a deliberate difference from
-- abort/finish's first-wins 409: those close a whole Run exactly once, this
-- mutates one step repeatedly by design.

create or replace function public.bunkai_mark_run_step(
  p_actor_user_id uuid,
  p_run_id        uuid,
  p_run_step_id   uuid,
  p_status        text,
  p_note          text,
  p_evidence_url  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_atc_id      uuid;
  v_workspace_id    uuid;
  v_run_status      text;
  v_previous_status text;
  v_note            text := nullif(btrim(coalesce(p_note, '')), '');
  v_evidence_url    text := nullif(btrim(coalesce(p_evidence_url, '')), '');
  v_pending_count   int;
  v_failed_count    int;
  v_blocked_count   int;
  v_new_verdict     text;
begin
  -- 1. Resolve step -> run_atc -> run, locking ONLY the `runs` row.
  select rs.run_atc_id, r.workspace_id, r.status, rs.status
    into v_run_atc_id, v_workspace_id, v_run_status, v_previous_status
    from public.run_steps rs
    join public.run_atcs ra on ra.id = rs.run_atc_id
    join public.runs r on r.id = ra.run_id
    where rs.id = p_run_step_id
      and ra.run_id = p_run_id
    for update of r;

  if v_run_atc_id is null then
    raise exception 'run_step_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: member+ write access. 42501, no disclosure.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 3. Only a running Run accepts new step results.
  if v_run_status <> 'running' then
    raise exception 'run_step_marking_closed' using errcode = '45212';
  end if;

  -- 4. Status backstop (Zod is the primary guard at the HTTP edge). 'pending'
  --    is never accepted, so a re-mark-to-pending attempt lands here too.
  if p_status is null or p_status not in ('passed', 'failed', 'blocked') then
    raise exception 'step_status_invalid' using errcode = '45213';
  end if;

  -- 5/6. Normalize (declared above) + UPDATE-in-place (Q7).
  update public.run_steps
    set status       = p_status,
        note         = v_note,
        evidence_url = v_evidence_url,
        executed_at  = now()
    where id = p_run_step_id;

  -- 7. Recompute the parent ATC verdict from the full current sibling set.
  select
      count(*) filter (where status = 'pending'),
      count(*) filter (where status = 'failed'),
      count(*) filter (where status = 'blocked')
    into v_pending_count, v_failed_count, v_blocked_count
    from public.run_steps
    where run_atc_id = v_run_atc_id;

  v_new_verdict := case
    when v_pending_count > 0 then 'pending'
    when v_failed_count > 0 then 'failed'
    when v_blocked_count > 0 then 'blocked'
    else 'passed'
  end;

  update public.run_atcs
    set status = v_new_verdict
    where id = v_run_atc_id;

  -- 8. Audit (DEFINER-only writer).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run_step', p_run_step_id, 'run_step.marked',
    jsonb_build_object(
      'run_atc_id', v_run_atc_id,
      'status', p_status,
      'previous_status', v_previous_status
    )
  );

  -- 9. Return the composed Run json (unchanged, per header note).
  return public.bunkai_run_json(p_run_id);
end;
$$;

revoke execute on function public.bunkai_mark_run_step(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.bunkai_mark_run_step(uuid, uuid, uuid, text, text, text) to authenticated, service_role;
