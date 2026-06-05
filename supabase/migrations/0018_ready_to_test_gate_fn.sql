-- Migration: 0018 — serialize the ready-to-test gate; tighten the archive fn (BK-15 review)
-- Authored: 2026-06-05
--
-- Adversarial-review fixes for BK-15:
--   * bunkai_set_user_story_status: a SECURITY DEFINER setter that takes a
--     FOR UPDATE lock on the story row before counting active criteria, closing
--     a TOCTOU race where a concurrent last-criterion archive could otherwise
--     strand a story in ready_to_test with zero active criteria. The archive fn
--     takes the SAME FOR UPDATE lock, so the two serialize. Raises 45010 when the
--     gate fails (zero active criteria) and 42501 for a viewer.
--   * bunkai_archive_acceptance_criterion: add `us.archived_at is null` to the
--     parent join so it matches the move fn (no archiving under an archived story).

-- Serialized ready-to-test status setter.
create or replace function public.bunkai_set_user_story_status(
  p_id     uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_active       int;
  v_row          public.user_stories;
begin
  select project_id into v_project_id
    from public.user_stories
    where id = p_id and archived_at is null;
  if v_project_id is null then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Lock the story row so the gate serializes against criterion archival
  -- (bunkai_archive_acceptance_criterion takes the same FOR UPDATE lock).
  perform 1 from public.user_stories where id = p_id for update;

  if p_status = 'ready_to_test' then
    select count(*) into v_active
      from public.acceptance_criteria
      where user_story_id = p_id and archived_at is null;
    if v_active = 0 then
      raise exception 'ac_required_for_ready_to_test' using errcode = '45010';
    end if;
  end if;

  update public.user_stories
    set status = p_status
    where id = p_id and archived_at is null
    returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.bunkai_set_user_story_status(uuid, text) from public, anon;

-- Archive fn: also require the parent story to be active (parity with the move fn).
create or replace function public.bunkai_archive_acceptance_criterion(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_story_id uuid;
  v_project_id    uuid;
  v_workspace_id  uuid;
  v_old           int;
  v_remaining     int;
  v_rev_count     int;
  v_reverted      boolean;
  v_row           public.acceptance_criteria;
begin
  select ac.user_story_id, ac.position, us.project_id
    into v_user_story_id, v_old, v_project_id
    from public.acceptance_criteria ac
    join public.user_stories us on us.id = ac.user_story_id
    where ac.id = p_id and ac.archived_at is null and us.archived_at is null;
  if v_user_story_id is null then
    raise exception 'criterion_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.user_stories where id = v_user_story_id for update;

  update public.acceptance_criteria
    set archived_at = now()
    where id = p_id
    returning * into v_row;

  update public.acceptance_criteria
    set position = -position
    where user_story_id = v_user_story_id and archived_at is null and position > v_old;
  update public.acceptance_criteria
    set position = (-position) - 1
    where user_story_id = v_user_story_id and archived_at is null and position < 0;

  select count(*) into v_remaining
    from public.acceptance_criteria
    where user_story_id = v_user_story_id and archived_at is null;
  if v_remaining = 0 then
    update public.user_stories
      set status = 'draft'
      where id = v_user_story_id and status = 'ready_to_test';
    get diagnostics v_rev_count = row_count;
    v_reverted := v_rev_count > 0;
  else
    v_reverted := false;
  end if;

  return jsonb_build_object('criterion', to_jsonb(v_row), 'user_story_reverted', v_reverted);
end;
$$;

revoke execute on function public.bunkai_archive_acceptance_criterion(uuid) from public, anon;
