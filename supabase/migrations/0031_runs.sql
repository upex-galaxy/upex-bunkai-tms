-- 0031_runs.sql — BK-34: Start a manual Run (Runs epic foundation)
--
-- Introduces the Manual Execution & Runs data-model foundation (epic BK-30).
-- See ADR-0004 (Run snapshot model + project environments entity) and the BK-34
-- implementation-plan §2. This migration is ADDITIVE only.
--
-- Adds:
--   * project_environments  — greenfield first-class entity a Run targets (FK)
--   * runs                  — Run header (the row BK-35→39 extend)
--   * run_atcs              — snapshot of each chain position at start
--   * run_steps             — snapshot of each executable step at start
--   * bunkai_create_run     — atomic SECURITY DEFINER create (snapshot walk)
--   * bunkai_run_json       — nested jsonb composer (header + run_atcs + run_steps)
--   * bunkai_get_run_expanded — membership-gated read
--
-- Conventions mirror 0024_tests.sql (create RPC + audit + RLS), 0025_test_read.sql
-- (nested jsonb read), 0021_atc_create_update.sql (write-gate that returns workspace_id),
-- and 0005_rls_helpers.sql (bunkai_is_workspace_member / bunkai_can_write_workspace).
--
-- Custom SQLSTATE codes allocated for the run domain (class 45xxx, 452xx block):
--   45200  executor_mode_invalid
--   45201  environment_invalid       (env not configured for the Test's project)
--   45202  no_executable_steps       (Test has zero executable steps)
--   45203  RESERVED — token_expired  (PO-pending §4 Q1; not implemented this story)

-- ============================================================================
-- 1. project_environments (greenfield — no env schema existed before BK-34)
-- ============================================================================

create table if not exists public.project_environments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  created_at  timestamptz not null default now()
);

-- One "Staging" per project, case-insensitive.
create unique index if not exists project_environments_project_name_idx
  on public.project_environments (project_id, lower(name));

alter table public.project_environments enable row level security;

-- SELECT for the project's workspace members. NO client write policy for MVP:
-- environments are seeded by migration / a future env-management story. Default-deny
-- keeps the table closed until an env-CRUD story ships (ADR-0004).
drop policy if exists project_environments_select_workspace_member on public.project_environments;
create policy project_environments_select_workspace_member
  on public.project_environments
  for select
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_environments.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

-- Seed Staging + Production for every existing project (PO-pending default names — §4 Q-env).
-- New projects do NOT get environments automatically yet — a future env-management
-- story owns that. Idempotent via the unique (project_id, lower(name)) index.
insert into public.project_environments (project_id, name)
select p.id, e.name
from public.projects p
cross join (values ('Staging'), ('Production')) as e(name)
on conflict do nothing;

-- ============================================================================
-- 2. runs (Run header — the row the whole tail extends)
-- ============================================================================

create table if not exists public.runs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  project_id       uuid not null references public.projects(id) on delete cascade,
  test_id          uuid not null references public.tests(id) on delete restrict,
  environment_id   uuid not null references public.project_environments(id) on delete restrict,
  -- 'running' now; passed/failed are BK-39 verdict targets, aborted is BK-36.
  status           text not null default 'running'
                     check (status in ('running', 'passed', 'failed', 'aborted')),
  executor_mode    text not null check (executor_mode in ('human', 'agent', 'ci')),
  executor_user_id uuid references auth.users(id) on delete set null,
  start_token      text not null check (char_length(start_token) between 1 and 200),
  test_title       text not null,                 -- snapshot of the Test title at start
  version          int  not null default 1,       -- optimistic lock for BK-35/39
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,                   -- BK-39 sets this
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists runs_test_id_started_at_idx on public.runs (test_id, started_at desc);
create index if not exists runs_project_id_idx on public.runs (project_id);
create index if not exists runs_workspace_id_idx on public.runs (workspace_id);

create trigger runs_set_updated_at
  before update on public.runs
  for each row execute function public.bunkai_set_updated_at();

alter table public.runs enable row level security;

drop policy if exists runs_select_workspace_member on public.runs;
create policy runs_select_workspace_member
  on public.runs
  for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

-- INSERT is performed by bunkai_create_run (SECURITY DEFINER); no client INSERT policy
-- needed, but provide one consistent with the member+ write gate for defense in depth.
drop policy if exists runs_insert_workspace_role_member_plus on public.runs;
create policy runs_insert_workspace_role_member_plus
  on public.runs
  for insert
  with check ( public.bunkai_can_write_workspace(workspace_id) );

-- ============================================================================
-- 3. run_atcs (snapshot of each chain position)
-- ============================================================================

