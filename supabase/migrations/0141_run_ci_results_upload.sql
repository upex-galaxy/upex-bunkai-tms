-- 0141_run_ci_results_upload.sql — BK-226: upload a CI results file to create a run
--
-- ADDITIVE. Three columns on runs (null or empty for every run created before this
-- migration) and two re-created functions whose bodies are the live-verified 0137
-- sources (md5(prosrc) equal to 0137 before this change) with only the upload lines
-- added:
--   bunkai_run_json             + 'report' (null unless the run came from an upload)
--   bunkai_submit_automated_run + 3 trailing params, dropped and re-created because
--                                 its signature grows (0137 pattern). The new params
--                                 default to the BK-222 behaviour, so an existing
--                                 caller resolves exactly as before, and the
--                                 idempotency hash of an 'api' submission is
--                                 byte-identical to 0137's.
--
-- BK-226 adds one source to the BK-222 rulebook instead of a second way to create
-- runs (AI Tech Lead decision, 2026-11-27):
--   p_source      'api' (default, token required, executor_mode 'agent') or
--                 'upload' (a CI results file, executor_mode 'ci'; the token may be
--                 null when the signed-in session uploads)
--   p_step_notes  { "<chain ordinal>": "<message>" } written to the note of the
--                 first run step of that chain step (1..2000 chars)
--   p_report      { file_name, entry_count, unmapped: [{ index, name, classname,
--                 result }] } stored on the run (upload only)
--
-- No new SQLSTATE: a bad source, note or report raises 45236
-- submission_field_invalid with the field in DETAIL; a missing token on 'api' raises
-- 45237 as before.
--
-- ADR-0012, the six questions:
--   1. DEFINER still needed: the function writes runs/run_atcs/run_steps/activity_log.
--   2. The identity parameter cannot be removed; it stays guarded.
--   3. The actor bind at step 0 is unchanged. With a token, the token must be the
--      actor's own (unchanged). Without one (upload only), the actor is the session
--      user: a present auth.uid() different from p_actor_user_id is the same P0002.
--      Its audit rows say via 'cookie', so the run-event trigger (0107) keeps
--      suppressing the uploader's own notification.
--   4. Only the run just created or replayed is returned, inside the Test's workspace.
--   5. Missing Test, foreign workspace, non-member: the same P0002. Viewer: 42501
--      after membership is proven. A token still only reaches its own workspace.
--   6. DB-integration test: lib/runs/ci-upload-isolation.test.ts.
--
-- Read-only projects: the BK-233 trigger on runs (0140) refuses the insert, so an
-- upload into a read-only project fails with 45701 like every other write.

alter table public.runs add column if not exists report_file_name text;
alter table public.runs add column if not exists report_entry_count int;
alter table public.runs add column if not exists report_unmapped jsonb not null default '[]'::jsonb;

alter table public.runs drop constraint if exists runs_report_file_name_chk;
alter table public.runs
  add constraint runs_report_file_name_chk
  check (report_file_name is null or char_length(report_file_name) between 1 and 255);

alter table public.runs drop constraint if exists runs_report_entry_count_chk;
alter table public.runs
  add constraint runs_report_entry_count_chk
  check (report_entry_count is null or report_entry_count between 1 and 1000);

alter table public.runs drop constraint if exists runs_report_unmapped_chk;
alter table public.runs
  add constraint runs_report_unmapped_chk
  check (jsonb_typeof(report_unmapped) = 'array' and jsonb_array_length(report_unmapped) <= 1000);

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
    'report', case when r.report_entry_count is null then null else jsonb_build_object(
      'file_name', r.report_file_name,
      'entry_count', r.report_entry_count,
      'unmapped_count', jsonb_array_length(r.report_unmapped),
      'unmapped', r.report_unmapped
    ) end,
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

drop function if exists public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text, text, text, text, text);

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
  p_ci_pipeline_url  text default null,
  p_source           text default 'api',
  p_step_notes       jsonb default null,
  p_report           jsonb default null
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
  v_source       text := coalesce(p_source, 'api');
  v_mode         text;
  v_notes        jsonb := coalesce(p_step_notes, '{}'::jsonb);
  v_unmapped     jsonb := '[]'::jsonb;
  v_report_name  text;
  v_report_count int;
  v_note_key     text;
  v_note_val     jsonb;
  v_first_step   boolean;
