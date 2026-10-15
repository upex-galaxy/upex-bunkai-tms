-- 0092_run_compare.sql — BK-442: compare a Run against the previous Run of the same Test
--
-- ADDITIVE only. Adds:
--   * run_atcs.source_atc_id            — the ATC occurrence key, snapshotted at Run start
--   * run_atcs_set_source_atc_id (trg)  — fills the key from atc_id on every insert
--   * bunkai_compare_run_header         — internal helper, one Run header as jsonb
--   * bunkai_compare_run                — the comparison itself (read-only)
--
-- Decisions followed (Jira BK-442, comments of 2026-10-12 and the Stage 1 plan):
--   T1  A step is identified across Runs by (occurrence key, exact step text).
--       The occurrence key is run_atcs.source_atc_id plus the n-th copy of that ATC
--       in the Run's chain. No step id is stored or preserved: bunkai_update_atc
--       deletes and recreates every atc_steps row, so a step id cannot pair across
--       an ATC edit.
--   T2  One database function holds the whole rulebook (status matrix, pairing,
--       counts, order), so the page and the API read byte-identical data.
--   T3  Previous run = greatest (started_at, id) among Runs of the same Test and
--       Environment, status passed / failed / aborted, finished_at not null and
--       strictly earlier than the viewed Run's started_at. No new index: the walk
--       uses runs_test_id_status_started_at_idx (0038).
--   T5  Read-only: the function is STABLE, so Postgres refuses any write inside it.
--
-- AI Tech Lead decisions posted on the ticket:
--   * bunkai_compare_run is SECURITY INVOKER and takes NO identity parameter. Every
--     table it reads already has a workspace-member SELECT policy, so RLS is the
--     only authorization and there is nothing to spoof (ADR-0012: delete the
--     parameter instead of guarding it).
--   * run_atcs.source_atc_id is filled by a BEFORE INSERT trigger instead of
--     re-creating bunkai_create_run, which would copy a shipped DEFINER function
--     that ADR-0012 lists as unguarded and not to be touched inline.
--
-- ONE THING RLS DOES NOT DO: the service_role key carries BYPASSRLS, so an INVOKER
-- function called with the admin client would read every workspace. The function
-- therefore refuses any caller that has no auth.uid() (service role, anon) with the
-- same P0002 as a missing Run. The API route must (and does) call it with the
-- caller's own RLS-scoped client.
--
-- Failure contract: a missing Run, a Run in another workspace, a non-member, a
-- soft-deleted workspace and a caller without a session all raise the single
-- P0002 'run_not_found'. The HTTP layer maps it to the same 404 as GET /runs/{id}.
-- No new custom SQLSTATE is allocated.

-- ============================================================================
-- 1. run_atcs.source_atc_id — occurrence key snapshot (no foreign key, on purpose)
-- ============================================================================
--
-- run_atcs.atc_id is `on delete set null` (provenance only). The key must survive
-- that, so it is a plain uuid: a hard delete of an ATC can never turn an old pair
-- of Runs into "cannot be compared reliably".

alter table public.run_atcs
  add column if not exists source_atc_id uuid;

-- Backfill every existing row once. A row whose atc_id is already null stays null
-- and makes any comparison that includes its Run answer the "unreliable" state.
update public.run_atcs
set source_atc_id = atc_id
where source_atc_id is null
  and atc_id is not null;

-- Write-once by construction: run_atcs has no UPDATE policy and the only updates
-- (0042, 0067, 0075) set `status`. The trigger only fills a missing key, so
-- bunkai_create_run (which inserts atc_id) and any seeded fixture are covered
-- without touching either.
create or replace function public.run_atcs_set_source_atc_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_atc_id is null then
    new.source_atc_id := new.atc_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.run_atcs_set_source_atc_id() from public, anon, authenticated;

drop trigger if exists run_atcs_set_source_atc_id on public.run_atcs;
create trigger run_atcs_set_source_atc_id
  before insert on public.run_atcs
  for each row execute function public.run_atcs_set_source_atc_id();

