-- 0040_run_module_snapshot.sql — BK-38: snapshot each Run's module at start
--
-- Builds on the Runs foundation (0031_runs.sql, BK-34) and its later amendments
-- (0036_run_abort.sql, 0037_run_finish.sql). ADDITIVE only.
--
-- Adds:
--   * runs.module_id      — the module of the Test's chain-position-1 ATC,
--                            snapshotted at start (nullable — see Risk R-3)
--   * bunkai_create_run    — re-created to resolve + insert the module snapshot
--   * bunkai_run_json      — re-created to surface module_id + module_name
--
-- Why this exists: BK-38's project-wide Run report needs to group/filter Runs by
-- module, but a Run has no module of its own — only its snapshotted ATC chain
-- does, and a chain can span more than one module. `module_id` resolves that
-- ambiguity once, at start, the same way `test_title` already snapshots the
-- Test's title (0031_runs.sql). Technical Decision D1 (BK-38 implementation
-- plan): when a Test's chain spans multiple ATC modules, the snapshot is the
-- module of the chain's FIRST position — deterministic, no PO input needed.
--
-- `bunkai_create_run`'s body below is reproduced verbatim from 0031_runs.sql
-- (the most recent `create or replace` of this function — 0036/0037 did not
-- touch it) with the minimal module-snapshot addition. This is a deliberately
-- narrow, append-only change to an already-shipped, already-in-production RPC
-- (Risk R-1): `lib/runs/start-run.test.ts` (BK-34's existing regression suite)
-- is re-run against this amended function before merge.
--
-- `bunkai_run_json`'s body is reproduced verbatim from 0036_run_abort.sql (the
-- most recent `create or replace` — 0037 did not touch it, see its own header)
-- with `module_id` + a joined `module_name` added, mirroring the existing
-- `environment_name` join pattern.
--
-- No RLS policy change: `runs` RLS (0031_runs.sql) is already workspace-scoped
-- and does not reference specific columns.
--
-- No new custom SQLSTATE codes are allocated by this migration.

-- ============================================================================
-- 1. runs.module_id — the chain-position-1 module snapshot
-- ============================================================================

alter table public.runs
  add column if not exists module_id uuid references public.modules(id) on delete set null;

-- Backfill existing rows: module_id = the module of the ATC at chain position 1
-- (run_atcs.position = 1), joined through atcs.module_id. A Run whose
-- position-1 run_atcs.atc_id is already NULL (the source ATC was deleted after
-- the Run started — run_atcs.atc_id is `on delete set null`, provenance only)
-- backfills to NULL rather than being silently dropped or defaulted (Risk R-3):
-- such a Run has no module left to recover, and module_id IS NULL is a real,
-- documented state — the UI/API treat it as "no module" (shown under "All
-- modules", excluded when a specific module filter is applied). A Run whose
-- run_atcs set has no position = 1 row at all (should not occur given
-- bunkai_create_run always walks the chain from position 1, but is not
-- structurally impossible) is left at the column's NULL default for the same
-- reason.
update public.runs r
set module_id = sub.module_id
from (
  select ra.run_id, a.module_id
  from public.run_atcs ra
  left join public.atcs a on a.id = ra.atc_id
  where ra.position = 1
) sub
where sub.run_id = r.id;

-- ============================================================================
-- 2. bunkai_run_json — re-created to surface module_id + module_name
-- ============================================================================
-- Identical to 0036_run_abort.sql §2 plus the `module_id` / `module_name`
-- fields (mirrors the existing `environment_name` join pattern). SECURITY /
-- grants unchanged below.

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
    'module_id', r.module_id,
    'module_name', (
      select m.name from public.modules m where m.id = r.module_id
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
-- 3. bunkai_create_run — re-created to resolve + insert the module snapshot
-- ============================================================================
-- Identical to 0031_runs.sql §6 plus: declare v_module_id, resolve it from the
-- chain-position-1 ATC's module (Technical Decision D1) once the
-- no_executable_steps / environment_invalid gates have passed and the
-- idempotency replay path has been ruled out, and insert it into the `runs`
-- row. Every other validation step, order, and side effect is unchanged
-- verbatim (Risk R-1 — this is an already-shipped, already-in-production RPC).

create or replace function public.bunkai_create_run(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_environment_id uuid,
  p_executor_mode text,
  p_start_token   text
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

  -- 6. Insert the header.
  insert into public.runs (
    workspace_id, project_id, test_id, environment_id, module_id,
    status, executor_mode, executor_user_id, start_token, test_title
  )
  values (
    v_workspace_id, v_project_id, p_test_id, p_environment_id, v_module_id,
    'running', p_executor_mode, p_actor_user_id, p_start_token, v_test_title
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

revoke execute on function public.bunkai_create_run(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.bunkai_create_run(uuid, uuid, uuid, text, text) to authenticated, service_role;
