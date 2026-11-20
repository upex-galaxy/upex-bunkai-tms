-- 0137_run_ci_context.sql — BK-1995: report commit, branch and pipeline with a run
--
-- ADDITIVE. Four nullable columns on runs (the CI context), null for every run
-- created before this migration. Function bodies are the live-verified sources
-- (md5(prosrc) equal before this change) with only the CI lines added:
--   bunkai_run_json             0121_automated_run_submission.sql
--   bunkai_list_test_runs       0099_run_history_flakiness.sql
--   bunkai_report_project_runs  0100_run_report_mode_totals.sql
--   bunkai_compare_run_header   0092_run_compare.sql
--   bunkai_create_run           0134_test_archive_restore.sql (+4 trailing params)
--   bunkai_submit_automated_run 0134_test_archive_restore.sql (+4 trailing params)
-- The two writers are dropped and re-created because their signature grows; the
-- new parameters default to null, so a caller that omits them resolves as before.
--
-- SQLSTATE allocated here (45239 was the last used, 0122):
--   45240  run_ci_context_conflict  start_token replayed with other CI details (409)
--
-- ADR-0012: no new identity parameter; the actor bind and row scoping of both
-- DEFINER writers are unchanged from 0134.

alter table public.runs add column if not exists ci_commit text;
alter table public.runs add column if not exists ci_branch text;
alter table public.runs add column if not exists ci_pipeline_name text;
alter table public.runs add column if not exists ci_pipeline_url text;

alter table public.runs drop constraint if exists runs_ci_commit_chk;
alter table public.runs
  add constraint runs_ci_commit_chk
  check (ci_commit is null or ci_commit ~ '^[0-9a-f]{7,64}$');

alter table public.runs drop constraint if exists runs_ci_branch_chk;
alter table public.runs
  add constraint runs_ci_branch_chk
  check (ci_branch is null or (
    char_length(ci_branch) between 1 and 255
    and ci_branch = btrim(ci_branch)
    and ci_branch !~ '[[:cntrl:]]'
  ));

alter table public.runs drop constraint if exists runs_ci_pipeline_name_chk;
alter table public.runs
  add constraint runs_ci_pipeline_name_chk
  check (ci_pipeline_name is null or (
    char_length(ci_pipeline_name) between 1 and 100
    and ci_pipeline_name = btrim(ci_pipeline_name)
    and ci_pipeline_name !~ '[[:cntrl:]]'
  ));

alter table public.runs drop constraint if exists runs_ci_pipeline_url_chk;
alter table public.runs
  add constraint runs_ci_pipeline_url_chk
  check (ci_pipeline_url is null or (
    char_length(ci_pipeline_url) <= 2048
    and ci_pipeline_url ~* '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'
    and ci_pipeline_url !~ '[[:cntrl:]]'
  ));

create index if not exists runs_project_ci_branch_idx
  on public.runs (project_id, ci_branch, started_at desc)
  where ci_branch is not null;

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
    'executor_name', r.executor_name,
    'evidence_urls', to_jsonb(r.evidence_urls),
    'commit', r.ci_commit,
    'branch', r.ci_branch,
    'pipeline_name', r.ci_pipeline_name,
    'pipeline_url', r.ci_pipeline_url,
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

