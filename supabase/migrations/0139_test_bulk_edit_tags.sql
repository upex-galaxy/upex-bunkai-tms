-- =============================================================================
-- 0139_test_bulk_edit_tags
-- BK-2099 : bulk add or remove tags on up to 200 Tests of one workspace.
-- =============================================================================
--
-- WHY. bunkai_set_test_tags replaces one Test's whole tag set. A batch over a
-- mixed selection needs add and remove applied per Test, with one outcome per
-- Test, which a loop of the single-Test RPC cannot report. Contract: the AI
-- Product Owner and AI Tech Lead rulings on BK-2099 (Jira comments 13948 and
-- 13949), mirroring ADR-0027.
--
-- WHAT. ONE new function, bunkai_bulk_edit_test_tags. Nothing existing is
-- redefined.
--
--   * Mode add or remove, 1 to 20 tags, normalised by bunkai_normalize_test_tags
--     (reserved tags lowercased, custom tags exact-case). Matching compares the
--     normalised form of each stored tag.
--   * Per-Test subtransaction: one Test failing rolls back that Test's write and
--     its event, never the others. Outcome per distinct id: changed, unchanged
--     or refused with not_found, archived, tags_limit_exceeded or write_failed.
--   * Order per Test: not found, archived, no-op, cap of 20, write. A no-op does
--     not bump the version and writes no event.
--   * Tests are locked FOR UPDATE in id order, so two batches cannot deadlock.
--   * p_dry_run evaluates without lock, write or event. The reported tags and
--     version are the values the Test would have.
--   * One test.tags_changed event per changed Test, with bulk: true.
--
-- AUTHORIZATION (ADR-0012, rpc-authorization.md section 4).
--   1. SECURITY DEFINER with p_actor_user_id: the route uses the admin client
--      and PAT callers have no auth.uid().
--   2. Actor bind at step 0, before any table read.
--   3. Write gate on p_workspace_id before any Test read. Every Test read or
--      written is constrained to that workspace, so a foreign id is not_found
--      exactly like a missing one.
--   4. Execute for service_role only; qa_inspector_ro revoked explicitly (0085
--      default privileges, 0086 rule).
--
-- Request-level errors (nothing is written):
--   45129 bulk_selection_invalid  null, empty, null element or over 200 distinct ids
--   45130 bulk_change_invalid     bad mode, or a tag list that is empty, over 20,
--                                 blank, over 50 characters or holds a comma
--
-- Failpoint test_bulk_tags.before_event uses the ADR-0022 table (0114).
--
-- Additive and idempotent.
-- =============================================================================

