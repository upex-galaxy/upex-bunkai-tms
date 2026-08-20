-- 0073_test_plans.sql — BK-202: TMS-Test Plan | Create a test plan grouping
-- tests for a goal
--
-- ADDITIVE ONLY: new table, new indexes, new RLS, new RPCs. Nothing is
-- dropped, renamed or rewritten. Every shape here is a deliberate copy of
-- `0064_milestones.sql` (BK-205), the sibling container of this same epic —
-- the AI Product Owner + AI Tech Lead ruling on BK-202 (2026-08-14) resolved
-- all ten open questions by naming that file as the precedent to reuse
-- verbatim rather than redesign. Full rationale lives on the ticket; this
-- file carries only the decided shape.
--
-- Five decisions load-bearing enough to restate here:
--   1. Both RPCs are SECURITY DEFINER with NO caller-supplied actor or scope
--      parameter — the actor is `auth.uid()`, the `0023_module_activity_log.sql`
--      shape. This satisfies ADR-0012 by PARAMETER REMOVAL rather than by a
--      guard: a function that cannot be told who is calling cannot be lied
--      to. Each RPC returns exactly the one row it just wrote, whose
--      workspace was resolved server-side from the project/plan id and then
--      gated — there is no set-returning path here to under-scope.
--   2. Internal-whitespace normalization (collapse runs of whitespace, THEN
--      trim) lives in the RPCs on write, storing the normalized value, with a
--      table CHECK pinning the invariant structurally (any writer, any path)
--      and a plain `lower(name)` unique index making the duplicate test
--      provable rather than hopeful. Note `\s` covers tab/newline but NOT
--      U+00A0 — the milestones precedent does not cover it either, and the
--      ruling on BK-202 (Technical Question 2) explicitly says to match that
--      scope rather than widen it unasked.
--   3. Uniqueness is a DB-LEVEL unique index on (project_id, lower(name)),
--      never an app-level check. It fires identically on INSERT and on UPDATE
--      (ratified T5: rename re-validates), closing the concurrent-duplicate
--      race for free — the second writer gets 23505 from Postgres itself,
--      with no app-layer TOCTOU window. Self-exclusion on rename is
--      automatic: updating a row to a value it already holds does not violate
--      the index, because it is the same row.
--   4. No DELETE policy and no delete RPC. Ratified T4, epic-wide: there is
--      no Delete for a Test Plan, ever — Close (sibling story BK-207) is the
--      sole exit from Open. Same default-deny-on-writes precedent
--      `0031_runs.sql` set for `project_environments` and `0064` repeated.
--   5. `created_by` is stored for audit/display ONLY and is never read as an
--      authorization input. Ratified: any project member with role >= member
--      may edit any plan, not only its creator (a plan is a team-shared
--      artefact, not personal content).
--
-- List and detail READS are deliberately NOT RPCs — plain RLS-scoped
-- PostgREST selects through the caller's own client (ADR-0001 Path B), same
-- as 0064 §5. The creator column resolves through the existing
-- bunkai_resolve_activity_actors; no second auth.users-reading function is
-- added (ADR-0011's consequences name that as the thing not to do).
--
-- Custom SQLSTATE codes allocated for the test-plans domain (class 45xxx,
-- 456xx block — 455xx is milestones/0064, 45400 is notifications/0053, 453xx
-- is bugs; 456xx verified unused across supabase/migrations/ before claiming):
--   45600  test_plan_name_length         (name empty or > 100 chars after normalize)
--   45601  test_plan_description_length  (description > 500 chars)
--   45602  test_plan_goal_length         (goal > 100 chars after normalize)
--   45603  test_plan_not_open            (edit attempted on a plan that is not Open)
-- Case-insensitive name collisions reuse the native unique_violation (23505)
-- raised by test_plans_project_name_idx.

-- ============================================================================
-- 1. Table
-- ============================================================================

create table if not exists public.test_plans (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id   uuid not null references public.projects(id)   on delete cascade,
  name         text not null
                 check (name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
                        and char_length(name) between 1 and 100),
  -- Optional short label for the cycle's target ("Release 2.4"). Renders as a
  -- compact list column / chip, so it carries the NAME bound (100) rather
  -- than description's paragraph bound — a paragraph-length goal would break
  -- that layout. Genuinely greenfield (no precedent field), flagged on the
  -- ticket as a PO-confirmable default rather than load-bearing precedent.
  goal         text not null default ''
                 check (goal = btrim(regexp_replace(goal, '\s+', ' ', 'g'))
                        and char_length(goal) <= 100),
  -- Reuses milestones' exact cap — same epic, sibling entity, no reason to
  -- pick a different number.
  description  text not null default '' check (char_length(description) <= 500),
  -- A newly created plan starts Open (business-rules.md). NOTHING in BK-202
  -- ever writes 'closed': there is no RPC parameter, no route and no UI for
  -- it. The two-value domain is admitted here because T4 already ratified
  -- Close (BK-207) as the sole exit epic-wide, so the value set is a settled
  -- decision — pinning the CHECK to `= 'open'` would force that story to
  -- ALTER a constraint instead of adding a transition. This is a value
  -- domain, not a capability; the "ship no unreachable capability" rule that
  -- keeps DELETE out (decision 4 above) is untouched.
  status       text not null default 'open' check (status in ('open', 'closed')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Duplicate test. Plain lower(), correct by construction because the table
-- CHECK guarantees `name` is already collapsed + trimmed. Same shape as
-- milestones_project_name_idx (0064) and project_environments_project_name_idx
-- (0031_runs.sql) — a third-generation house pattern, not a one-off.
create unique index if not exists test_plans_project_name_idx
  on public.test_plans (project_id, lower(name));

-- Sole list access path: `where project_id = $1 order by created_at desc, id desc`.
-- A plan has no date axis the way a milestone does, so the list reads
-- newest-cycle-first. A plain ascending btree serves the descending scan;
-- `id` is the tie-break the ordering needs to be stable and the column a
-- future keyset page would seek on (same reasoning as 0064's own list index).
create index if not exists test_plans_project_created_at_id_idx
  on public.test_plans (project_id, created_at, id);

drop trigger if exists test_plans_set_updated_at on public.test_plans;
create trigger test_plans_set_updated_at
  before update on public.test_plans
  for each row execute function public.bunkai_set_updated_at();

-- ============================================================================
-- 2. RLS
-- ============================================================================

alter table public.test_plans enable row level security;

-- Visibility is role-agnostic among members: a viewer sees list and detail
-- read-only (business-rules.md). Same shape as milestones_select_workspace_member.
drop policy if exists test_plans_select_workspace_member on public.test_plans;
create policy test_plans_select_workspace_member
  on public.test_plans for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

-- Writes are member+. Defense in depth: the RPCs are DEFINER and are the
-- enforcement point of record, but the policy surface stays consistent with
-- the milestone/module/environment precedent.
drop policy if exists test_plans_insert_workspace_role_member_plus on public.test_plans;
create policy test_plans_insert_workspace_role_member_plus
  on public.test_plans for insert
  with check ( public.bunkai_can_write_workspace(workspace_id) );

drop policy if exists test_plans_update_workspace_role_member_plus on public.test_plans;
create policy test_plans_update_workspace_role_member_plus
  on public.test_plans for update
  using      ( public.bunkai_can_write_workspace(workspace_id) )
  with check ( public.bunkai_can_write_workspace(workspace_id) );

-- No DELETE policy and no delete RPC — ratified T4 (2026-08-14), epic-wide:
-- Close is the only exit from Open and Delete is permanently out of scope for
-- Test Plans. Shipping an unreachable delete path is an unrequested,
-- unreviewed capability with its own cascade/audit design questions answered
-- for nothing.

-- ============================================================================
-- 3. bunkai_create_test_plan — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_create_test_plan(
  p_project_id  uuid,
  p_name        text,
  p_description text default '',
  p_goal        text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name         text;
  v_goal         text;
  v_description  text := coalesce(p_description, '');
  v_row          public.test_plans%rowtype;
begin
  -- 1. Resolve project -> workspace. p_project_id comes from the URL the
  --    caller already knows, so a 42501 here discloses nothing (0063).
  select workspace_id into v_workspace_id from public.projects where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 2. Role gate, live on every call. auth.uid() is read internally by
  --    bunkai_can_write_workspace; no actor parameter exists to spoof and no
  --    client-cached role is consulted, so a user demoted mid-session is
  --    rejected here on their very next write (AC 4.5).
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Normalize (collapse THEN trim, see decision 2) + lengths.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_goal := btrim(regexp_replace(coalesce(p_goal, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'test_plan_name_length' using errcode = '45600';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'test_plan_description_length' using errcode = '45601';
  end if;
  if char_length(v_goal) > 100 then
    raise exception 'test_plan_goal_length' using errcode = '45602';
  end if;

  -- 4. Insert. Duplicate name -> 23505 from test_plans_project_name_idx -> 409.
  --    `status` is left to its 'open' default: a new plan is always Open and
  --    this function offers no way to say otherwise.
  insert into public.test_plans (workspace_id, project_id, name, description, goal, created_by)
  values (v_workspace_id, p_project_id, v_name, v_description, v_goal, auth.uid())
  returning * into v_row;

  -- 5. Audit. DEFINER-only writer, and what makes created_by resolvable via
  --    bunkai_resolve_activity_actors (ADR-0011 + 0047 scoping).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'test_plan', v_row.id, 'test_plan.created',
          jsonb_build_object('name', v_row.name, 'goal', v_row.goal));

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'description', v_row.description, 'goal', v_row.goal, 'status', v_row.status,
    'created_by', v_row.created_by, 'created_at', v_row.created_at
  );
end;
$$;

-- This file grants EXECUTE to `authenticated` only; 0064 additionally names
-- service_role. The distinction is cosmetic on this project — verified after
-- apply, the live ACL carries service_role either way, from the project's own
-- ALTER DEFAULT PRIVILEGES, not from the grant below. It costs nothing
-- because a service-role caller's auth.uid() is NULL and therefore fails the
-- write gate on every call.
revoke execute on function public.bunkai_create_test_plan(uuid, text, text, text) from public, anon;
grant  execute on function public.bunkai_create_test_plan(uuid, text, text, text) to authenticated;

-- ============================================================================
-- 4. bunkai_update_test_plan — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_update_test_plan(
  p_test_plan_id uuid,
  p_name         text,
  p_description  text default '',
  p_goal         text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id        uuid;
  v_status              text;
  v_current_name        text;
  v_current_description text;
  v_current_goal        text;
  v_name                text;
  v_goal                text;
  v_description         text := coalesce(p_description, '');
  v_payload             jsonb := '{}'::jsonb;
  v_row                 public.test_plans%rowtype;
begin
  -- 1. Resolve workspace + the CURRENT row under a row lock (0032/0036/0037
  --    serialization convention).
  select workspace_id, status, name, description, goal
    into v_workspace_id, v_status, v_current_name, v_current_description, v_current_goal
    from public.test_plans where id = p_test_plan_id for update;
  if v_workspace_id is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0063 shape, as refined by 0064). Not a member at
  --    all -> 404, indistinguishable from absent. Member but viewer -> 403,
  --    which discloses nothing a viewer cannot already see on the list.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Editable only while Open (scope.md: "Edit a plan's name, description,
  --    and goal WHILE THE PLAN IS OPEN"). Unreachable through any write path
  --    BK-202 ships — nothing here can set 'closed' — but enforced
  --    structurally so BK-207 inherits the invariant instead of having to
  --    remember it, and provable today by seeding a closed row directly.
  if v_status <> 'open' then
    raise exception 'test_plan_not_open' using errcode = '45603';
  end if;

  -- 4. Normalize (collapse THEN trim) + lengths — same rulebook as create.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_goal := btrim(regexp_replace(coalesce(p_goal, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'test_plan_name_length' using errcode = '45600';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'test_plan_description_length' using errcode = '45601';
  end if;
  if char_length(v_goal) > 100 then
    raise exception 'test_plan_goal_length' using errcode = '45602';
  end if;

  -- 5. Update. Duplicate name -> 23505 -> 409, the SAME index that guards
  --    create (ratified T5). Self-exclusion is automatic: updating a row to a
  --    value it already holds does not violate the unique index, because it
  --    is the same row (no app-layer guard needed). `created_by` is NOT
  --    consulted — edit is not creator-restricted.
  update public.test_plans
    set name = v_name,
        description = v_description,
        goal = v_goal
    where id = p_test_plan_id
    returning * into v_row;

  -- 6. Audit. test_plan.updated projects ONLY the changed fields (0055
  --    "Decision 3 / Risk R3" positive-projection convention, never a blanket
  --    copy of the row).
  if v_name is distinct from v_current_name then
    v_payload := v_payload || jsonb_build_object('name', v_name);
  end if;
  if v_description is distinct from v_current_description then
    v_payload := v_payload || jsonb_build_object('description', v_description);
  end if;
  if v_goal is distinct from v_current_goal then
    v_payload := v_payload || jsonb_build_object('goal', v_goal);
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'test_plan', v_row.id, 'test_plan.updated', v_payload);

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'description', v_row.description, 'goal', v_row.goal, 'status', v_row.status,
    'created_by', v_row.created_by, 'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_update_test_plan(uuid, text, text, text) from public, anon;
grant  execute on function public.bunkai_update_test_plan(uuid, text, text, text) to authenticated;
