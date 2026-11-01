-- 0112_milestone_plans.sql — BK-206: TMS-Milestone | Assign test plans and track
-- milestone readiness
--
-- ADDITIVE ONLY: one new table, its unique index, SELECT-only RLS, three new
-- functions. Nothing is dropped, renamed or rewritten, and every statement is
-- idempotent (if not exists / create or replace / drop policy if exists).
--
--   * milestone_plans                    — membership of a Test Plan in a Milestone.
--                                          A reference, never a copy: detaching never
--                                          touches the plan or its progress, and one
--                                          plan may serve several milestones.
--   * bunkai_attach_plans_to_milestone   — attach one or more plans (member+).
--   * bunkai_detach_plan_from_milestone  — detach one plan (member+), idempotent.
--   * bunkai_milestones_readiness        — pooled readiness for a set of milestones,
--                                          plus the per-plan rows behind it.
--
-- Decisions followed (Jira BK-206: PO answers Q1-Q5 and Dev answers D1-D7 ratified
-- 2026-10-25, and the AI Tech Lead / AI Product Owner decision posted on the ticket
-- at Stage 1):
--   Q1  readiness% = floor(sum passed * 100 / sum tests). Integer division of
--       non-negative numbers floors; 100 only when every pooled test passed.
--   Q2  Pooled counts across the attached plans, never a mean of plan percentages.
--   E1  A CLOSED plan contributes the progress it froze at close time
--       (test_plans.progress_snapshot, 0095); an open plan contributes its live
--       progress through BK-204's rulebook (bunkai_plan_progress_rows, 0094). A
--       closed row whose snapshot is missing or malformed falls back to live
--       progress, the same fallback the plans list already applies.
--   D2  Attach is all-or-nothing for a multi-plan selection; detach of a plan that
--       is not attached succeeds without a write (idempotent).
--   D3  Viewer -> 42501 (same guard as bunkai_update_milestone, 0064).
--   D4  A plan outside the milestone's project, a plan in another workspace and a
--       plan id that does not exist all collapse into ONE raise, 45505, with no id
--       echoed back (0076's 45604 non-disclosure pattern).
--   D5  UNIQUE (milestone_id, test_plan_id) is the database backstop behind the
--       Idempotency-Key header middleware.
--   D6  At most 50 plans per milestone; no new index beyond the unique one.
--   TL-3 The attach function locks the milestone row: the 50-plan cap is a
--       count-then-insert check, which is only race-free when attaches to one
--       milestone serialize (0076's plan-row lock convention). Detach needs no lock.
--   TL-4 Readiness is computed in ONE place (this file) and read by both the list
--       and the detail, so the strip and the per-plan table cannot disagree.
--   TL-5 No clock lives here: the overdue predicate is evaluated by the app with the
--       server UTC date (lib/milestones/readiness-view.ts), the same clock as the
--       countdown chip.
--
-- Custom SQLSTATE codes allocated (455xx milestones block; 0064 claims 45500-45503):
--   45504  milestone_plan_exists   (a submitted plan is already attached)
--   45505  plan_outside_project    (unknown / foreign / other-project plan id)
--   45506  milestone_plan_limit    (the attach would exceed 50 plans)
-- Plus P0002 milestone_not_found (missing milestone, foreign workspace, non-member,
-- no session), 42501 forbidden (viewer) and 22023 plan_selection_empty (an empty
-- selection, defense in depth under the route's Zod guard).
--
-- Security posture (ADR-0012: delete the identity parameter instead of guarding it):
--   * The two writers are SECURITY DEFINER with NO identity parameter; the actor is
--     auth.uid(). DEFINER is required because milestone_plans carries no write policy
--     (0076 decision 2: a write policy is a second live write path) and activity_log
--     is DEFINER-only. The workspace and project are resolved server-side from the
--     milestone row; authorization (membership, then write role) runs BEFORE any
--     input or state check. The only rows written are membership rows of that one
--     milestone, and every plan id must resolve inside its project.
--   * The readiness function is SECURITY INVOKER with no identity parameter: RLS on
--     milestones, milestone_plans, test_plans, test_plan_tests and runs is the only
--     authorization, so there is nothing to spoof. A caller with no auth.uid()
--     (service role, which bypasses RLS) is refused with P0002 (0094 shape).
--   * 0085's default privileges hand every new function to qa_inspector_ro; the two
--     writers are revoked from it explicitly (0086 rule, 0109/0111 mechanism).

-- ============================================================================
-- 1. Table
-- ============================================================================

create table if not exists public.milestone_plans (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  milestone_id  uuid not null references public.milestones(id) on delete cascade,
  test_plan_id  uuid not null references public.test_plans(id) on delete cascade,
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- The duplicate backstop (D5) and the only read path ("the plans of a milestone",
-- milestone_id-first). No reverse index (D6): plans are never deleted by the product.
create unique index if not exists milestone_plans_milestone_plan_idx
  on public.milestone_plans (milestone_id, test_plan_id);

-- ============================================================================
-- 2. RLS — SELECT-only, any workspace member (viewers included: readiness is
--    visible read-only, business-rules.md). workspace_id is copied from the
--    milestone by the attach function, the 0064 milestones shape.
-- ============================================================================

alter table public.milestone_plans enable row level security;

drop policy if exists milestone_plans_select_workspace_member on public.milestone_plans;
create policy milestone_plans_select_workspace_member
  on public.milestone_plans for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

-- NO INSERT, UPDATE or DELETE policy: the two DEFINER functions below are the only
-- way a row is created or removed (0076 decision 2).

-- ============================================================================
-- 3. bunkai_attach_plans_to_milestone — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_attach_plans_to_milestone(
  p_milestone_id  uuid,
  p_test_plan_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_project_id   uuid;
  v_distinct     int;
  v_resolved     int;
  v_existing     int;
  v_added        int;
begin
  -- 1. Resolve the milestone under a row lock (TL-3): concurrent attaches to the
  --    same milestone serialize here, so the cap below is race-free.
  select workspace_id, project_id
    into v_workspace_id, v_project_id
    from public.milestones
    where id = p_milestone_id
    for update;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0064 shape): not a member at all (including no
  --    session) -> 404, indistinguishable from absent; member but viewer -> 403.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. At least one plan id (defense in depth under the route's Zod min(1)).
  if coalesce(array_length(p_test_plan_ids, 1), 0) < 1 then
    raise exception 'plan_selection_empty' using errcode = '22023';
  end if;

  -- 4. Every distinct submitted id must be a plan of THIS milestone's project
  --    (therefore of its workspace). A null element, an unknown id, a plan of
  --    another project and a plan of another workspace all collapse into the SAME
  --    raise, with no id echoed back (D4).
  if array_position(p_test_plan_ids, null) is not null then
    raise exception 'plan_outside_project' using errcode = '45505';
  end if;
  select count(*) into v_distinct
    from (select distinct x from unnest(p_test_plan_ids) as t(x)) d;
  select count(*) into v_resolved
    from public.test_plans tp
    where tp.id = any (p_test_plan_ids)
      and tp.project_id = v_project_id;
  if v_resolved <> v_distinct then
    raise exception 'plan_outside_project' using errcode = '45505';
  end if;

  -- 5. Duplicate: a submitted plan already attached rejects the WHOLE selection.
  if exists (
    select 1 from public.milestone_plans mp
    where mp.milestone_id = p_milestone_id
      and mp.test_plan_id = any (p_test_plan_ids)
  ) then
    raise exception 'milestone_plan_exists' using errcode = '45504';
  end if;

  -- 6. Cap (D6): at most 50 plans per milestone after this attach.
  select count(*) into v_existing
    from public.milestone_plans mp
    where mp.milestone_id = p_milestone_id;
  if v_existing + v_distinct > 50 then
    raise exception 'milestone_plan_limit' using errcode = '45506';
  end if;

  -- 7. Insert every distinct id in one statement. The unique index stays the
  --    backstop (D5): a duplicate that slipped past step 5 still answers 45504.
  begin
    insert into public.milestone_plans (workspace_id, milestone_id, test_plan_id, added_by)
    select v_workspace_id, p_milestone_id, x, auth.uid()
    from (select distinct x from unnest(p_test_plan_ids) as t(x)) d;
    get diagnostics v_added = row_count;
  exception when unique_violation then
    raise exception 'milestone_plan_exists' using errcode = '45504';
  end;

  -- 8. History, in the same transaction (D2). Positive projection, one row per call.
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'milestone', p_milestone_id, 'milestone.plans_attached',
    jsonb_build_object(
      'test_plan_ids', (select to_jsonb(array_agg(distinct x)) from unnest(p_test_plan_ids) as t(x)),
      'count', v_added
    )
  );

  return jsonb_build_object(
    'milestone_id', p_milestone_id,
    'attached_count', v_added,
    'plan_count', v_existing + v_added
  );
end;
$$;

revoke execute on function public.bunkai_attach_plans_to_milestone(uuid, uuid[]) from public, anon;
grant  execute on function public.bunkai_attach_plans_to_milestone(uuid, uuid[]) to authenticated;

-- ============================================================================
-- 4. bunkai_detach_plan_from_milestone — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_detach_plan_from_milestone(
  p_milestone_id uuid,
  p_test_plan_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_deleted      int;
begin
  -- 1. Resolve the milestone. No lock: a delete is atomic and carries no cap.
  select workspace_id into v_workspace_id
    from public.milestones
    where id = p_milestone_id;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  -- 2. Same non-disclosure split as attach.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Delete the membership only. Detaching never touches the plan or its
  --    progress: this statement reaches milestone_plans and nothing else.
  delete from public.milestone_plans
    where milestone_id = p_milestone_id
      and test_plan_id = p_test_plan_id;
  get diagnostics v_deleted = row_count;

  -- 4. History only when something was detached (an idempotent repeat writes none).
  if v_deleted > 0 then
    insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
    values (
      v_workspace_id, auth.uid(), 'milestone', p_milestone_id, 'milestone.plan_detached',
      jsonb_build_object('test_plan_id', p_test_plan_id)
    );
  end if;

  return jsonb_build_object(
    'milestone_id', p_milestone_id,
    'test_plan_id', p_test_plan_id,
    'detached', v_deleted > 0,
    'plan_count', (select count(*) from public.milestone_plans where milestone_id = p_milestone_id)
  );
end;
$$;

revoke execute on function public.bunkai_detach_plan_from_milestone(uuid, uuid) from public, anon;
grant  execute on function public.bunkai_detach_plan_from_milestone(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_attach_plans_to_milestone(uuid, uuid[]) from qa_inspector_ro;
    revoke all on function public.bunkai_detach_plan_from_milestone(uuid, uuid) from qa_inspector_ro;
  end if;
end
$$;

-- ============================================================================
-- 5. bunkai_milestones_readiness — SECURITY INVOKER, no identity parameter.
--
-- Return shape (jsonb array, one element per VISIBLE milestone, ordered by id):
--   [{ milestone_id, plan_count, member_count, passed_pct, counts: { passed, failed,
--      aborted, in_progress, not_run },
--      plans: [{ plan_id, name, status, frozen, member_count, passed_pct, counts }] }]
--   passed_pct is null when member_count = 0: no plan attached, or attached plans
--   with no tests at all (both "no readiness"). Plans are in attach order.
-- ============================================================================

create or replace function public.bunkai_milestones_readiness(p_milestone_ids uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- A caller with no session (service role, anon) gets nothing (0094 shape).
  if auth.uid() is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  return coalesce((
    with att as (
      select
        mp.milestone_id,
        mp.test_plan_id,
        mp.created_at as attached_at,
        tp.name,
        tp.status,
        tp.progress_snapshot as snapshot,
        (
          tp.status = 'closed'
          and jsonb_typeof(tp.progress_snapshot -> 'member_count') = 'number'
          and jsonb_typeof(tp.progress_snapshot -> 'counts') = 'object'
        ) as frozen
      from public.milestone_plans mp
      join public.test_plans tp on tp.id = mp.test_plan_id
      where mp.milestone_id = any (p_milestone_ids)
    ),
    live as (
      select
        rw.plan_id,
        count(*)::int                                          as member_count,
        count(*) filter (where rw.outcome = 'passed')::int      as passed,
        count(*) filter (where rw.outcome = 'failed')::int      as failed,
        count(*) filter (where rw.outcome = 'aborted')::int     as aborted,
        count(*) filter (where rw.outcome = 'in_progress')::int as in_progress,
        count(*) filter (where rw.outcome = 'not_run')::int     as not_run
      from public.bunkai_plan_progress_rows(
        array(select distinct a.test_plan_id from att a where not a.frozen)
      ) rw
      group by rw.plan_id
    ),
    per_plan as (
      select
        a.milestone_id,
        a.test_plan_id,
        a.attached_at,
        a.name,
        a.status,
        a.frozen,
        case when a.frozen then (a.snapshot ->> 'member_count')::int
             else coalesce(l.member_count, 0) end as member_count,
        case when a.frozen then coalesce((a.snapshot -> 'counts' ->> 'passed')::int, 0)
             else coalesce(l.passed, 0) end as passed,
        case when a.frozen then coalesce((a.snapshot -> 'counts' ->> 'failed')::int, 0)
             else coalesce(l.failed, 0) end as failed,
        case when a.frozen then coalesce((a.snapshot -> 'counts' ->> 'aborted')::int, 0)
             else coalesce(l.aborted, 0) end as aborted,
        case when a.frozen then coalesce((a.snapshot -> 'counts' ->> 'in_progress')::int, 0)
             else coalesce(l.in_progress, 0) end as in_progress,
        case when a.frozen then coalesce((a.snapshot -> 'counts' ->> 'not_run')::int, 0)
             else coalesce(l.not_run, 0) end as not_run
      from att a
      left join live l on l.plan_id = a.test_plan_id and not a.frozen
    )
    select jsonb_agg(
      jsonb_build_object(
        'milestone_id', m.id,
        'plan_count', coalesce(agg.plan_count, 0),
        'member_count', coalesce(agg.member_count, 0),
        'passed_pct', case
          when coalesce(agg.member_count, 0) = 0 then null
          else ((agg.passed * 100) / agg.member_count)::int
        end,
        'counts', jsonb_build_object(
          'passed', coalesce(agg.passed, 0),
          'failed', coalesce(agg.failed, 0),
          'aborted', coalesce(agg.aborted, 0),
          'in_progress', coalesce(agg.in_progress, 0),
          'not_run', coalesce(agg.not_run, 0)
        ),
        'plans', coalesce(agg.plans, '[]'::jsonb)
      )
      order by m.id
    )
    from public.milestones m
    left join lateral (
      select
        count(*)::int           as plan_count,
        sum(pp.member_count)::bigint as member_count,
        sum(pp.passed)::bigint       as passed,
        sum(pp.failed)::bigint       as failed,
        sum(pp.aborted)::bigint      as aborted,
        sum(pp.in_progress)::bigint  as in_progress,
        sum(pp.not_run)::bigint      as not_run,
        jsonb_agg(
          jsonb_build_object(
            'plan_id', pp.test_plan_id,
            'name', pp.name,
            'status', pp.status,
            'frozen', pp.frozen,
            'member_count', pp.member_count,
            'passed_pct', case
              when pp.member_count = 0 then null
              else (pp.passed * 100) / pp.member_count
            end,
            'counts', jsonb_build_object(
              'passed', pp.passed,
              'failed', pp.failed,
              'aborted', pp.aborted,
              'in_progress', pp.in_progress,
              'not_run', pp.not_run
            )
          )
          order by pp.attached_at, pp.test_plan_id
        ) as plans
      from per_plan pp
      where pp.milestone_id = m.id
    ) agg on true
    where m.id = any (p_milestone_ids)
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.bunkai_milestones_readiness(uuid[]) from public, anon;
grant  execute on function public.bunkai_milestones_readiness(uuid[]) to authenticated, service_role;

-- Verification (run by hand after the apply; expected result on each line):
--   select has_function_privilege('anon', 'public.bunkai_attach_plans_to_milestone(uuid,uuid[])', 'EXECUTE');              -- false
--   select has_function_privilege('authenticated', 'public.bunkai_attach_plans_to_milestone(uuid,uuid[])', 'EXECUTE');     -- true
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_attach_plans_to_milestone(uuid,uuid[])', 'EXECUTE');   -- false
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_detach_plan_from_milestone(uuid,uuid)', 'EXECUTE');    -- false
--   select has_function_privilege('anon', 'public.bunkai_milestones_readiness(uuid[])', 'EXECUTE');                        -- false
