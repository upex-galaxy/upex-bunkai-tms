-- 0122_streamed_run_step_results.sql — BK-223: stream step results during an automated run
--
-- ADDITIVE and idempotent (drop-if-exists + create-or-replace; the cron job is
-- re-scheduled by name). The start, mark, finish and abort endpoints already
-- exist (BK-34, BK-35, BK-39, BK-36); this migration closes the three gaps the
-- streaming contract needs:
--
--   1. bunkai_mark_run_step   — re-created with `p_via text default null`. For a
--      bearer caller only (an API client), re-reporting a step that already has a
--      result is idempotent when status, note and evidence are identical (the
--      stored result comes back, nothing is written, executed_at does not move so
--      a retry never extends a run's life) and a conflict (45239) when the status
--      or content differs. A cookie session (p_via null or 'cookie') keeps
--      BK-35's last-write-wins correction. Body = the live 0042 function; the
--      live prosrc was read from the database before this file was written.
--   2. bunkai_create_run      — re-created with `p_token_id uuid default null`.
--      A run started by an access token snapshots the token name into
--      runs.executor_name (fallback 'API token') and the token id into
--      runs.executor_token_id, the same provenance BK-222 writes for a
--      submitted run. Body = the live 0040 function plus that snapshot.
--   3. bunkai_sweep_inactive_agent_runs + a pg_cron job — closes `agent` and `ci`
--      runs with no step report for 60 minutes (reason "Inactivity timeout: ...",
--      via 'sweep'). The BK-269 sweep (0075) and its 4 hour threshold are left
--      untouched: it keeps serving human runs, and an agent or ci run is always
--      closed here long before the 4 hour mark, so the two never fight over a run.
--
-- Both live functions get a new defaulted parameter, so the old signature is
-- dropped first (a create-or-replace with a different argument list would leave
-- two overloads and PostgREST would answer 'could not choose the best candidate'
-- — same reason 0067 drops before re-creating). Existing named-argument callers
-- keep working because the new parameters default to NULL.
--
-- SQLSTATE block (45239 is the next free code after 0121's 45231-45238):
--   45239  run_step_conflict   bearer re-report of a reported step with a
--                              different status / note / evidence (HTTP 409)
-- Reused: 45215 sweep_threshold_invalid (0075), 45212 run_step_marking_closed.
--
-- ADR-0012 (RPC authorization invariant), the six questions, for the two
-- re-created functions: unchanged from 0040 / 0042 (member+ gate through
-- bunkai_assert_actor_can_write_workspace, result scoped from the run row). The
-- new p_via and p_token_id are NOT identity or scope parameters: p_via is a
-- channel descriptor (the 0067 convention) that can only make a call STRICTER
-- (a spoofed 'bearer' makes the caller subject to the conflict rule, never
-- exempt from a gate); p_token_id is resolved against access_tokens bound to the
-- actor (user_id = p_actor_user_id, not revoked, not expired), so a foreign or
-- dead token id yields no name and the run is attributed to nobody. The new sweep
-- function takes no identity and is granted to service_role only (the 0075
-- reasoning). DB-integration test: lib/runs/streaming-isolation.test.ts.

-- ============================================================================
-- 1. bunkai_mark_run_step — bearer idempotent re-report + conflict
-- ============================================================================

drop function if exists public.bunkai_mark_run_step(uuid, uuid, uuid, text, text, text);

create or replace function public.bunkai_mark_run_step(
  p_actor_user_id uuid,
  p_run_id        uuid,
  p_run_step_id   uuid,
  p_status        text,
  p_note          text,
  p_evidence_url  text,
  p_via           text default null
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
  v_previous_note   text;
  v_previous_evid   text;
  v_note            text := nullif(btrim(coalesce(p_note, '')), '');
  v_evidence_url    text := nullif(btrim(coalesce(p_evidence_url, '')), '');
  v_pending_count   int;
  v_failed_count    int;
  v_blocked_count   int;
  v_new_verdict     text;
begin
  -- 1. Resolve step -> run_atc -> run, locking ONLY the `runs` row.
  select rs.run_atc_id, r.workspace_id, r.status, rs.status, rs.note, rs.evidence_url
    into v_run_atc_id, v_workspace_id, v_run_status, v_previous_status,
         v_previous_note, v_previous_evid
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

  -- 4b. BK-223 — an API client reporting a step that already has a result.
  --     Identical (status, note, evidence): hand back the stored result and write
  --     nothing, so executed_at (the idle clock) does not move and a retry never
  --     extends the run's life. Anything else is a conflict. The row lock taken
  --     in step 1 serializes two simultaneous reports: the loser re-reads the
  --     winner's status here. A cookie session never takes this branch.
  if p_via = 'bearer' and v_previous_status <> 'pending' then
    if v_previous_status = p_status
       and v_previous_note is not distinct from v_note
       and v_previous_evid is not distinct from v_evidence_url then
      return public.bunkai_run_json(p_run_id);
    end if;
    raise exception 'run_step_conflict' using errcode = '45239';
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

  -- 9. Return the composed Run json.
  return public.bunkai_run_json(p_run_id);
end;
$$;

revoke execute on function public.bunkai_mark_run_step(uuid, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.bunkai_mark_run_step(uuid, uuid, uuid, text, text, text, text) to authenticated, service_role;

-- ============================================================================
-- 2. bunkai_create_run — snapshot the token name into runs.executor_name
-- ============================================================================

drop function if exists public.bunkai_create_run(uuid, uuid, uuid, text, text);

create or replace function public.bunkai_create_run(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_environment_id uuid,
  p_executor_mode text,
  p_start_token   text,
  p_token_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_project_id     uuid;
  v_test_title     text;
  v_project_count  int;
  v_step_count     int;
  v_existing_id    uuid;
  v_module_id      uuid;
  v_run_id         uuid;
  v_run_atc_id     uuid;
  v_token_id       uuid;
  v_executor_name  text;
  v_atc            record;
  v_step           record;
begin
  -- 1. Resolve the Test (workspace + title). Non-disclosure on missing/foreign.
  select workspace_id, title
    into v_workspace_id, v_test_title
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    -- Mirror the read-path non-disclosure: a non-member must not learn the Test exists.
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Resolve the Test's project from its chain (a Test's chained ATCs are single-project).
  -- (min(uuid) is not an aggregate; take any distinct project id via array_agg.)
  select count(distinct p.id), (array_agg(distinct p.id))[1]
    into v_project_count, v_project_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    join public.projects p on p.id = a.project_id
    where ts.test_id = p_test_id;

  -- AuthZ: actor must have member+ write access on the workspace. 42501, no disclosure.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 2. Executor mode.
  if p_executor_mode is null or p_executor_mode not in ('human', 'agent', 'ci') then
    raise exception 'executor_mode_invalid' using errcode = '45200';
  end if;

  -- 4. Executable-steps gate (count BEFORE env check would also work; we keep the
  --    plan's order: env first so a misconfigured env surfaces even on an empty Test).
  --    Count atc_steps reachable via test_steps -> atcs for this Test.
  select count(rs_step.id)
    into v_step_count
    from public.test_steps ts
    join public.atc_steps rs_step on rs_step.atc_id = ts.atc_id
    where ts.test_id = p_test_id;

  -- 3. Environment must belong to the Test's Project.
  --    (If the chain is empty there is no project to validate against -> the
  --    no_executable_steps gate below is the authoritative block; but when a project
  --    exists we validate env containment first per the plan's order.)
  if v_project_id is null then
    -- No chain at all -> cannot resolve a project; the Test has no executable steps.
    raise exception 'no_executable_steps' using errcode = '45202';
  end if;

  if not exists (
    select 1 from public.project_environments pe
    where pe.id = p_environment_id
      and pe.project_id = v_project_id
  ) then
    raise exception 'environment_invalid' using errcode = '45201';
  end if;

  if v_step_count = 0 then
    raise exception 'no_executable_steps' using errcode = '45202';
  end if;

  -- 5. Domain idempotency: same (test_id, start_token) within 24h -> return existing.
  --    Take the project write-lock first so concurrent same-token starts serialize and
  --    the lookup-before-insert is race-free (no partial unique index is possible on a
  --    now()-relative predicate; ADR-0004 / TD-3).
  perform 1 from public.projects where id = v_project_id for update;

  select id into v_existing_id
    from public.runs
    where test_id = p_test_id
      and start_token = p_start_token
      and started_at > now() - interval '24 hours'
    order by started_at desc
    limit 1;
  if v_existing_id is not null then
    -- Replay: same (test_id, start_token) within 24h. Tag the response so the
    -- HTTP layer can answer 200 (replay) vs 201 (created) deterministically.
    return public.bunkai_run_json(v_existing_id) || jsonb_build_object('replayed', true);
  end if;

  -- Resolve v_module_id: the module of the chain-position-1 ATC (Technical
  -- Decision D1 — a Test's chain may span multiple ATC modules; the snapshot
  -- is deliberately the module of the FIRST chain position, a deterministic
  -- tie-break). test_steps.atc_id is NOT NULL (FK ... on delete restrict) and
  -- atcs.module_id is NOT NULL, so this always resolves for a Test that has
  -- passed the no_executable_steps gate above.
  select a.module_id
    into v_module_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
      and ts.position = 1;

  -- BK-223 — provenance of a run started with an access token: the actor's own,
  -- active token. An unresolvable token id attributes the run to nobody (both
  -- columns stay NULL), it never blocks the start. The name is snapshotted, so
  -- renaming or revoking the token later does not rewrite the run header.
  if p_token_id is not null then
    select t.id, left(coalesce(nullif(btrim(t.name), ''), 'API token'), 200)
      into v_token_id, v_executor_name
      from public.access_tokens t
      where t.id = p_token_id
        and t.user_id = p_actor_user_id
        and t.revoked_at is null
        and (t.expires_at is null or t.expires_at > now());
  end if;

  -- 6. Insert the header.
  insert into public.runs (
    workspace_id, project_id, test_id, environment_id, module_id,
    status, executor_mode, executor_user_id, executor_token_id, executor_name,
    start_token, test_title
  )
  values (
    v_workspace_id, v_project_id, p_test_id, p_environment_id, v_module_id,
    'running', p_executor_mode, p_actor_user_id, v_token_id, v_executor_name,
    p_start_token, v_test_title
  )
  returning id into v_run_id;

  -- Snapshot-walk the chain in position order: run_atcs then run_steps.
  for v_atc in
    select ts.position as chain_position, a.id as atc_id, a.title as atc_title
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
    order by ts.position
  loop
    insert into public.run_atcs (run_id, atc_id, position, atc_title, status)
    values (v_run_id, v_atc.atc_id, v_atc.chain_position, v_atc.atc_title, 'pending')
    returning id into v_run_atc_id;

    for v_step in
      select s.id as atc_step_id, s.position, s.content, s.input_data, s.expected
      from public.atc_steps s
      where s.atc_id = v_atc.atc_id
      order by s.position
    loop
      insert into public.run_steps (
        run_atc_id, atc_step_id, position, content, input_data, expected, status
      )
      values (
        v_run_atc_id, v_step.atc_step_id, v_step.position,
        v_step.content, v_step.input_data, v_step.expected, 'pending'
      );
    end loop;
  end loop;

  -- 7. Audit (DEFINER-only writer).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', v_run_id, 'run.started',
    jsonb_build_object(
      'test_id', p_test_id,
      'environment_id', p_environment_id,
      'executor_mode', p_executor_mode,
      'step_count', v_step_count
    )
  );

  -- Freshly created (not a replay).
  return public.bunkai_run_json(v_run_id) || jsonb_build_object('replayed', false);
end;
$$;

revoke execute on function public.bunkai_create_run(uuid, uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.bunkai_create_run(uuid, uuid, uuid, text, text, uuid) to authenticated, service_role;

-- ============================================================================
-- 3. bunkai_sweep_inactive_agent_runs — close idle agent / ci runs. DEFINER.
-- ============================================================================
--
-- Same close sequence, lock discipline and per-run isolation as 0075
-- (bunkai_sweep_abandoned_runs), which stays the canonical shape; the two
-- differences are the unit (minutes, so 60 is expressible) and the candidate
-- filter (executor_mode in ('agent', 'ci')). Idle time is
-- coalesce(max(run_steps.executed_at), runs.started_at), the signal 0075 and the
-- Home widget already agree on. An identical bearer re-report does not move it
-- (section 1), so retries cannot keep a dead run alive.
--
-- The reason starts with "Inactivity timeout" so it reads distinct from a
-- person-typed one; via = 'sweep' is the machine-readable counterpart. A swept
-- run is closed (aborted): a later step report or finish gets 409, and the
-- caller must start a new run with a NEW start_token (the same token inside 24 h
-- replays the aborted run, see bunkai_create_run step 5).

create or replace function public.bunkai_sweep_inactive_agent_runs(
  p_threshold_minutes int default 60
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
  -- 1. Threshold floor: a 0 (or negative) threshold would close every running
  --    agent / ci run on the next tick, so it is refused rather than clamped.
  if p_threshold_minutes is null or p_threshold_minutes < 1 then
    raise exception 'sweep_threshold_invalid' using errcode = '45215';
  end if;

  v_cutoff := now() - make_interval(mins => p_threshold_minutes);

  -- 2. Candidate pass: running agent / ci runs only; a human run is never touched.
  for v_run in
    select r.id, r.workspace_id
      from public.runs r
      where r.status = 'running'
        and r.executor_mode in ('agent', 'ci')
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

    -- 2a. Re-evaluate under the lock the cursor holds: a step reported since the
    --     candidate row was read makes the run fresh again; real activity beats
    --     the sweep.
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
      v_reason := 'Inactivity timeout: no step activity for '
               || p_threshold_minutes::text || ' minutes';

      -- 2b. Close the run (mirrors 0067 section 2 step 5a).
      update public.runs
        set status       = 'aborted',
            abort_reason = v_reason,
            finished_at  = now(),
            version      = version + 1
        where id = v_run.id;

      -- 2c. Skip every not-yet-executed step; reported results are preserved.
      update public.run_steps rs
        set status = 'skipped'
        from public.run_atcs ra
        where ra.id = rs.run_atc_id
          and ra.run_id = v_run.id
          and rs.status = 'pending';
      get diagnostics v_skipped = row_count;

      -- 2d. Skip still-pending chain positions.
      update public.run_atcs
        set status = 'skipped'
        where run_id = v_run.id
          and status = 'pending';

      -- 2e. Audit: no person did this (actor NULL), via 'sweep'.
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
        -- One bad run does not strand the pass; the warning keeps the diagnostic
        -- recoverable from the Postgres log (pg_cron's log keeps only the jsonb).
        v_failed := v_failed + 1;
        raise warning 'bunkai_sweep_inactive_agent_runs: run % failed to close: % (%)',
          v_run.id, sqlerrm, sqlstate;
    end;
  end loop;

  return jsonb_build_object(
    'examined', v_examined,
    'swept', v_swept,
    'failed', v_failed,
    'threshold_minutes', p_threshold_minutes
  );
end;
$$;

-- service_role only (the 0075 reasoning): a function that closes idle runs in
-- every workspace must never be reachable over PostgREST by a signed-in user.
revoke execute on function public.bunkai_sweep_inactive_agent_runs(int) from public;
revoke execute on function public.bunkai_sweep_inactive_agent_runs(int) from anon;
revoke execute on function public.bunkai_sweep_inactive_agent_runs(int) from authenticated;
grant  execute on function public.bunkai_sweep_inactive_agent_runs(int) to service_role;

-- ============================================================================
-- 4. Schedule — every 5 minutes, named (cron.schedule upserts by name)
-- ============================================================================
--
-- A silent agent run disappears within threshold + 0..5 minutes. The signature
-- default (60) is the code-reviewed value; the literal below is the operational
-- one. pg_cron exists since 0075.

select cron.schedule(
  'bunkai-sweep-inactive-agent-runs',
  '*/5 * * * *',
  $$select public.bunkai_sweep_inactive_agent_runs(60)$$
);
