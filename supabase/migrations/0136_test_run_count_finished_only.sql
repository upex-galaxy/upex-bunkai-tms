-- =============================================================================
-- 0136_test_run_count_finished_only
-- BK-2241 : the archive confirmation counts finished Runs only.
-- =============================================================================
--
-- WHY. 0134 added run_count to bunkai_test_json for the archive confirmation
-- ("N Runs have been recorded. They are kept and stay readable."). It counted
-- every row of public.runs for the Test, Runs still in status 'running'
-- included, while the Test's Run History (bunkai_list_test_runs, 0099) lists
-- and totals only finished Runs (passed, failed, aborted). A Test whose only
-- Runs were in progress read "2 Runs have been recorded" next to "0 runs all
-- time".
--
-- WHAT. bunkai_test_json, body from 0134_test_archive_restore, with run_count
-- filtered to status in ('passed', 'failed', 'aborted'), the same filter Run
-- History uses. Nothing else changes. CREATE OR REPLACE keeps the signature,
-- owner and grants.

create or replace function public.bunkai_test_json(p_test_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'workspace_id', t.workspace_id,
    'title', t.title,
    'version', t.version,
    'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb),
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    -- BK-596: the archive state, plus what the archive confirmation names (the
    -- Runs that are kept and the Test Plans that keep holding the Test).
    -- BK-2241: finished Runs only, as Run History counts them.
    'archived_at', t.archived_at,
    'archived_by', t.archived_by,
    'run_count', (select count(*) from public.runs r
                   where r.test_id = t.id
                     and r.status in ('passed', 'failed', 'aborted')),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('id', tp.id, 'name', tp.name, 'status', tp.status)
                       order by tp.name, tp.id)
        from public.test_plan_tests tpt
        join public.test_plans tp on tp.id = tpt.test_plan_id
        where tpt.test_id = t.id), '[]'::jsonb),
    'atc_count', (select count(*) from public.test_steps ts where ts.test_id = t.id),
    'atcs', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'position', ts.position,
                 'step_id', ts.id,
                 'id', a.id,
                 'slug', a.slug,
                 'title', a.title,
                 'layer', a.layer,
                 'status', a.status,
                 'archived_at', a.archived_at,
                 'steps', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', s.id, 'position', s.position, 'content', s.content,
                            'input_data', s.input_data, 'expected', s.expected) order by s.position)
                     from public.atc_steps s where s.atc_id = a.id), '[]'::jsonb),
                 'assertions', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', x.id, 'position', x.position, 'content', x.content) order by x.position)
                     from public.atc_assertions x where x.atc_id = a.id), '[]'::jsonb)
               ) order by ts.position)
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id), '[]'::jsonb)
  )
  from public.tests t
  where t.id = p_test_id;
$$;