create table if not exists public.run_atcs (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.runs(id) on delete cascade,
  atc_id     uuid references public.atcs(id) on delete set null,  -- provenance only
  position   int  not null check (position >= 1),                 -- chain order
  atc_title  text not null,                                       -- snapshot
  status     text not null default 'pending'
               check (status in ('pending', 'passed', 'failed', 'blocked', 'skipped')),
  unique (run_id, position)
);

create index if not exists run_atcs_run_id_idx on public.run_atcs (run_id);

alter table public.run_atcs enable row level security;

drop policy if exists run_atcs_select_workspace_member on public.run_atcs;
create policy run_atcs_select_workspace_member
  on public.run_atcs
  for select
  using (
    exists (
      select 1 from public.runs r
      where r.id = run_atcs.run_id
        and public.bunkai_is_workspace_member(r.workspace_id)
    )
  );

drop policy if exists run_atcs_insert_workspace_role_member_plus on public.run_atcs;
create policy run_atcs_insert_workspace_role_member_plus
  on public.run_atcs
  for insert
  with check (
    exists (
      select 1 from public.runs r
      where r.id = run_atcs.run_id
        and public.bunkai_can_write_workspace(r.workspace_id)
    )
  );

-- ============================================================================
-- 4. run_steps (snapshot of each executable step)
-- ============================================================================

create table if not exists public.run_steps (
  id           uuid primary key default gen_random_uuid(),
  run_atc_id   uuid not null references public.run_atcs(id) on delete cascade,
  atc_step_id  uuid references public.atc_steps(id) on delete set null,  -- provenance only
  -- position is copied verbatim from atc_steps.position, which is 0-based
  -- (atc_steps.position int default 0) — preserve source order exactly, so allow >= 0.
  position     int  not null check (position >= 0),
  content      text not null,            -- SNAPSHOT of atc_steps.content
  input_data   text,                     -- SNAPSHOT
  expected     text,                     -- SNAPSHOT
  status       text not null default 'pending'
                 check (status in ('pending', 'passed', 'failed', 'blocked', 'skipped')),
  note         text,                     -- BK-35 will write
  evidence_url text,                     -- BK-35 will write
  executed_at  timestamptz,              -- BK-35 will write
  unique (run_atc_id, position)
);

create index if not exists run_steps_run_atc_id_idx on public.run_steps (run_atc_id);

alter table public.run_steps enable row level security;

drop policy if exists run_steps_select_workspace_member on public.run_steps;
create policy run_steps_select_workspace_member
  on public.run_steps
  for select
  using (
    exists (
      select 1
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
      where ra.id = run_steps.run_atc_id
        and public.bunkai_is_workspace_member(r.workspace_id)
    )
  );

drop policy if exists run_steps_insert_workspace_role_member_plus on public.run_steps;
create policy run_steps_insert_workspace_role_member_plus
  on public.run_steps
  for insert
  with check (
    exists (
      select 1
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
      where ra.id = run_steps.run_atc_id
        and public.bunkai_can_write_workspace(r.workspace_id)
    )
  );

-- ============================================================================
-- 5. bunkai_run_json — nested jsonb composer (read; header + run_atcs + run_steps)
-- ============================================================================

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
-- 6. bunkai_create_run — atomic create (snapshot walk). SECURITY DEFINER.
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior, mirrors bunkai_create_test):
--   1. Resolve Test -> workspace_id; resolve Test's project from its chain.
--      AuthZ gate via membership write-access (forbidden 42501, no disclosure).
--   2. executor_mode in ('human','agent','ci') else executor_mode_invalid (45200).
--   3. Environment belongs to the Test's Project, else environment_invalid (45201).
--   4. Test has >=1 executable step (reachable atc_steps), else no_executable_steps (45202).
--   5. Idempotency: existing running Run with same (test_id, start_token) within 24h
--      under the project write-lock -> return THAT run, no insert.
--   6. Insert runs header; walk test_steps in position order -> run_atcs -> run_steps
--      (snapshot content/input/expected, pending). Order preserved verbatim.
--   7. Emit activity_log 'run.started' (DEFINER-only). Return composed json.

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

  -- 6. Insert the header.
  insert into public.runs (
    workspace_id, project_id, test_id, environment_id,
    status, executor_mode, executor_user_id, start_token, test_title
  )
  values (
    v_workspace_id, v_project_id, p_test_id, p_environment_id,
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

-- ============================================================================
-- 7. bunkai_get_run_expanded — membership-gated read
-- ============================================================================

create or replace function public.bunkai_get_run_expanded(
  p_actor_user_id uuid,
  p_run_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
    from public.runs
    where id = p_run_id;
  if v_workspace_id is null then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);
  return public.bunkai_run_json(p_run_id);
end;
$$;

revoke execute on function public.bunkai_get_run_expanded(uuid, uuid) from public, anon;
grant execute on function public.bunkai_get_run_expanded(uuid, uuid) to authenticated, service_role;