create or replace function public.bunkai_list_test_runs(
  p_actor_user_id     uuid,
  p_test_id           uuid,
  p_outcome           text default null,
  p_limit             int default 50,
  p_cursor_started_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_limit        int;
  v_items        jsonb;
  v_fetched      int;
  v_totals       jsonb;
  v_next_cursor  jsonb;
  v_last         jsonb;
  v_flakiness    jsonb;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which the
  --    parameter IS the identity; a present-but-different uid is a spoof and
  --    collapses into the missing-Test answer (INV-3).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Test, then re-check READ membership. Both failures raise the
  --    identical P0002 (INV-3 non-disclosure).
  select workspace_id into v_workspace_id
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. Outcome filter backstop (Zod is the primary guard at the HTTP edge).
  if p_outcome is not null and p_outcome not in ('passed', 'failed', 'aborted') then
    raise exception 'run_outcome_invalid' using errcode = '45208';
  end if;

  -- 2b. Cursor backstop: the keyset position is a PAIR. Exactly one half is not
  --     a position — raise rather than silently degrade to the first page.
  if (p_cursor_started_at is null) <> (p_cursor_id is null) then
    raise exception 'run_cursor_invalid' using errcode = '45209';
  end if;

  -- 3. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  -- 4. One keyset page (limit+1 probe) + the kept slice, composed to jsonb.
  with page as (
    select r.id, r.status, r.environment_id, r.executor_mode, r.started_at, r.finished_at,
           r.ci_commit, r.ci_branch, r.ci_pipeline_name, r.ci_pipeline_url
      from public.runs r
      where r.test_id = p_test_id
        and r.status in ('passed', 'failed', 'aborted')
        and (p_outcome is null or r.status = p_outcome)
        and (
          p_cursor_started_at is null
          or p_cursor_id is null
          or (r.started_at, r.id) < (p_cursor_started_at, p_cursor_id)
        )
      order by r.started_at desc, r.id desc
      limit v_limit + 1
  ),
  kept as (
    select * from page order by started_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'status', k.status,
                 'environment_id', k.environment_id,
                 'environment_name', (
                   select pe.name from public.project_environments pe where pe.id = k.environment_id
                 ),
                 'executor_mode', k.executor_mode,
                 'started_at', k.started_at,
                 'finished_at', k.finished_at,
                 'commit', k.ci_commit,
                 'branch', k.ci_branch,
                 'pipeline_name', k.ci_pipeline_name,
                 'pipeline_url', k.ci_pipeline_url
               ) order by k.started_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- next_cursor: NULL when the probe row was absent (no further page). Otherwise
  -- the (started_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'started_at', v_last -> 'started_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  -- All-time outcome totals — filter-invariant and pagination-invariant. The
  -- three keys are always present (0 when that outcome never occurred).
  select jsonb_build_object('passed', 0, 'failed', 0, 'aborted', 0)
         || coalesce(jsonb_object_agg(g.status, g.n), '{}'::jsonb)
    into v_totals
    from (
      select r.status, count(*) as n
        from public.runs r
        where r.test_id = p_test_id
          and r.status in ('passed', 'failed', 'aborted')
        group by r.status
    ) g;

  -- BK-554 — flakiness inputs, computed on read, filter- and pagination-
  -- invariant (like totals). The sample is the 10 most recent Passed/Failed Runs
  -- in the SAME (started_at desc, id desc) order the list pages by; a flip is a
  -- consecutive pair (in that order) with different statuses. Aborted Runs are
  -- skipped, not a break. `aborted_skipped` counts Aborted Runs inside the span
  -- the sample covers (newest terminal Run down to the oldest sampled verdict);
  -- with no verdict Runs at all it is every Aborted Run. Band, rate and the
  -- below-minimum rule are derived in lib/runs/flakiness.ts from these counts.
  with sample as (
    select r.status, r.started_at, r.id,
           lead(r.status) over (order by r.started_at desc, r.id desc) as older_status
      from (
        select r2.status, r2.started_at, r2.id
          from public.runs r2
          where r2.test_id = p_test_id
            and r2.status in ('passed', 'failed')
          order by r2.started_at desc, r2.id desc
          limit 10
      ) r
  ),
  oldest as (
    select s.started_at, s.id from sample s order by s.started_at asc, s.id asc limit 1
  )
  select jsonb_build_object(
           'sample', (select count(*) from sample),
           'flips', (select count(*) from sample s where s.older_status is not null and s.older_status <> s.status),
           'aborted_skipped', (
             select count(*)
               from public.runs a
               where a.test_id = p_test_id
                 and a.status = 'aborted'
                 and (
                   not exists (select 1 from oldest)
                   or (a.started_at, a.id) >= (select o.started_at, o.id from oldest o)
                 )
           )
         )
    into v_flakiness;

  return jsonb_build_object(
    'items', v_items,
    'totals', v_totals,
    'next_cursor', v_next_cursor,
    'flakiness', v_flakiness
  );
end;
$$;

create or replace function public.bunkai_report_project_runs(
  p_actor_user_id     uuid,
  p_project_id        uuid,
  p_date_from         date default null,
  p_date_to           date default null,
  p_module_id         uuid default null,
  p_status            text[] default null,
  p_executor_mode     text[] default null,
  p_limit             int default 50,
  p_cursor_started_at timestamptz default null,
  p_cursor_id         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_limit        int;
  v_items        jsonb;
  v_fetched      int;
  v_totals       jsonb;
  v_scope        jsonb;
  v_next_cursor  jsonb;
  v_last         jsonb;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which
  --    the parameter IS the identity; a present-but-different uid is a spoof
  --    and collapses into the missing-Project answer (non-disclosure).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Project, then re-check READ membership. Both failures
  --    raise the identical P0002 (non-disclosure).
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  -- 3-5. filtered (whole filtered set, unpaged) -> page (keyset slice) ->
  --      kept (trim the limit+1 probe row) -> items/totals in one query.
  with filtered as (
    select r.id, r.test_id, r.test_title, r.module_id, r.environment_id,
           r.executor_mode, r.status, r.started_at, r.finished_at,
           r.ci_commit, r.ci_branch, r.ci_pipeline_name, r.ci_pipeline_url
      from public.runs r
      where
        -- Primary project-boundary gate (BK-38-ATC-07 / SEC-1). The
        -- runs_select_workspace_member RLS policy (0031_runs.sql) only gates
        -- at the WORKSPACE boundary — a member of the same workspace could,
        -- via direct table access, see Runs from ANOTHER project in that
        -- workspace. THIS predicate is the actual project-scope enforcement
        -- for this report; RLS is defense-in-depth on the raw table only.
        -- Mirrors bunkai_list_test_runs's own non-disclosure reasoning
        -- (0038_run_history.sql).
        r.project_id = p_project_id
        -- Date range: UTC calendar day, both bounds inclusive (Technical
        -- Decision D3 — no projects.timezone column exists to interpret
        -- against).
        and (p_date_from is null or r.started_at::date >= p_date_from)
        and (p_date_to is null or r.started_at::date <= p_date_to)
        and (p_module_id is null or r.module_id = p_module_id)
        and (p_status is null or r.status = any(p_status))
        and (p_executor_mode is null or r.executor_mode = any(p_executor_mode))
  ),
  page as (
    select * from filtered
      where (
        p_cursor_started_at is null
        or p_cursor_id is null
        or (started_at, id) < (p_cursor_started_at, p_cursor_id)
      )
      order by started_at desc, id desc
      limit v_limit + 1
  ),
  kept as (
    select * from page order by started_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'test_id', k.test_id,
                 'test_title', k.test_title,
                 'module_id', k.module_id,
                 'module_name', (
                   select m.name from public.modules m where m.id = k.module_id
                 ),
                 'environment_id', k.environment_id,
                 'environment_name', (
                   select pe.name from public.project_environments pe where pe.id = k.environment_id
                 ),
                 'executor_mode', k.executor_mode,
                 'status', k.status,
                 'started_at', k.started_at,
                 'finished_at', k.finished_at,
                 'commit', k.ci_commit,
                 'branch', k.ci_branch,
                 'pipeline_name', k.ci_pipeline_name,
                 'pipeline_url', k.ci_pipeline_url
               ) order by k.started_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page),
    -- Technical Decision D2: totals are passed/failed counts over the WHOLE
    -- `filtered` set (every row that matches the active filters, unpaged) —
    -- NOT all-time / filter-invariant like bunkai_list_test_runs's totals.
    -- Same CTE as the rows above, not a second query, by construction.
    -- BK-225: totals are still passed/failed over the WHOLE filtered set, now
    -- ALSO split per execution mode (manual = executor human, automated =
    -- agent/ci) from the SAME filtered CTE, so Manual + Automated = Passed +
    -- Failed by construction. running / aborted runs are not counted.
    (
      select jsonb_build_object(
               'passed', count(*) filter (where status = 'passed'),
               'failed', count(*) filter (where status = 'failed'),
               'manual', count(*) filter (where executor_mode = 'human'),
               'automated', count(*) filter (where executor_mode <> 'human')
             )
        from filtered
        where status in ('passed', 'failed')
    ),
    -- BK-225: project-level context for the empty states, deliberately
    -- filter-invariant (every Run of the Project): does the Project have any
    -- Run at all, and any automated one.
    (
      select jsonb_build_object(
               'has_runs', count(*) > 0,
               'has_automated', coalesce(bool_or(executor_mode <> 'human'), false)
             )
        from public.runs
        where project_id = p_project_id
    )
    into v_items, v_fetched, v_totals, v_scope;

  -- next_cursor: NULL when the probe row was absent (no further page).
  -- Otherwise the (started_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'started_at', v_last -> 'started_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'totals', v_totals,
    'scope', v_scope,
    'next_cursor', v_next_cursor
  );
end;
$$;

create or replace function public.bunkai_compare_run_header(p_run_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'started_at', r.started_at,
    'finished_at', r.finished_at,
    'environment_id', r.environment_id,
    'environment_name', pe.name,
    'executor_mode', r.executor_mode,
    'abort_reason', r.abort_reason,
    'total_steps', coalesce(s.total_steps, 0),
    'skipped_steps', coalesce(s.skipped_steps, 0),
    'commit', r.ci_commit,
    'branch', r.ci_branch,
    'pipeline_name', r.ci_pipeline_name,
    'pipeline_url', r.ci_pipeline_url
  )
  from public.runs r
  left join public.project_environments pe on pe.id = r.environment_id
  left join lateral (
    select count(*) as total_steps,
           count(*) filter (where rs.status = 'skipped') as skipped_steps
    from public.run_atcs ra
    join public.run_steps rs on rs.run_atc_id = ra.id
    where ra.run_id = r.id
  ) s on true
  where r.id = p_run_id;
$$;

drop function if exists public.bunkai_create_run(uuid, uuid, uuid, text, text, uuid);

create or replace function public.bunkai_create_run(
  p_actor_user_id uuid,
  p_test_id       uuid,
  p_environment_id uuid,
  p_executor_mode text,
  p_start_token   text,
  p_token_id      uuid default null,
  p_ci_commit        text default null,
  p_ci_branch        text default null,
  p_ci_pipeline_name text default null,
  p_ci_pipeline_url  text default null
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
  v_archived_at    timestamptz;
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

  -- BK-596: hold the Test FOR SHARE until commit, so an archive (FOR UPDATE)
  -- waits for this Run or this Run sees the archive. Taken before the project
  -- lock below; the archive locks only the Test, so no cycle forms.
  select archived_at into v_archived_at
    from public.tests
    where id = p_test_id
    for share;

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
    if exists (
      select 1
        from public.runs r
        where r.id = v_existing_id
          and (r.ci_commit is distinct from p_ci_commit
            or r.ci_branch is distinct from p_ci_branch
            or r.ci_pipeline_name is distinct from p_ci_pipeline_name
            or r.ci_pipeline_url is distinct from p_ci_pipeline_url)
    ) then
      raise exception 'run_ci_context_conflict' using errcode = '45240';
    end if;
    -- Replay: same (test_id, start_token) within 24h. Tag the response so the
    -- HTTP layer can answer 200 (replay) vs 201 (created) deterministically.
    return public.bunkai_run_json(v_existing_id) || jsonb_build_object('replayed', true);
  end if;

  -- BK-596: a new Run cannot start from an archived Test (AI Tech Lead ruling
  -- B). Checked after the replay so a replayed start token still returns the
  -- Run it created before the archive (Dev Q8).
  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
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
    start_token, test_title,
    ci_commit, ci_branch, ci_pipeline_name, ci_pipeline_url
  )
  values (
    v_workspace_id, v_project_id, p_test_id, p_environment_id, v_module_id,
    'running', p_executor_mode, p_actor_user_id, v_token_id, v_executor_name,
    p_start_token, v_test_title,
    p_ci_commit, p_ci_branch, p_ci_pipeline_name, p_ci_pipeline_url
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

revoke execute on function public.bunkai_create_run(uuid, uuid, uuid, text, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.bunkai_create_run(uuid, uuid, uuid, text, text, uuid, text, text, text, text) to authenticated, service_role;

drop function if exists public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text);

create or replace function public.bunkai_submit_automated_run(
  p_actor_user_id    uuid,
  p_token_id         uuid,
  p_test_id          uuid,
  p_environment_name text,
  p_verdict          text,
  p_duration_seconds int,
  p_steps            jsonb,
  p_evidence_urls    text[] default '{}',
  p_idempotency_key  text default null,
  p_ci_commit        text default null,
  p_ci_branch        text default null,
  p_ci_pipeline_name text default null,
  p_ci_pipeline_url  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_name   text;
  v_token_ws     uuid;
  v_token_scopes text[];
  v_workspace_id uuid;
  v_test_title   text;
  v_project_id   uuid;
  v_project_count int;
  v_chain_len    int;
  v_step_count   int;
  v_env_id       uuid;
  v_env_name     text := btrim(coalesce(p_environment_name, ''));
  v_evidence     text[] := coalesce(p_evidence_urls, '{}');
  v_key          text := p_idempotency_key;
  v_el           jsonb;
  v_pos          int;
  v_res          text;
  v_by_pos       jsonb := '{}'::jsonb;
  v_seen         int[] := '{}';
  v_dups         int[] := '{}';
  v_range        int[] := '{}';
  v_missing      int[];
  v_fail_count   int := 0;
  v_norm         jsonb;
  v_hash         text;
  v_key_row      record;
  v_url          text;
  v_module_id    uuid;
  v_run_id       uuid;
  v_run_atc_id   uuid;
  v_atc          record;
  v_step         record;
  v_status       text;
  v_started      timestamptz;
  v_archived_at  timestamptz;
begin
  -- 0. Actor bind (ADR-0012). NULL auth.uid() = service role / admin client, for
  --    which the parameter IS the identity; a present-but-different uid is a
  --    spoof and collapses into the missing-Test answer.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 1. The token: the actor's own, active, scoped run:execute, bound to a workspace.
  select t.name, t.workspace_id, t.scopes
    into v_token_name, v_token_ws, v_token_scopes
    from public.access_tokens t
    where t.id = p_token_id
      and t.user_id = p_actor_user_id
      and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now());
  if not found then
    raise exception 'submission_token_invalid' using errcode = '45237';
  end if;
  if v_token_ws is null then
    raise exception 'submission_token_unscoped' using errcode = '45238';
  end if;
  if not ('run:execute' = any (v_token_scopes)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2. The Test: missing or in another workspace than the token's -> the same 404.
  select workspace_id, title
    into v_workspace_id, v_test_title
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null or v_workspace_id <> v_token_ws then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 3. Membership first (P0002 for a non-member), then write access (42501 for a viewer).
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- BK-596: hold the Test FOR SHARE until commit (same reason as bunkai_create_run).
  select archived_at into v_archived_at
    from public.tests
    where id = p_test_id
    for share;

  -- 4. The chain: its project, its length, and the executable-steps gate.
  select count(distinct p.id), (array_agg(distinct p.id))[1]
    into v_project_count, v_project_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    join public.projects p on p.id = a.project_id
    where ts.test_id = p_test_id;

  select count(*) into v_chain_len from public.test_steps where test_id = p_test_id;

  select count(s.id)
    into v_step_count
    from public.test_steps ts
    join public.atc_steps s on s.atc_id = ts.atc_id
    where ts.test_id = p_test_id;

  if v_project_id is null or v_chain_len = 0 or v_step_count = 0 then
    raise exception 'no_executable_steps' using errcode = '45202';
  end if;

  -- 5. The environment, by name (case-insensitive), inside the Test's project.
  select pe.id
    into v_env_id
    from public.project_environments pe
    where pe.project_id = v_project_id
      and lower(pe.name) = lower(v_env_name);
  if v_env_id is null then
    raise exception 'environment_invalid' using errcode = '45201',
      detail = v_env_name;
  end if;

  -- 6. Backstops (Zod is the primary guard at the HTTP edge).
  if p_verdict is null or p_verdict not in ('passed', 'failed') then
    raise exception 'submission_vocabulary_invalid' using errcode = '45232',
      detail = 'verdict=' || coalesce(p_verdict, '');
  end if;

  if p_duration_seconds is null or p_duration_seconds < 0 or p_duration_seconds > 86400 then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'duration_seconds';
  end if;

  if v_key is not null and char_length(v_key) not between 1 and 64 then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'idempotency_key';
  end if;

  if cardinality(v_evidence) > 20 then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'evidence_urls';
  end if;
  foreach v_url in array v_evidence loop
    if v_url is null or char_length(v_url) > 2048 or v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'submission_field_invalid' using errcode = '45236',
        detail = 'evidence_urls:' || coalesce(v_url, '');
    end if;
  end loop;

  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'submission_steps_invalid' using errcode = '45234', detail = 'steps must be an array';
  end if;
  if jsonb_array_length(p_steps) > 500 then
    raise exception 'submission_steps_invalid' using errcode = '45234', detail = 'at most 500 steps';
  end if;

  for v_el in select value from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(v_el) <> 'object'
       or jsonb_typeof(v_el -> 'position') is distinct from 'number'
       or (v_el ->> 'position') !~ '^[0-9]{1,9}$' then
      raise exception 'submission_steps_invalid' using errcode = '45234',
        detail = 'each step needs an integer position and a result';
    end if;
    v_pos := (v_el ->> 'position')::int;
    v_res := case when jsonb_typeof(v_el -> 'result') = 'string' then v_el ->> 'result' end;
    if v_res is null or v_res not in ('pass', 'fail', 'block') then
      raise exception 'submission_vocabulary_invalid' using errcode = '45232',
        detail = 'result=' || coalesce(v_res, '');
    end if;
    if v_pos < 1 or v_pos > v_chain_len then
      v_range := array_append(v_range, v_pos);
    elsif v_pos = any (v_seen) then
      v_dups := array_append(v_dups, v_pos);
    else
      v_seen := array_append(v_seen, v_pos);
      v_by_pos := v_by_pos || jsonb_build_object(v_pos::text, v_res);
      if v_res <> 'pass' then
        v_fail_count := v_fail_count + 1;
      end if;
    end if;
  end loop;

  if cardinality(v_range) > 0 or cardinality(v_dups) > 0 then
    raise exception 'submission_steps_invalid' using errcode = '45234',
      detail = 'out_of_range=' || coalesce(array_to_string(v_range, ','), '')
        || ';duplicate=' || coalesce(array_to_string(v_dups, ','), '');
  end if;

  select coalesce(array_agg(g order by g), '{}')
    into v_missing
    from generate_series(1, v_chain_len) g
    where not (g = any (v_seen));
  if cardinality(v_missing) > 0 then
    raise exception 'submission_steps_incomplete' using errcode = '45233',
      detail = array_to_string(v_missing, ',');
  end if;

  if (p_verdict = 'passed' and v_fail_count > 0)
     or (p_verdict = 'failed' and v_fail_count = 0) then
    raise exception 'submission_verdict_inconsistent' using errcode = '45235',
      detail = 'verdict=' || p_verdict;
  end if;

  -- 7. Idempotency (only when a key was sent). The advisory lock serializes
  --    concurrent submissions of one (workspace, key).
  select jsonb_agg(jsonb_build_object('position', k::int, 'result', v) order by k::int)
    into v_norm
    from jsonb_each_text(v_by_pos) as t(k, v);

  v_hash := md5((jsonb_build_object(
    'test_id', p_test_id,
    'environment', lower(v_env_name),
    'verdict', p_verdict,
    'duration_seconds', p_duration_seconds,
    'steps', v_norm,
    'evidence_urls', to_jsonb(v_evidence)
  ) || jsonb_strip_nulls(jsonb_build_object(
    'commit', p_ci_commit,
    'branch', p_ci_branch,
    'pipeline_name', p_ci_pipeline_name,
    'pipeline_url', p_ci_pipeline_url
  )))::text);

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_key, 0));

    select k.request_hash, k.run_id, k.created_at
      into v_key_row
      from public.run_submission_keys k
      where k.workspace_id = v_workspace_id
        and k.idempotency_key = v_key;
    if found then
      if v_key_row.created_at > now() - interval '24 hours' then
        if v_key_row.request_hash = v_hash then
          return public.bunkai_run_json(v_key_row.run_id) || jsonb_build_object('replayed', true);
        end if;
        raise exception 'submission_key_conflict' using errcode = '45231';
      end if;
      -- Window over: the key is free again.
      delete from public.run_submission_keys
        where workspace_id = v_workspace_id and idempotency_key = v_key;
    end if;
  end if;

  -- BK-596: no new Run from an archived Test; a replayed key above still
  -- returns the Run it created before the archive.
  if v_archived_at is not null then
    raise exception 'test_archived' using errcode = '45127';
  end if;

  -- 8. The Run header. Finished now; started = finished - duration.
  v_started := now() - make_interval(secs => p_duration_seconds);

  select a.module_id
    into v_module_id
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
      and ts.position = (select min(position) from public.test_steps where test_id = p_test_id);

  insert into public.runs (
    workspace_id, project_id, test_id, environment_id, module_id,
    status, executor_mode, executor_user_id, executor_token_id, executor_name,
    evidence_urls, start_token, test_title, started_at, finished_at,
    ci_commit, ci_branch, ci_pipeline_name, ci_pipeline_url
  )
  values (
    v_workspace_id, v_project_id, p_test_id, v_env_id, v_module_id,
    p_verdict, 'agent', p_actor_user_id, p_token_id,
    left(coalesce(nullif(btrim(v_token_name), ''), 'API token'), 200),
    v_evidence, gen_random_uuid()::text, v_test_title, v_started, now(),
    p_ci_commit, p_ci_branch, p_ci_pipeline_name, p_ci_pipeline_url
  )
  returning id into v_run_id;

  -- Snapshot-walk the chain in position order. The submitted result is keyed by
  -- the ordinal chain position (1..N), which stays dense even if stored
  -- test_steps.position values ever have gaps; run_atcs.position keeps the
  -- stored value, as bunkai_create_run does.
  for v_atc in
    select ts.position as chain_position,
           (row_number() over (order by ts.position))::int as ordinal,
           a.id as atc_id, a.title as atc_title
    from public.test_steps ts
    join public.atcs a on a.id = ts.atc_id
    where ts.test_id = p_test_id
    order by ts.position
  loop
    v_status := case v_by_pos ->> v_atc.ordinal::text
      when 'pass' then 'passed'
      when 'fail' then 'failed'
      else 'blocked'
    end;

    insert into public.run_atcs (run_id, atc_id, position, atc_title, status)
    values (v_run_id, v_atc.atc_id, v_atc.chain_position, v_atc.atc_title, v_status)
    returning id into v_run_atc_id;

    for v_step in
      select s.id as atc_step_id, s.position, s.content, s.input_data, s.expected
      from public.atc_steps s
      where s.atc_id = v_atc.atc_id
      order by s.position
    loop
      insert into public.run_steps (
        run_atc_id, atc_step_id, position, content, input_data, expected, status, executed_at
      )
      values (
        v_run_atc_id, v_step.atc_step_id, v_step.position,
        v_step.content, v_step.input_data, v_step.expected, v_status, now()
      );
    end loop;
  end loop;

  -- 9. Store the key, audit, answer. Audit is DEFINER-only; the run-event
  --    trigger (0107) notifies the token owner (a bearer call is non-interactive).
  if v_key is not null then
    insert into public.run_submission_keys (workspace_id, idempotency_key, request_hash, run_id)
    values (v_workspace_id, v_key, v_hash, v_run_id);
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', v_run_id, 'run.started',
    jsonb_build_object(
      'test_id', p_test_id,
      'environment_id', v_env_id,
      'executor_mode', 'agent',
      'step_count', v_step_count,
      'submitted', true
    )
  );
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', v_run_id, 'run.finished',
    jsonb_build_object('verdict', p_verdict, 'skipped_steps', 0, 'via', 'bearer', 'submitted', true)
  );

  return public.bunkai_run_json(v_run_id) || jsonb_build_object('replayed', false);
end;
$$;

revoke execute on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text, text, text, text, text) from public, anon;
grant execute on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text, text, text, text, text) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_create_run(uuid, uuid, uuid, text, text, uuid, text, text, text, text) from qa_inspector_ro;
    revoke all on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text, text, text, text, text) from qa_inspector_ro;
  end if;
end
$$;
