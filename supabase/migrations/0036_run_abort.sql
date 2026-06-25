-- 0036_run_abort.sql — BK-36: Abort a run in progress with a reason
--
-- Builds on the Runs foundation (0031_runs.sql, BK-34). ADDITIVE only.
--
-- Adds:
--   * runs.abort_reason          — the reason captured when a run is aborted
--   * runs_abort_reason_chk      — table CHECK keeping reason ⇔ aborted coherent
--   * bunkai_run_json            — re-created to surface abort_reason
--   * bunkai_abort_run           — atomic SECURITY DEFINER abort (run + steps)
--
-- Conventions mirror bunkai_create_run (0031_runs.sql): explicit-actor contract,
-- member+ write gate via bunkai_assert_actor_can_write_workspace, row lock
-- (FOR UPDATE) for double-submit serialization, activity_log audit, and the
-- composed-json return via bunkai_run_json.
--
-- Custom SQLSTATE codes allocated for the run domain (class 45xxx, 452xx block;
-- 45203 stays RESERVED for token_expired per 0031_runs.sql):
--   45204  run_not_abortable        (run is already closed — not 'running')
--   45205  abort_reason_too_short   (trimmed reason outside 3..500 — RPC backstop)

-- ============================================================================
-- 1. runs.abort_reason — the captured reason (member-visible afterward)
-- ============================================================================
--
-- Nullable: only aborted runs carry a reason. PO decision: 3..500 chars,
-- trimmed at both client and server. The CHECK keeps the column coherent with
-- the run status so a non-aborted run can never hold a stray reason and an
-- aborted run can never lack one. All pre-existing rows are running/passed/failed
-- with a NULL reason → they satisfy the `status <> 'aborted' AND reason IS NULL`
-- branch, so the constraint is valid without a backfill.

alter table public.runs
  add column if not exists abort_reason text;

alter table public.runs
  drop constraint if exists runs_abort_reason_chk;
alter table public.runs
  add constraint runs_abort_reason_chk check (
    (status = 'aborted'
      and abort_reason is not null
      and char_length(btrim(abort_reason)) between 3 and 500)
    or
    (status <> 'aborted' and abort_reason is null)
  );

-- ============================================================================
-- 2. bunkai_run_json — re-created to surface abort_reason
-- ============================================================================
-- Identical to 0031_runs.sql §5 plus the `abort_reason` field. SECURITY/grants
-- unchanged below.

create or replace function public.bunkai_run_json(p_run_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'workspace_id', r.workspace_id,
    'project_id', r.project_id,
    'test_id', r.test_id,
    'environment_id', r.environment_id,
    'environment_name', (
      select pe.name from public.project_environments pe where pe.id = r.environment_id
    ),
    'status', r.status,
    'abort_reason', r.abort_reason,
    'executor_mode', r.executor_mode,
    'executor_user_id', r.executor_user_id,
    'test_title', r.test_title,
    'version', r.version,
    'started_at', r.started_at,
    'finished_at', r.finished_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'atc_count', (select count(*) from public.run_atcs ra where ra.run_id = r.id),
    'step_count', (
      select count(*)
      from public.run_steps rs
      join public.run_atcs ra on ra.id = rs.run_atc_id
      where ra.run_id = r.id
    ),
    'atcs', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', ra.id,
                 'atc_id', ra.atc_id,
                 'position', ra.position,
                 'atc_title', ra.atc_title,
                 'status', ra.status,
                 'steps', coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'id', rs.id,
                              'atc_step_id', rs.atc_step_id,
                              'position', rs.position,
                              'content', rs.content,
                              'input_data', rs.input_data,
                              'expected', rs.expected,
                              'status', rs.status,
                              'note', rs.note,
                              'evidence_url', rs.evidence_url,
                              'executed_at', rs.executed_at
                            ) order by rs.position)
                     from public.run_steps rs
                     where rs.run_atc_id = ra.id), '[]'::jsonb)
               ) order by ra.position)
        from public.run_atcs ra
        where ra.run_id = r.id), '[]'::jsonb)
  )
  from public.runs r
  where r.id = p_run_id;
$$;

revoke execute on function public.bunkai_run_json(uuid) from public, anon;
grant execute on function public.bunkai_run_json(uuid) to authenticated, service_role;

-- ============================================================================
-- 3. bunkai_abort_run — atomic abort (run + pending steps). SECURITY DEFINER.
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior):
--   1. Resolve the Run -> workspace_id under a row lock (FOR UPDATE). Missing
--      Run -> not_found (P0002, non-disclosure: matches the read path).
--   2. AuthZ gate: actor must have member+ write access on the workspace
--      (42501, no disclosure). Viewers are rejected here, server-side — the UI
--      hide is secondary.
--   3. Status gate: only a 'running' Run can be aborted; an already-closed Run
--      (passed/failed/aborted) -> run_not_abortable (45204). This precedes the
--      reason backstop so a closed Run reports "already closed" regardless of
--      the reason. The HTTP layer validates reason shape (3..500) BEFORE the RPC,
--      so the AC2 "reason too short" path never reaches a closed-Run conflict.
--   4. Reason backstop: trimmed length must be 3..500, else 45205. The Zod layer
--      is the primary guard; this protects direct/PAT callers.
--   5. Mutate atomically: close the Run as 'aborted' (finished_at = now, version
--      bumped for the optimistic lock), mark every not-yet-executed step
--      ('pending') as 'skipped', and skip any still-pending run_atcs so the
--      chain reads coherently. Already-recorded results (passed/failed/blocked/
--      skipped) are untouched. atcs.status (the Test template) is NEVER touched.
--   6. Emit the run.aborted audit. Return the composed Run json.
--
-- Double-submit: the FOR UPDATE lock serializes concurrent aborts; the loser
-- re-reads status = 'aborted' and hits the 45204 gate (first-wins -> 409).

create or replace function public.bunkai_abort_run(
  p_actor_user_id uuid,
  p_run_id        uuid,
  p_reason        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status       text;
  v_reason       text := btrim(coalesce(p_reason, ''));
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

  -- 2. AuthZ: member+ write access. 42501, no disclosure.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 3. Only a running Run can be aborted.
  if v_status <> 'running' then
    raise exception 'run_not_abortable' using errcode = '45204';
  end if;

  -- 4. Reason backstop (Zod is the primary guard at the HTTP edge).
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'abort_reason_too_short' using errcode = '45205';
  end if;

  -- 5a. Close the Run.
  update public.runs
    set status      = 'aborted',
        abort_reason = v_reason,
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
    v_workspace_id, p_actor_user_id, 'run', p_run_id, 'run.aborted',
    jsonb_build_object(
      'reason', v_reason,
      'skipped_steps', v_skipped
    )
  );

  return public.bunkai_run_json(p_run_id);
end;
$$;

revoke execute on function public.bunkai_abort_run(uuid, uuid, text) from public, anon;
grant execute on function public.bunkai_abort_run(uuid, uuid, text) to authenticated, service_role;
