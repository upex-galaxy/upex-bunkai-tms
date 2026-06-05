-- Migration: 0017 — acceptance-criteria ordering + ready-to-test gate (BK-15)
-- Authored: 2026-06-05
--
-- Adds the User-Story ready-to-test status and makes acceptance-criteria
-- ordering soft-delete-aware + atomic:
--   * user_stories.status (draft | ready_to_test) for the BK-15 gate.
--   * Replaces the FULL unique (user_story_id, position) — which let archived
--     rows keep their slot forever — with a PARTIAL unique over ACTIVE rows,
--     plus an active-list index.
--   * Three SECURITY DEFINER functions (insert / move / archive) that rebalance
--     positions atomically and collision-free via negative-parking, so the
--     partial unique index never sees a transient duplicate mid-shift. Each
--     resolves the workspace from user_stories.project_id and role-gates with
--     bunkai_can_write_workspace (DEFINER bypasses RLS), raising 42501 for a
--     viewer and P0002 for a missing parent/criterion.
--
-- Advisor lint 0029 (function search_path) on these DEFINER fns is the accepted
-- project posture: they pin `set search_path = ''` and fully-qualify every ref.

-- 1. User-Story ready-to-test status.
alter table public.user_stories
  add column if not exists status text not null default 'draft';

alter table public.user_stories
  drop constraint if exists user_stories_status_check;
alter table public.user_stories
  add constraint user_stories_status_check check (status in ('draft', 'ready_to_test'));

-- 2. Position uniqueness over ACTIVE rows only (archived rows release their slot).
alter table public.acceptance_criteria
  drop constraint if exists acceptance_criteria_user_story_id_position_key;

create unique index if not exists acceptance_criteria_position_active_uniq
  on public.acceptance_criteria (user_story_id, position)
  where archived_at is null;

create index if not exists acceptance_criteria_us_active_idx
  on public.acceptance_criteria (user_story_id)
  where archived_at is null;

-- 3a. Insert at a position, shifting active siblings down (collision-free).
create or replace function public.bunkai_insert_acceptance_criterion(
  p_user_story_id uuid,
  p_title         text,
  p_description   text default null,
  p_position      int  default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_count        int;
  v_target       int;
  v_row          public.acceptance_criteria;
begin
  select project_id into v_project_id
    from public.user_stories
    where id = p_user_story_id and archived_at is null;
  if v_project_id is null then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Serialize concurrent inserts/moves on the same parent story.
  perform 1 from public.user_stories where id = p_user_story_id for update;

  select count(*) into v_count
    from public.acceptance_criteria
    where user_story_id = p_user_story_id and archived_at is null;

  v_target := coalesce(p_position, v_count + 1);
  if v_target < 1 then v_target := 1; end if;
  if v_target > v_count + 1 then v_target := v_count + 1; end if;

  -- Negative-parking shift: park active siblings >= target, then restore +1.
  -- Active positions are >= 1, so the negative band never collides with them.
  update public.acceptance_criteria
    set position = -position
    where user_story_id = p_user_story_id and archived_at is null and position >= v_target;
  update public.acceptance_criteria
    set position = (-position) + 1
    where user_story_id = p_user_story_id and archived_at is null and position < 0;

  insert into public.acceptance_criteria (user_story_id, title, description, position)
    values (p_user_story_id, p_title, p_description, v_target)
    returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.bunkai_insert_acceptance_criterion(uuid, text, text, int) from public, anon;

-- 3b. Move within the sibling set, re-numbering contiguously (collision-free).
create or replace function public.bunkai_move_acceptance_criterion(
  p_id           uuid,
  p_new_position int
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
  v_count         int;
  v_target        int;
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

  select count(*) into v_count
    from public.acceptance_criteria
    where user_story_id = v_user_story_id and archived_at is null;

  v_target := p_new_position;
  if v_target < 1 then v_target := 1; end if;
  if v_target > v_count then v_target := v_count; end if;

  -- No-op: position unchanged.
  if v_target = v_old then
    select * into v_row from public.acceptance_criteria where id = p_id;
    return to_jsonb(v_row);
  end if;

  -- Park the whole active set negative, set the moved row to its target, then
  -- re-thread the remaining rows into the slots around the target in order.
  update public.acceptance_criteria
    set position = -position
    where user_story_id = v_user_story_id and archived_at is null;

  update public.acceptance_criteria
    set position = v_target
    where id = p_id;

  with others as (
    select id, row_number() over (order by (-position)) as rn
      from public.acceptance_criteria
      where user_story_id = v_user_story_id and archived_at is null and position < 0
  )
  update public.acceptance_criteria ac
    set position = case when others.rn < v_target then others.rn else others.rn + 1 end
    from others
    where ac.id = others.id;

  select * into v_row from public.acceptance_criteria where id = p_id;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.bunkai_move_acceptance_criterion(uuid, int) from public, anon;

-- 3c. Soft-archive, close the position gap, and revert the parent story to
--     draft when its last active criterion is removed (BK-15 AC6).
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
    where ac.id = p_id and ac.archived_at is null;
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

  -- Close the gap: shift active siblings after the removed slot down by one,
  -- via the same negative-parking trick to avoid transient unique collisions.
  update public.acceptance_criteria
    set position = -position
    where user_story_id = v_user_story_id and archived_at is null and position > v_old;
  update public.acceptance_criteria
    set position = (-position) - 1
    where user_story_id = v_user_story_id and archived_at is null and position < 0;

  -- AC6: removing the last active criterion drops the story out of ready_to_test.
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
