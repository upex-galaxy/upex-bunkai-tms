-- Migration: 0035 — ATC edit propagation: real affected_test_ids in atc.updated (BK-21)
-- Authored: 2026-06-24
--
-- BK-21 makes an ATC edit cascade to every Test that chains it. The cascade
-- itself is already automatic: Tests reference an ATC through test_steps.atc_id
-- (0024) and NEVER copy its step/assertion content (snapshots belong to Runs,
-- 0031 / ADR-0004), so a referencing Test renders the edited content on its
-- next read with zero extra work. This migration closes the one remaining gap:
-- the `atc.updated` event (0021) hard-coded `affected_test_ids: []` with the
-- note "test_steps not yet built". test_steps shipped in 0024 — so we now
-- compute the REAL set of affected Tests inside the same transaction as the
-- edit (read consistency: the event always matches the persisted change).
--
-- BACKWARD COMPATIBLE BY DESIGN. The remote Supabase project is shared across
-- local/staging/production (single project ref), so a `create or replace` is
-- live for every environment the instant it is applied — including the prod
-- route still running the old code. We therefore DO NOT change the function's
-- return shape: bunkai_update_atc still returns the bare composed ATC json, so
-- the currently-deployed PATCH route (`{ atc: data }`) keeps working unchanged.
-- The only observable change is the event payload (additive — consumers already
-- handle the array). The HTTP `affected_test_count` is derived by the route via
-- the existing bunkai_atc_usage RPC (0029), not by changing this return.
--
-- Affected-Test model (identical to bunkai_atc_usage / BK-22, 0029): the count
-- is DISTINCT Tests that chain this ATC. A Test that references the ATC at more
-- than one position counts ONCE (test_steps has no unique(test_id, atc_id) — a
-- chain is a sequence, not a set, 0024:60-68). Reuses the test_steps_atc_id_idx
-- index (0024:72). No layer-policy gate: the `tests` table has no layer_policy
-- column, so there is nothing to enforce (BK-21 contract decision Q5 — deferred;
-- see ADR-0009). Archived ATCs remain non-editable (archived_at is null guard,
-- unchanged). Tests have no archive state, so all referencing Tests are live.

create or replace function public.bunkai_update_atc(
  p_actor_user_id uuid,
  p_atc_id        uuid,
  p_if_match      int,
  p_title         text,
  p_layer         text,
  p_tags          text[],
  p_steps         jsonb,
  p_assertions    jsonb,
  p_ac_ids        uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id    uuid;
  v_user_story_id uuid;
  v_version       int;
  v_workspace_id  uuid;
  v_ac_count      int;
  v_distinct_ac   int;
  v_step          jsonb;
  v_assertion     jsonb;
  v_position      int;
  v_ac_id         uuid;
  v_affected_ids  uuid[];
begin
  -- Lock the header; capture scope + current version.
  select project_id, user_story_id, version
    into v_project_id, v_user_story_id, v_version
    from public.atcs
    where id = p_atc_id and archived_at is null
    for update;
  if v_project_id is null then
    raise exception 'atc_not_found' using errcode = 'P0002';
  end if;

  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, v_project_id);

  -- Optimistic lock: If-Match must match the locked version. Current version is
  -- embedded in the message so the route can surface it in the 409 body.
  if p_if_match is not null and p_if_match <> v_version then
    raise exception 'version_conflict:%', v_version using errcode = '45022';
  end if;

  -- AC re-validation against the ATC's immutable user story.
  if coalesce(array_length(p_ac_ids, 1), 0) = 0 then
    raise exception 'ac_outside_user_story' using errcode = '45020';
  end if;
  select count(*) into v_ac_count
    from public.acceptance_criteria ac
    where ac.id = any(p_ac_ids)
      and ac.user_story_id = v_user_story_id
      and ac.archived_at is null;
  select count(distinct x) into v_distinct_ac from unnest(p_ac_ids) as x;
  if v_ac_count <> v_distinct_ac then
    raise exception 'ac_outside_user_story' using errcode = '45020';
  end if;

  -- Header update + version bump. user_story_id / module_id / slug stay put.
  update public.atcs
    set title = p_title,
        layer = p_layer,
        tags = coalesce(p_tags, '{}'),
        version = version + 1,
        updated_at = now()
    where id = p_atc_id;

  -- Children: full replace. Steps persist the submitted (validated) position;
  -- assertions take the 1..N ordinal.
  delete from public.atc_steps where atc_id = p_atc_id;
  v_position := 1;
  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.atc_steps (atc_id, position, content, input_data, expected)
    values (
      p_atc_id, coalesce((v_step ->> 'position')::int, v_position),
      coalesce(v_step ->> 'content', ''),
      nullif(v_step ->> 'input_data', ''),
      nullif(v_step ->> 'expected', '')
    );
    v_position := v_position + 1;
  end loop;

  delete from public.atc_assertions where atc_id = p_atc_id;
  v_position := 1;
  for v_assertion in select * from jsonb_array_elements(coalesce(p_assertions, '[]'::jsonb))
  loop
    insert into public.atc_assertions (atc_id, position, content)
    values (p_atc_id, v_position, coalesce(v_assertion ->> 'content', ''));
    v_position := v_position + 1;
  end loop;

  delete from public.atc_acceptance_criteria where atc_id = p_atc_id;
  foreach v_ac_id in array p_ac_ids loop
    insert into public.atc_acceptance_criteria (atc_id, acceptance_criterion_id)
    values (p_atc_id, v_ac_id)
    on conflict do nothing;
  end loop;

  -- BK-21: the DISTINCT Tests that chain this ATC, computed in-transaction so
  -- the emitted event matches the persisted edit exactly. A Test referencing
  -- the ATC at several positions collapses to one id (array_agg(distinct)).
  -- Empty when the ATC is chained by no Test → to_jsonb yields '[]'.
  select coalesce(array_agg(distinct ts.test_id), '{}')
    into v_affected_ids
    from public.test_steps ts
    where ts.atc_id = p_atc_id;

  -- Event: atc.updated, now carrying the real affected Test ids (BK-21).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'atc', p_atc_id, 'atc.updated',
    jsonb_build_object('title', p_title, 'version', v_version + 1, 'affected_test_ids', to_jsonb(v_affected_ids))
  );

  -- Return shape UNCHANGED (bare composed ATC) for backward compatibility on
  -- the shared remote project — see header note. The route derives
  -- affected_test_count via bunkai_atc_usage (0029).
  return public.bunkai_atc_json(p_atc_id);
end;
$$;

revoke execute on function public.bunkai_update_atc(uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.bunkai_update_atc(uuid, uuid, int, text, text, text[], jsonb, jsonb, uuid[]) to authenticated, service_role;