begin
  -- 0. Actor bind (ADR-0012). NULL auth.uid() = service role / admin client, for
  --    which the parameter IS the identity; a present-but-different uid is a
  --    spoof and collapses into the missing-Test answer.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;

  -- 0b. BK-226: the source. 'api' is the BK-222 submission (token required);
  --     'upload' is a CI results file, from a token or from the signed-in session.
  if v_source not in ('api', 'upload') then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'source';
  end if;
  v_mode := case v_source when 'upload' then 'ci' else 'agent' end;

  -- 1. The token: the actor's own, active, scoped run:execute, bound to a workspace.
  --    Only an upload may come without one (the session is then the identity).
  if p_token_id is null then
    if v_source <> 'upload' then
      raise exception 'submission_token_invalid' using errcode = '45237';
    end if;
  else
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
  end if;

  -- 2. The Test: missing or in another workspace than the token's -> the same 404.
  select workspace_id, title
    into v_workspace_id, v_test_title
    from public.tests
    where id = p_test_id;
  if v_workspace_id is null or (p_token_id is not null and v_workspace_id <> v_token_ws) then
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
  if v_source = 'api' and (p_step_notes is not null or p_report is not null) then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'report';
  end if;

  if jsonb_typeof(v_notes) <> 'object' then
    raise exception 'submission_field_invalid' using errcode = '45236', detail = 'step_notes';
  end if;
  for v_note_key, v_note_val in select key, value from jsonb_each(v_notes) loop
    if v_note_key !~ '^[1-9][0-9]{0,3}$' or jsonb_typeof(v_note_val) <> 'string' then
      raise exception 'submission_field_invalid' using errcode = '45236', detail = 'step_notes';
    end if;
    if v_note_key::int > v_chain_len or char_length(v_note_val #>> '{}') not between 1 and 2000 then
      raise exception 'submission_field_invalid' using errcode = '45236', detail = 'step_notes';
    end if;
  end loop;

  if v_source = 'upload' then
    if p_report is null or jsonb_typeof(p_report) <> 'object'
       or jsonb_typeof(p_report -> 'file_name') is distinct from 'string'
       or jsonb_typeof(p_report -> 'entry_count') is distinct from 'number'
       or jsonb_typeof(coalesce(p_report -> 'unmapped', '[]'::jsonb)) <> 'array' then
      raise exception 'submission_field_invalid' using errcode = '45236', detail = 'report';
    end if;
    v_report_name := p_report ->> 'file_name';
    v_unmapped := coalesce(p_report -> 'unmapped', '[]'::jsonb);
    if char_length(v_report_name) not between 1 and 255 or (p_report ->> 'entry_count') !~ '^[0-9]{1,4}$' then
      raise exception 'submission_field_invalid' using errcode = '45236', detail = 'report';
    end if;
    v_report_count := (p_report ->> 'entry_count')::int;
    if v_report_count not between 1 and 1000 or jsonb_array_length(v_unmapped) >= v_report_count then
      raise exception 'submission_field_invalid' using errcode = '45236', detail = 'report';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_unmapped) u
      where jsonb_typeof(u) <> 'object'
         or jsonb_typeof(u -> 'index') is distinct from 'number'
         or (u ->> 'index') !~ '^[1-9][0-9]{0,3}$'
         or jsonb_typeof(u -> 'name') is distinct from 'string'
         or char_length(u ->> 'name') > 255
         or jsonb_typeof(coalesce(u -> 'classname', '""'::jsonb)) <> 'string'
         or char_length(coalesce(u ->> 'classname', '')) > 255
         or coalesce(u ->> 'result', '') not in ('pass', 'fail', 'block')
    ) then
      raise exception 'submission_field_invalid' using errcode = '45236', detail = 'report';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'index', (u ->> 'index')::int,
             'name', u ->> 'name',
             'classname', coalesce(u ->> 'classname', ''),
             'result', u ->> 'result'
           ) order by n), '[]'::jsonb)
      into v_unmapped
      from jsonb_array_elements(v_unmapped) with ordinality as e(u, n);
  end if;

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
  )) || case when v_source = 'upload' then jsonb_build_object(
    'source', v_source,
    'step_notes', v_notes,
    'report', p_report
  ) else '{}'::jsonb end)::text);

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
    ci_commit, ci_branch, ci_pipeline_name, ci_pipeline_url,
    report_file_name, report_entry_count, report_unmapped
  )
  values (
    v_workspace_id, v_project_id, p_test_id, v_env_id, v_module_id,
    p_verdict, v_mode, p_actor_user_id, p_token_id,
    case when p_token_id is null then null
         else left(coalesce(nullif(btrim(v_token_name), ''), 'API token'), 200) end,
    v_evidence, gen_random_uuid()::text, v_test_title, v_started, now(),
    p_ci_commit, p_ci_branch, p_ci_pipeline_name, p_ci_pipeline_url,
    v_report_name, v_report_count, v_unmapped
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

    v_first_step := true;
    for v_step in
      select s.id as atc_step_id, s.position, s.content, s.input_data, s.expected
      from public.atc_steps s
      where s.atc_id = v_atc.atc_id
      order by s.position
    loop
      insert into public.run_steps (
        run_atc_id, atc_step_id, position, content, input_data, expected, status, note, executed_at
      )
      values (
        v_run_atc_id, v_step.atc_step_id, v_step.position,
        v_step.content, v_step.input_data, v_step.expected, v_status,
        case when v_first_step then v_notes ->> v_atc.ordinal::text end, now()
      );
      v_first_step := false;
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
      'executor_mode', v_mode,
      'step_count', v_step_count,
      'submitted', true
    )
  );
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', v_run_id, 'run.finished',
    jsonb_build_object(
      'verdict', p_verdict, 'skipped_steps', 0,
      'via', case when p_token_id is null then 'cookie' else 'bearer' end,
      'source', v_source, 'submitted', true
    )
  );

  return public.bunkai_run_json(v_run_id) || jsonb_build_object('replayed', false);
end;
$$;

revoke execute on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text, text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text, text, text, text, text, text, jsonb, jsonb) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text, text, text, text, text, text, jsonb, jsonb) from qa_inspector_ro;
  end if;
end
$$;
