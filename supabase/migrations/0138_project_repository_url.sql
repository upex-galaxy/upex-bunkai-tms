-- 0138_project_repository_url.sql — BK-228: link CI-triggered runs to their commit and branch
--
-- ADDITIVE. Ships the database half of the BK-228 display and filter scope:
--   * project_repository_settings      one optional repository URL per Project
--                                      (D3, T4: calqued on project_tracker_settings)
--   * bunkai_set_project_repository_url the single write path (owner / admin),
--                                      service_role only
--   * bunkai_report_project_runs       + trailing p_branch (D5: exact and
--                                      case-sensitive). The body is the 0137
--                                      body (md5(prosrc) 2499d7ec0814e49d1e3a6fbc725bf0df,
--                                      verified live before this change) plus the
--                                      one branch predicate. The signature grows,
--                                      so the old overload is dropped first; the
--                                      grants of 0100 are reproduced below.
--   * bunkai_list_project_branches     branch suggestions: the 20 most recently
--                                      used branches of one Project (D5, T7)
--
-- SQLSTATE allocated here (45240 was the last used, 0137):
--   45241  invalid_repository_url  not an https GitHub / GitLab repository URL
--
-- RPC AUTHORIZATION (ADR-0012, rpc-authorization.md section 4, the six answers):
--   1. The writer is SECURITY INVOKER granted to service_role only, like
--      bunkai_upsert_project_tracker_settings (0091). The suggestions function is
--      SECURITY INVOKER with no identity parameter: the runs RLS policy decides
--      the workspace, the project_id predicate decides the Project. The report
--      stays SECURITY DEFINER exactly as 0137 left it; only a filter is added.
--   2. The writer keeps p_actor_user_id: its only caller is the admin client,
--      where auth.uid() is NULL, so the explicit actor is the only identity.
--      The suggestions function has no identity parameter at all.
--   3. The writer's actor bind sits at step 0, before any table read; the
--      revoke from authenticated refuses a signed-in session before the body.
--   4. The writer returns only the row keyed by the Project it resolved to the
--      asserted workspace. The suggestions rows are runs of p_project_id visible
--      through the caller's own RLS. The report's new predicate only narrows
--      the already project-scoped `filtered` set.
--   5. Missing Project, foreign workspace, soft-deleted workspace and non-member
--      raise the same P0002. A member who is not owner / admin raises 42501,
--      which the route maps to 403.
--   6. lib/repository-settings/repository-settings-isolation.test.ts proves it
--      against the real database.

-- ============================================================================
-- 1. project_repository_settings
-- ============================================================================