-- ============================================================================
-- 2. bunkai_compare_run_header — one Run header as jsonb (internal helper)
-- ============================================================================
--
-- SECURITY INVOKER: RLS on runs / project_environments / run_atcs / run_steps
-- applies to the caller, so a header the caller cannot see comes back null.
-- total_steps and skipped_steps feed the aborted notice ("N of M steps were not
-- reached"): marks only ever accept passed / failed / blocked (0042), so a skipped
-- step always comes from the close (0067), which makes N exact.

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
    'skipped_steps', coalesce(s.skipped_steps, 0)
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

revoke execute on function public.bunkai_compare_run_header(uuid) from public, anon;
grant execute on function public.bunkai_compare_run_header(uuid) to authenticated, service_role;

-- ============================================================================
-- 3. bunkai_compare_run — the comparison
-- ============================================================================
--
-- Return shape (jsonb), always one of four states, each an HTTP 200 at the edge:
--   state  'compared' | 'no_previous' | 'in_progress' | 'unreliable'
--   test, environment, run, previous            (previous is null unless a Previous
--                                               run was resolved)
--   compared only: counts, nothing_changed, no_common_steps, rows[]
-- No display copy lives here; the page and the API client build the sentences.
--
-- Step pairing (T1 + the PO's follow-up):
--   * occurrence = (source_atc_id, n) with n = the rank of the ATC occurrence among
--     the Run's run_atcs that share the key, by chain position. A repeated ATC pairs
--     1st-1st and 2nd-2nd; an occurrence present in one Run only is Added or Removed
--     whole.
--   * a step is (content, input_data, expected) compared exactly, null equal to
--     empty, inside a paired occurrence. A wording repeated inside one occurrence
--     pairs k-th with k-th ONLY when both Runs hold the same number of copies;
--     otherwise every copy is Removed and Added (never a guess).
--
-- Status matrix (the only place it lives): passed then failed = new_failure,
-- failed then failed = still_failing, failed then passed = newly_fixed, passed then
-- passed = unchanged_pass; every other pair, including any status that is not
-- passed or failed, is not_comparable.
--
-- Row order: groups new_failure, still_failing, newly_fixed, not_comparable, added,
-- removed, unchanged_pass; inside a group This run's order (chain position, step
-- position); removed rows follow the Previous run's order; inside added, failed
-- rows come first.

create or replace function public.bunkai_compare_run(p_run_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_run       public.runs%rowtype;
  v_prev      public.runs%rowtype;
  v_env_name  text;
  v_run_hdr   jsonb;
  v_prev_hdr  jsonb;
  v_base      jsonb;
  v_body      jsonb;
  v_shared    bigint;
begin
  -- 0. A caller with no session (service role, anon) is refused with the same P0002
  --    as a missing Run. service_role has BYPASSRLS, so without this line an admin
  --    client would read every workspace.
  if auth.uid() is null then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the viewed Run through RLS. Missing, foreign, non-member and
  --    soft-deleted workspace all produce zero rows and the single P0002.
  select * into v_run from public.runs where id = p_run_id;
  if not found then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;

  select pe.name into v_env_name
    from public.project_environments pe
    where pe.id = v_run.environment_id;

  v_run_hdr := public.bunkai_compare_run_header(v_run.id);
  v_base := jsonb_build_object(
    'test', jsonb_build_object('id', v_run.test_id, 'title', v_run.test_title),
    'environment', jsonb_build_object('id', v_run.environment_id, 'name', v_env_name),
    'run', v_run_hdr,
    'previous', null
  );

  -- 2. A Run still in progress is never either side.
  if v_run.status = 'running' then
    return v_base || jsonb_build_object('state', 'in_progress');
  end if;

  -- 3. Previous run: greatest (started_at, id) of the same Test and Environment,
  --    finished strictly before the viewed Run started. A terminal Run with a null
  --    finished_at is not eligible. Strict "<": a Run with the same instant never
  --    qualifies.
  select * into v_prev
    from public.runs r
    where r.test_id = v_run.test_id
      and r.environment_id = v_run.environment_id
      and r.id <> v_run.id
      and r.status in ('passed', 'failed', 'aborted')
      and r.finished_at is not null
      and r.finished_at < v_run.started_at
    order by r.started_at desc, r.id desc
    limit 1;
  if not found then
    return v_base || jsonb_build_object('state', 'no_previous');
  end if;

  v_prev_hdr := public.bunkai_compare_run_header(v_prev.id);
  v_base := v_base || jsonb_build_object('previous', v_prev_hdr);

  -- 4. Without the occurrence key on every ATC of both Runs nothing can be paired
  --    reliably; show no comparison rather than a wrong one.
  if exists (
    select 1 from public.run_atcs ra
    where ra.run_id in (v_run.id, v_prev.id)
      and ra.source_atc_id is null
  ) then
    return v_base || jsonb_build_object('state', 'unreliable');
  end if;

  -- 5. Pair, classify, count and order in one set-based pass.
  with cur as (
    select ra.source_atc_id as akey,
           dense_rank() over (partition by ra.source_atc_id order by ra.position) as occ,
           ra.position as atc_position,
           ra.atc_title,
           rs.id as step_id,
           rs.position as step_position,
           rs.content,
           coalesce(rs.input_data, '') as input_data,
           coalesce(rs.expected, '') as expected,
           rs.status
    from public.run_atcs ra
    join public.run_steps rs on rs.run_atc_id = ra.id
    where ra.run_id = v_run.id
  ),
  cur_k as (
    -- `copies` must be the TOTAL per partition, so it uses a window with no ORDER BY
    -- (an ordered window would count only the rows up to the current one).
    select cur.*,
           row_number() over (partition by akey, occ, content, input_data, expected order by step_position) as k,
           count(*) over (partition by akey, occ, content, input_data, expected) as copies
    from cur
  ),
  prv as (
    select ra.source_atc_id as akey,
           dense_rank() over (partition by ra.source_atc_id order by ra.position) as occ,
           ra.position as atc_position,
           ra.atc_title,
           rs.id as step_id,
           rs.position as step_position,
           rs.content,
           coalesce(rs.input_data, '') as input_data,
           coalesce(rs.expected, '') as expected,
           rs.status
    from public.run_atcs ra
    join public.run_steps rs on rs.run_atc_id = ra.id
    where ra.run_id = v_prev.id
  ),
  prv_k as (
    select prv.*,
           row_number() over (partition by akey, occ, content, input_data, expected order by step_position) as k,
           count(*) over (partition by akey, occ, content, input_data, expected) as copies
    from prv
  ),
  paired as (
    select
      case
        when c.step_id is null then 'removed'
        when p.step_id is null then 'added'
        when p.status = 'passed' and c.status = 'failed' then 'new_failure'
        when p.status = 'failed' and c.status = 'failed' then 'still_failing'
        when p.status = 'failed' and c.status = 'passed' then 'newly_fixed'
        when p.status = 'passed' and c.status = 'passed' then 'unchanged_pass'
        else 'not_comparable'
      end as grp,
      coalesce(c.atc_position, p.atc_position) as atc_position,
      coalesce(c.atc_title, p.atc_title) as atc_title,
      coalesce(c.content, p.content) as content,
      coalesce(c.input_data, p.input_data) as input_data,
      coalesce(c.expected, p.expected) as expected,
      c.step_id as step_id,
      p.step_id as previous_step_id,
      c.status as status,
      p.status as previous_status,
      c.atc_position as c_atc_position,
      c.step_position as c_step_position,
      p.atc_position as p_atc_position,
      p.step_position as p_step_position
    from cur_k c
    full join prv_k p
      on c.akey = p.akey
     and c.occ = p.occ
     and c.content = p.content
     and c.input_data = p.input_data
     and c.expected = p.expected
     and c.k = p.k
     and c.copies = p.copies
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'new_failure',    count(*) filter (where grp = 'new_failure'),
      'still_failing',  count(*) filter (where grp = 'still_failing'),
      'newly_fixed',    count(*) filter (where grp = 'newly_fixed'),
      'unchanged_pass', count(*) filter (where grp = 'unchanged_pass'),
      'not_comparable', count(*) filter (where grp = 'not_comparable'),
      'shared',         count(*) filter (where grp not in ('added', 'removed')),
      'added',          count(*) filter (where grp = 'added'),
      'removed',        count(*) filter (where grp = 'removed')
    ),
    'rows', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'group', grp,
          'atc_position', atc_position,
          'atc_title', atc_title,
          'content', content,
          'input_data', nullif(input_data, ''),
          'expected', nullif(expected, ''),
          'step_id', step_id,
          'previous_step_id', previous_step_id,
          'status', status,
          'previous_status', previous_status
        )
        order by
          case grp
            when 'new_failure' then 1
            when 'still_failing' then 2
            when 'newly_fixed' then 3
            when 'not_comparable' then 4
            when 'added' then 5
            when 'removed' then 6
            else 7
          end,
          case when grp = 'added' and status = 'failed' then 0 else 1 end,
          case when grp = 'removed' then p_atc_position else c_atc_position end,
          case when grp = 'removed' then p_step_position else c_step_position end
      ),
      '[]'::jsonb
    )
  )
  into v_body
  from paired;

  v_shared := (v_body -> 'counts' ->> 'shared')::bigint;

  return v_base || v_body || jsonb_build_object(
    'state', 'compared',
    'no_common_steps', v_shared = 0,
    'nothing_changed',
      v_shared >= 1
      and (v_body -> 'counts' ->> 'added')::bigint = 0
      and (v_body -> 'counts' ->> 'removed')::bigint = 0
      and (v_body -> 'counts' ->> 'new_failure')::bigint = 0
      and (v_body -> 'counts' ->> 'newly_fixed')::bigint = 0
      and (v_body -> 'counts' ->> 'not_comparable')::bigint = 0
  );
end;
$$;

-- anon can never execute it; authenticated is the role the user's RLS-scoped client
-- uses (cookie session and the impersonated Bearer client); service_role may execute
-- but is refused by the auth.uid() guard above.
revoke execute on function public.bunkai_compare_run(uuid) from public, anon;
grant execute on function public.bunkai_compare_run(uuid) to authenticated, service_role;