create or replace function public.bunkai_bulk_edit_test_tags(
  p_actor_user_id uuid,
  p_workspace_id  uuid,
  p_test_ids      uuid[],
  p_mode          text,
  p_tags          text[],
  p_dry_run       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_ceiling   constant int := 200;
  c_max_tags  constant int := 20;
  v_tags      text[];
  v_id        uuid;
  v_test      record;
  v_new_tags  text[];
  v_outcome   text;
  v_reason    text;
  v_out_tags  text[];
  v_version   int;
  v_orig_tags text[];
  v_orig_ver  int;
  v_outcomes  jsonb := '[]'::jsonb;
  v_requested int := 0;
  v_changed   int := 0;
  v_unchanged int := 0;
  v_refused   int := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, p_workspace_id);

  if p_test_ids is null
     or cardinality(p_test_ids) = 0
     or array_position(p_test_ids, null) is not null
     or (select count(distinct x) from unnest(p_test_ids) as u(x)) > c_ceiling then
    raise exception 'bulk_selection_invalid' using errcode = '45129';
  end if;

  if p_mode is null or p_mode not in ('add', 'remove')
     or p_tags is null
     or cardinality(p_tags) = 0
     or cardinality(p_tags) > c_max_tags
     or exists (select 1 from unnest(p_tags) as u(t) where t is null or btrim(t) = '') then
    raise exception 'bulk_change_invalid' using errcode = '45130';
  end if;

  v_tags := public.bunkai_normalize_test_tags(p_tags);
  if exists (
    select 1 from unnest(v_tags) as u(t)
    where char_length(t) > 50 or position(',' in t) > 0
  ) then
    raise exception 'bulk_change_invalid' using errcode = '45130';
  end if;

  for v_id in
    select distinct x from unnest(p_test_ids) as u(x) order by x
  loop
    v_requested := v_requested + 1;
    v_outcome := null;
    v_reason := null;
    v_out_tags := null;
    v_version := null;
    v_orig_tags := null;
    v_orig_ver := null;

    begin
      if p_dry_run then
        select t.id, t.version, t.tags, t.archived_at
          into v_test
          from public.tests t
          where t.id = v_id and t.workspace_id = p_workspace_id;
      else
        select t.id, t.version, t.tags, t.archived_at
          into v_test
          from public.tests t
          where t.id = v_id and t.workspace_id = p_workspace_id
          for update;
      end if;

      if not found then
        v_outcome := 'refused';
        v_reason := 'not_found';
      else
        v_orig_tags := v_test.tags;
        v_orig_ver := v_test.version;
        v_out_tags := v_orig_tags;
        v_version := v_orig_ver;

        if v_test.archived_at is not null then
          v_outcome := 'refused';
          v_reason := 'archived';
        else
          if p_mode = 'add' then
            v_new_tags := v_test.tags || array(
              select u.t
                from unnest(v_tags) with ordinality as u(t, ord)
                where not exists (
                  select 1 from unnest(v_test.tags) as e(t)
                   where (public.bunkai_normalize_test_tags(array[e.t]))[1] = u.t
                )
                order by u.ord
            );
          else
            v_new_tags := array(
              select e.t
                from unnest(v_test.tags) with ordinality as e(t, ord)
                where coalesce((public.bunkai_normalize_test_tags(array[e.t]))[1], e.t) <> all (v_tags)
                order by e.ord
            );
          end if;

          if cardinality(v_new_tags) = cardinality(v_test.tags) then
            v_outcome := 'unchanged';
          elsif cardinality(v_new_tags) > c_max_tags then
            v_outcome := 'refused';
            v_reason := 'tags_limit_exceeded';
          else
            if not p_dry_run then
              update public.tests
                set tags = v_new_tags, version = version + 1
                where id = v_test.id;

              if exists (
                select 1 from public.bunkai_test_failpoints f
                 where f.name = 'test_bulk_tags.before_event'
                   and f.workspace_id = p_workspace_id
              ) then
                raise exception 'test_failpoint' using errcode = 'P0001';
              end if;

              insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
              values (
                p_workspace_id, p_actor_user_id, 'test', v_test.id, 'test.tags_changed',
                jsonb_build_object(
                  'version', v_test.version + 1,
                  'old_tags', to_jsonb(v_test.tags),
                  'new_tags', to_jsonb(v_new_tags),
                  'bulk', true
                )
              );
            end if;
            v_outcome := 'changed';
            v_out_tags := v_new_tags;
            v_version := v_test.version + 1;
          end if;
        end if;
      end if;
    exception
      when others then
        v_outcome := 'refused';
        v_reason := 'write_failed';
        v_out_tags := v_orig_tags;
        v_version := v_orig_ver;
    end;

    if v_outcome = 'changed' then
      v_changed := v_changed + 1;
    elsif v_outcome = 'unchanged' then
      v_unchanged := v_unchanged + 1;
    else
      v_refused := v_refused + 1;
    end if;

    v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
      'test_id', v_id,
      'outcome', v_outcome,
      'reason', v_reason,
      'tags', to_jsonb(v_out_tags),
      'version', v_version
    ));
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'mode', p_mode,
    'requested', v_requested,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'refused', v_refused,
    'outcomes', v_outcomes
  );
end;
$$;

comment on function public.bunkai_bulk_edit_test_tags(uuid, uuid, uuid[], text, text[], boolean) is
  'BK-2099: add or remove 1 to 20 tags on up to 200 Tests of one workspace. Per-Test outcomes, partial success, no-op before cap. service_role only.';

revoke execute on function public.bunkai_bulk_edit_test_tags(uuid, uuid, uuid[], text, text[], boolean)
  from public, anon, authenticated;
grant execute on function public.bunkai_bulk_edit_test_tags(uuid, uuid, uuid[], text, text[], boolean)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_bulk_edit_test_tags(uuid, uuid, uuid[], text, text[], boolean)
      from qa_inspector_ro;
  end if;
end;
$$;
