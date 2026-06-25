-- 0037_run_finish.sql — BK-39: Finish a run with a final verdict
--
-- Builds on the Runs foundation (0031_runs.sql, BK-34) and the abort sibling
-- (0036_run_abort.sql, BK-36). ADDITIVE only.
--
-- Adds:
--   * bunkai_finish_run — atomic SECURITY DEFINER finish (run + pending steps)
--
-- No schema change. runs.status already permits 'passed'/'failed' (the
-- runs_status CHECK in 0031_runs.sql) and runs.finished_at already exists — the
-- final verdict IS the run status, so bunkai_run_json (last re-created in
-- 0036_run_abort.sql to surface abort_reason) is unchanged here. A finished run
-- never sets abort_reason, so runs_abort_reason_chk holds via its
-- `status <> 'aborted' AND abort_reason IS NULL` branch.
--
-- Conventions mirror bunkai_abort_run (0036_run_abort.sql): explicit-actor
-- contract, member+ write gate via bunkai_assert_actor_can_write_workspace, row
-- lock (FOR UPDATE) for first-wins serialization, activity_log audit, and the
-- composed-json return via bunkai_run_json.
--
-- Custom SQLSTATE codes allocated for the run domain (class 45xxx, 452xx block;
-- 45203 stays RESERVED for token_expired per 0031_runs.sql; 45204/45205 are used
-- by 0036_run_abort.sql):
--   45206  run_not_finishable       (run is already closed — not 'running')
--   45207  finish_verdict_invalid   (verdict not in passed/failed — RPC backstop)

-- ============================================================================
-- bunkai_finish_run — atomic finish (run + pending steps). SECURITY DEFINER.
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior), identical in shape to
-- bunkai_abort_run:
--   1. Resolve the Run -> workspace_id under a row lock (FOR UPDATE). Missing
--      Run -> not_found (P0002, non-disclosure: matches the read path).
--   2. AuthZ gate: actor must have member+ write access on the workspace (42501,
--      no disclosure). A human cookie session, an AI Test Agent, or a CI pipeline
--      (PAT) all pass the SAME gate — finish handling is executor-agnostic, no
--      bypass. The traceable executor_mode/executor_user_id were stamped at start.
--   3. Status gate: only a 'running' Run can be finished; an already-closed Run
--      (passed/failed/aborted) -> run_not_finishable (45206). First terminal
--      action wins: a concurrent finish/abort loser re-reads a non-running status
--      under the lock and hits this gate (-> 409). This precedes the verdict
--      backstop so a closed Run reports "already closed" regardless of verdict.
--   4. Verdict backstop: must be 'passed' or 'failed' (the Zod layer is the
--      primary guard at the HTTP edge; this protects direct/PAT callers). Else
--      45207. 'aborted' is NOT a finish verdict — abort is its own action (BK-36).
--   5. Mutate atomically: close the Run with the chosen verdict (finished_at =
--      now, version bumped for the optimistic lock), mark every not-yet-executed
--      step ('pending') as 'skipped', and skip any still-pending run_atcs so the
--      chain reads coherently. Already-recorded results (passed/failed/blocked/
--      skipped) are untouched. atcs.status (the Test template) is NEVER touched.
--   6. Emit the run.finished audit. Return the composed Run json.
--
-- Double-submit: the FOR UPDATE lock serializes concurrent finishes; the loser
-- re-reads a terminal status and hits the 45206 gate (first-wins -> 409).

create or replace function public.bunkai_finish_run(
  p_actor_user_id uuid,
  p_run_id        uuid,
  p_verdict       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status       text;
  v_verdict      text := btrim(coalesce(p_verdict, ''));
  v_skipped      int;
begin
  -- 1. Resolve + lock the Run header.
  select workspace_id, status
    into v_workspace_id, v_status
    from public.runs
    where id = p_run_id
    for update;
  if v_workspace_id is null then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: member+ write access. 42501, no disclosure. Human / agent / ci
  --    all pass the same gate — no executor bypass.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 3. Only a running Run can be finished (first terminal action wins).
  if v_status <> 'running' then
    raise exception 'run_not_finishable' using errcode = '45206';
  end if;

  -- 4. Verdict backstop (Zod is the primary guard at the HTTP edge).
  if v_verdict not in ('passed', 'failed') then
    raise exception 'finish_verdict_invalid' using errcode = '45207';
  end if;

  -- 5a. Close the Run with the final verdict (abort_reason stays NULL -> the
  --     runs_abort_reason_chk non-aborted branch holds).
  update public.runs
    set status      = v_verdict,
        finished_at = now(),
        version     = version + 1
    where id = p_run_id;

  -- 5b. Skip every not-yet-executed step; preserve recorded results.
  update public.run_steps rs
    set status = 'skipped'
    from public.run_atcs ra
    where ra.id = rs.run_atc_id
      and ra.run_id = p_run_id
      and rs.status = 'pending';
  get diagnostics v_skipped = row_count;

  -- 5c. Skip still-pending chain positions so the chain reads coherently.
  update public.run_atcs
    set status = 'skipped'
    where run_id = p_run_id
      and status = 'pending';

  -- 6. Audit (DEFINER-only writer).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', p_run_id, 'run.finished',
    jsonb_build_object(
      'verdict', v_verdict,
      'skipped_steps', v_skipped
    )
  );

  return public.bunkai_run_json(p_run_id);
end;
$$;

revoke execute on function public.bunkai_finish_run(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_finish_run(uuid, uuid, text) to authenticated, service_role;