create table if not exists public.project_repository_settings (
  project_id     uuid primary key references public.projects(id) on delete cascade,
  repository_url text not null
                   check (char_length(repository_url) <= 2048
                          and repository_url ~ '^https://(github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|gitlab\.com(/[A-Za-z0-9_.-]+){2,})$'
                          and repository_url !~* '\.git$'
                          and repository_url !~ '/\.{1,2}(/|$)'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists project_repository_settings_set_updated_at on public.project_repository_settings;
create trigger project_repository_settings_set_updated_at
  before update on public.project_repository_settings
  for each row
  execute function public.bunkai_set_updated_at();

alter table public.project_repository_settings enable row level security;

-- SELECT: any active member of the Project's live workspace, viewers included
-- (V1). Same shape as project_tracker_settings_select_workspace_member (0091).
-- NO client write policy: every write goes through the function below.
drop policy if exists project_repository_settings_select_workspace_member on public.project_repository_settings;
create policy project_repository_settings_select_workspace_member
  on public.project_repository_settings
  for select
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_repository_settings.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

-- ============================================================================
-- 2. bunkai_set_project_repository_url
-- ============================================================================
-- p_repository_url arrives normalized by the route (lib/runs/ci-link.ts:
-- trailing slash and .git dropped, host lowercased); the function re-checks the
-- stored shape and the table CHECK repeats it. NULL clears the setting.

create or replace function public.bunkai_set_project_repository_url(
  p_actor_user_id  uuid,
  p_project_id     uuid,
  p_repository_url text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_role         text;
  v_old          text;
  v_row          public.project_repository_settings%rowtype;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  select p.workspace_id, wm.role
    into v_workspace_id, v_role
    from public.projects p
    join public.workspaces w
      on w.id = p.workspace_id
     and w.deleted_at is null
    join public.workspace_members wm
      on wm.workspace_id = p.workspace_id
     and wm.user_id = p_actor_user_id
     and wm.status = 'active'
   where p.id = p_project_id;

  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_repository_url is not null and (
       char_length(p_repository_url) > 2048
       or p_repository_url !~ '^https://(github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|gitlab\.com(/[A-Za-z0-9_.-]+){2,})$'
       or p_repository_url ~* '\.git$'
       or p_repository_url ~ '/\.{1,2}(/|$)'
     ) then
    raise exception 'invalid_repository_url' using errcode = '45241';
  end if;

  select s.repository_url into v_old
    from public.project_repository_settings s
   where s.project_id = p_project_id;

  if p_repository_url is null then
    delete from public.project_repository_settings
     where project_id = p_project_id;
  else
    insert into public.project_repository_settings (project_id, repository_url)
    values (p_project_id, p_repository_url)
    on conflict (project_id) do update
      set repository_url = excluded.repository_url
    returning * into v_row;
  end if;

  if v_old is distinct from p_repository_url then
    insert into public.activity_log
      (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values
      (v_workspace_id, p_actor_user_id, 'project_repository_settings', p_project_id,
       'repository_settings.updated',
       jsonb_build_object('old', v_old, 'new', p_repository_url));
  end if;

  return jsonb_build_object(
    'project_id', p_project_id,
    'repository_url', p_repository_url,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke execute on function public.bunkai_set_project_repository_url(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.bunkai_set_project_repository_url(uuid, uuid, text)
  to service_role;

grant select, insert, update, delete on public.project_repository_settings to service_role;
grant select on public.projects, public.workspaces, public.workspace_members to service_role;
grant insert on public.activity_log to service_role;

-- ============================================================================
-- 3. bunkai_report_project_runs + p_branch
-- ============================================================================

drop function if exists public.bunkai_report_project_runs(
  uuid, uuid, date, date, uuid, text[], text[], int, timestamptz, uuid
);

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
  p_cursor_id         uuid default null,
  p_branch            text default null
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
        and (p_branch is null or r.ci_branch = p_branch)
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

revoke execute on function public.bunkai_report_project_runs(
  uuid, uuid, date, date, uuid, text[], text[], int, timestamptz, uuid, text
) from public, anon;
grant execute on function public.bunkai_report_project_runs(
  uuid, uuid, date, date, uuid, text[], text[], int, timestamptz, uuid, text
) to authenticated, service_role;

-- ============================================================================
-- 4. bunkai_list_project_branches
-- ============================================================================
-- The 20 branches of one Project most recently seen on a run, newest first.
-- runs_project_ci_branch_idx (0137) serves it. INVOKER: the runs RLS policy is
-- the only authorization, so a branch from another workspace never appears, and
-- the project_id predicate keeps sibling Projects of the same workspace out.

create or replace function public.bunkai_list_project_branches(p_project_id uuid)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(b.ci_branch order by b.last_seen desc, b.ci_branch), '{}'::text[])
    from (
      select r.ci_branch, max(r.started_at) as last_seen
        from public.runs r
       where r.project_id = p_project_id
         and r.ci_branch is not null
       group by r.ci_branch
       order by last_seen desc, r.ci_branch
       limit 20
    ) b;
$$;

revoke execute on function public.bunkai_list_project_branches(uuid) from public, anon;
grant execute on function public.bunkai_list_project_branches(uuid) to authenticated, service_role;

-- 0088 mechanism: the 0085 default privilege hands every new function to both QA
-- roles. The writer must not reach the read-only role, and the re-created report
-- keeps the ACL it had before this migration (no qa_inspector_ro).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_set_project_repository_url(uuid, uuid, text) from qa_inspector_ro;
    revoke all on function public.bunkai_report_project_runs(uuid, uuid, date, date, uuid, text[], text[], int, timestamptz, uuid, text) from qa_inspector_ro;
  end if;
end
$$;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('authenticated', 'public.bunkai_set_project_repository_url(uuid,uuid,text)', 'EXECUTE');   -- false
--   select has_function_privilege('anon', 'public.bunkai_report_project_runs(uuid,uuid,date,date,uuid,text[],text[],int,timestamptz,uuid,text)', 'EXECUTE');  -- false
--   select has_function_privilege('authenticated', 'public.bunkai_list_project_branches(uuid)', 'EXECUTE');                -- true
--   select count(*) from pg_proc where proname = 'bunkai_report_project_runs';                                              -- 1
