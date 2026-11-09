-- 0121_automated_run_submission.sql — BK-222: submit an automated run with step results
--
-- ADDITIVE and idempotent. Builds on runs (0031), the module snapshot and
-- bunkai_run_json (0040), the workspace helpers (0089), the run-event
-- notification trigger (0107) and access_tokens (0008).
--
-- Adds:
--   * runs.executor_token_id  — the PAT that submitted the run (provenance)
--   * runs.executor_name      — snapshot of the token name (fallback 'API token')
--   * runs.evidence_urls      — http(s) evidence links, at most 20
--   * run_submission_keys     — the domain idempotency keys of submissions
--                               (DEFINER-only: RLS on, no policy, ADR-0026)
--   * bunkai_run_json         — re-created: ONLY executor_name + evidence_urls
--                               added; the rest is the 0040 body verbatim
--                               (the live prosrc was diffed against 0040 first)
--   * bunkai_submit_automated_run — creates a Run already finished, with the
--                               submitted per-step results (executor mode `agent`)
--
-- SQLSTATE block allocated here (45231-45238; 45224 and 45230 were the last used):
--   45231  submission_key_conflict          same key, different payload (409)
--   45232  submission_vocabulary_invalid    verdict / step result outside the vocabulary
--   45233  submission_steps_incomplete      chain positions without a result (DETAIL lists them)
--   45234  submission_steps_invalid         malformed / duplicate / out-of-range positions
--   45235  submission_verdict_inconsistent  verdict contradicts the step results
--   45236  submission_field_invalid         duration / evidence / key out of bounds (DETAIL names it)
--   45237  submission_token_invalid         token missing, revoked, expired or not the actor's (401)
--   45238  submission_token_unscoped        token not bound to a workspace (403)
-- Reused: 45201 environment_invalid, 45202 no_executable_steps, P0002 test not
-- found (non-disclosing, 404), 42501 forbidden (viewer or missing scope, 403).
--
-- ADR-0012 (RPC authorization invariant), the six questions:
--   1. DEFINER needed: yes — it writes runs/run_atcs/run_steps/activity_log
--      (no client write path for this shape) and reads access_tokens.
--   2. The identity parameter cannot be removed (writes are DEFINER-only), so
--      it is guarded.
--   3. Actor bind at step 0, before any table read; the token is bound to the
--      actor (access_tokens.user_id = p_actor_user_id, not revoked, not expired).
--   4. Returned rows: only the Run just created/replayed, which belongs to the
--      Test's workspace = the token's workspace (asserted).
--   5. Missing Test / foreign workspace / non-member -> the same P0002 (404);
--      a viewer gets 42501 (403) only after membership is proven.
--   6. DB-integration test: lib/runs/submission-isolation.test.ts.
--
-- Idempotency (ADR-0026): the optional key lives in the body, scoped per
-- workspace; the 24h window runs on the key row's created_at, never on
-- runs.started_at (which is backdated by the reported duration). One advisory
-- transaction lock per (workspace, key) serializes concurrent submissions; a
-- rejected submission rolls the whole function back, so it never consumes a key.

-- ============================================================================
-- 1. runs provenance columns
-- ============================================================================

alter table public.runs
  add column if not exists executor_token_id uuid references public.access_tokens(id) on delete set null;

alter table public.runs
  add column if not exists executor_name text;

alter table public.runs
  add column if not exists evidence_urls text[] not null default '{}';

alter table public.runs
  drop constraint if exists runs_executor_name_len_chk;
alter table public.runs
  add constraint runs_executor_name_len_chk
  check (executor_name is null or char_length(executor_name) between 1 and 200);

alter table public.runs
  drop constraint if exists runs_evidence_urls_max_chk;
alter table public.runs
  add constraint runs_evidence_urls_max_chk
  check (cardinality(evidence_urls) <= 20);

-- ============================================================================
-- 2. run_submission_keys — domain idempotency keys (DEFINER-only)
-- ============================================================================

create table if not exists public.run_submission_keys (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 64),
  request_hash    text not null,
  run_id          uuid not null references public.runs(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (workspace_id, idempotency_key)
);

create index if not exists run_submission_keys_run_id_idx
  on public.run_submission_keys (run_id);

alter table public.run_submission_keys enable row level security;

-- No policy at all: only the SECURITY DEFINER RPC below reads or writes it.
revoke all on public.run_submission_keys from anon, authenticated;
grant select, insert, update, delete on public.run_submission_keys to service_role;

-- ============================================================================
-- 3. bunkai_run_json — re-created (0040 body + executor_name + evidence_urls)
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
-- 4. bunkai_submit_automated_run
-- ============================================================================

create or replace function public.bunkai_submit_automated_run(
  p_actor_user_id    uuid,
  p_token_id         uuid,
  p_test_id          uuid,
  p_environment_name text,
  p_verdict          text,
  p_duration_seconds int,
  p_steps            jsonb,
  p_evidence_urls    text[] default '{}',
  p_idempotency_key  text default null
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

  v_hash := md5(jsonb_build_object(
    'test_id', p_test_id,
    'environment', lower(v_env_name),
    'verdict', p_verdict,
    'duration_seconds', p_duration_seconds,
    'steps', v_norm,
    'evidence_urls', to_jsonb(v_evidence)
  )::text);

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
    evidence_urls, start_token, test_title, started_at, finished_at
  )
  values (
    v_workspace_id, v_project_id, p_test_id, v_env_id, v_module_id,
    p_verdict, 'agent', p_actor_user_id, p_token_id,
    left(coalesce(nullif(btrim(v_token_name), ''), 'API token'), 200),
    v_evidence, gen_random_uuid()::text, v_test_title, v_started, now()
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

revoke execute on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text) from public, anon;
grant execute on function public.bunkai_submit_automated_run(uuid, uuid, uuid, text, text, int, jsonb, text[], text) to authenticated, service_role;
