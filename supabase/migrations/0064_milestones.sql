-- 0064_milestones.sql — BK-205: TMS-Milestone | Create a milestone with a
-- target date
--
-- ADDITIVE ONLY: new table, new indexes, new RLS, new RPCs. Ratified by the AI
-- Tech Lead in a BK-205 comment (2026-08-05), reconciling three record errors
-- (F1/F2/F3) before anything was built on them. Full rationale lives on the
-- ticket; this file carries only the decided shape.
--
-- Four decisions load-bearing enough to restate here:
--   1. Both now()-relative target-date bounds (today-or-later on write,
--      within 5 years of the write date) live in the RPC body as a backstop
--      under a Zod guard at the HTTP edge — NOT a trigger, NOT a CHECK. A
--      CHECK is a row invariant re-evaluated on every later UPDATE/VALIDATE/
--      restore, so a milestone valid the day it was written would become a
--      permanent violation once its date passed — exactly the state
--      business-rules.md says must stay editable. On edit, the bounds fire
--      ONLY when `p_target_date is distinct from` the stored value, so a
--      description-only edit of a past-dated milestone stays possible.
--   2. Internal-whitespace normalization (collapse runs of whitespace, THEN
--      trim) lives in the RPC on write, storing the normalized value, with a
--      table CHECK pinning the invariant structurally (any writer, any path)
--      and a plain `lower(name)` unique index doing a provably-correct
--      duplicate test rather than a hopeful one.
--   3. Both RPCs are SECURITY DEFINER with NO caller-supplied actor
--      parameter — actor is `auth.uid()`, the `0023_module_activity_log.sql`
--      shape. Satisfies ADR-0012 by parameter removal, not by a guard.
--   4. No DELETE policy and no delete RPC — deletion is out of scope
--      (out-of-scope.md), same default-deny-on-writes precedent
--      `0031_runs.sql` set for `project_environments`.
--
-- Custom SQLSTATE codes allocated for the milestones domain (class 45xxx,
-- 455xx block — 45400 is notifications/0053, 453xx is bugs):
--   45500  milestone_name_length         (name empty or > 100 chars after normalize)
--   45501  milestone_description_length  (description > 500 chars)
--   45502  milestone_target_date_past    (target date before today, UTC)
--   45503  milestone_target_date_too_far (target date more than 5 years out)
-- Case-insensitive name collisions reuse the native unique_violation (23505)
-- raised by milestones_project_name_idx.

-- ============================================================================
-- 1. Table
-- ============================================================================

create table if not exists public.milestones (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id   uuid not null references public.projects(id)   on delete cascade,
  name         text not null
                 check (name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
                        and char_length(name) between 1 and 100),
  target_date  date not null,
  description  text not null default '' check (char_length(description) <= 500),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Duplicate test. Plain lower(), correct by construction because the table
-- CHECK guarantees `name` is already collapsed + trimmed. Same shape as
-- project_environments_project_name_idx (0031_runs.sql:38-39).
create unique index if not exists milestones_project_name_idx
  on public.milestones (project_id, lower(name));

-- Sole list access path: `where project_id = $1 order by target_date asc, id asc`.
-- `id` is the tie-break the ordering needs to be stable and the column a future
-- keyset page would seek on (same reasoning as 0053's notifications index).
create index if not exists milestones_project_target_date_id_idx
  on public.milestones (project_id, target_date, id);

drop trigger if exists milestones_set_updated_at on public.milestones;
create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.bunkai_set_updated_at();

-- ============================================================================
-- 2. RLS
-- ============================================================================

alter table public.milestones enable row level security;

-- Visibility is role-agnostic among members: a viewer sees list and detail
-- (business-rules.md). Same shape as runs_select_workspace_member.
drop policy if exists milestones_select_workspace_member on public.milestones;
create policy milestones_select_workspace_member
  on public.milestones for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

-- Writes are member+. Defense in depth: the RPCs are DEFINER, but the policy
-- surface stays consistent with the module/environment precedent (0032 §1).
drop policy if exists milestones_insert_workspace_role_member_plus on public.milestones;
create policy milestones_insert_workspace_role_member_plus
  on public.milestones for insert
  with check ( public.bunkai_can_write_workspace(workspace_id) );

drop policy if exists milestones_update_workspace_role_member_plus on public.milestones;
create policy milestones_update_workspace_role_member_plus
  on public.milestones for update
  using      ( public.bunkai_can_write_workspace(workspace_id) )
  with check ( public.bunkai_can_write_workspace(workspace_id) );

-- No DELETE policy and no delete RPC. Deletion appears nowhere in scope.md,
-- business-rules.md or acceptance-criteria.md, and out-of-scope.md defers
-- "completing or archiving milestones" to a later refinement. Shipping an
-- unreachable delete path is an unrequested, unreviewed capability —
-- 0031_runs.sql set this precedent when it created project_environments
-- default-deny on writes and let BK-148 add them a story later.

-- ============================================================================
-- 3. bunkai_create_milestone — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_create_milestone(
  p_project_id  uuid,
  p_name        text,
  p_target_date date,
  p_description text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name         text;
  v_description  text := coalesce(p_description, '');
  v_row          public.milestones%rowtype;
begin
  -- 1. Resolve project -> workspace. p_project_id comes from the URL the
  --    caller already knows, so a 42501 here discloses nothing (0063).
  select workspace_id into v_workspace_id from public.projects where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 2. Role gate. auth.uid() internally; no actor parameter exists to spoof.
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Normalize (collapse THEN trim, see the whitespace decision) + lengths.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'milestone_name_length' using errcode = '45500';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'milestone_description_length' using errcode = '45501';
  end if;

  -- 4. Bounds. Zod is the primary guard at the edge; this binds direct/PAT
  --    callers. Both relative to server UTC current_date.
  if p_target_date is null or p_target_date < current_date then
    raise exception 'milestone_target_date_past' using errcode = '45502';
  end if;
  if p_target_date > current_date + interval '5 years' then
    raise exception 'milestone_target_date_too_far' using errcode = '45503';
  end if;

  -- 5. Insert. Duplicate name -> 23505 from milestones_project_name_idx -> 409.
  insert into public.milestones (workspace_id, project_id, name, target_date, description, created_by)
  values (v_workspace_id, p_project_id, v_name, p_target_date, v_description, auth.uid())
  returning * into v_row;

  -- 6. Audit. DEFINER-only writer, and what makes created_by resolvable via
  --    bunkai_resolve_activity_actors (ADR-0011 + 0047 scoping).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'milestone', v_row.id, 'milestone.created',
          jsonb_build_object('name', v_row.name, 'target_date', v_row.target_date));

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'target_date', v_row.target_date, 'description', v_row.description,
    'created_by', v_row.created_by, 'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_create_milestone(uuid, text, date, text) from public, anon;
grant  execute on function public.bunkai_create_milestone(uuid, text, date, text) to authenticated, service_role;

-- ============================================================================
-- 4. bunkai_update_milestone — SECURITY DEFINER, no actor parameter.
-- ============================================================================

create or replace function public.bunkai_update_milestone(
  p_milestone_id uuid,
  p_name         text,
  p_target_date  date,
  p_description  text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id        uuid;
  v_current_name        text;
  v_current_target_date date;
  v_current_description text;
  v_name                text;
  v_description          text := coalesce(p_description, '');
  v_payload              jsonb := '{}'::jsonb;
  v_row                  public.milestones%rowtype;
begin
  -- 1. Resolve workspace + the CURRENT row under a row lock (0032/0036/0037
  --    serialization convention).
  select workspace_id, name, target_date, description
    into v_workspace_id, v_current_name, v_current_target_date, v_current_description
    from public.milestones where id = p_milestone_id for update;
  if v_workspace_id is null then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;

  -- 2. Non-disclosure split (0063 shape, refined). Not a member at all -> 404,
  --    indistinguishable from absent. Member but viewer -> 403, which
  --    discloses nothing a viewer cannot already see on the list.
  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'milestone_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Normalize (collapse THEN trim) + lengths — same rulebook as create.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'milestone_name_length' using errcode = '45500';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'milestone_description_length' using errcode = '45501';
  end if;

  -- 4. Bounds evaluated ONLY when the date actually changes. Without this
  --    guard a description-only edit of a past-dated milestone is impossible.
  if p_target_date is distinct from v_current_target_date then
    if p_target_date is null or p_target_date < current_date then
      raise exception 'milestone_target_date_past' using errcode = '45502';
    end if;
    if p_target_date > current_date + interval '5 years' then
      raise exception 'milestone_target_date_too_far' using errcode = '45503';
    end if;
  end if;

  -- 5. Update. Duplicate name -> 23505 -> 409. Self-exclusion is automatic:
  --    updating a row to a value it already holds does not violate the
  --    unique index, because it is the same row (no app-layer guard needed).
  update public.milestones
    set name = v_name,
        target_date = p_target_date,
        description = v_description
    where id = p_milestone_id
    returning * into v_row;

  -- 6. Audit. milestone.updated projects ONLY the changed fields (0055
  --    "Decision 3 / Risk R3" positive-projection convention, never a blanket
  --    copy).
  if v_name is distinct from v_current_name then
    v_payload := v_payload || jsonb_build_object('name', v_name);
  end if;
  if p_target_date is distinct from v_current_target_date then
    v_payload := v_payload || jsonb_build_object('target_date', p_target_date);
  end if;
  if v_description is distinct from v_current_description then
    v_payload := v_payload || jsonb_build_object('description', v_description);
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (v_workspace_id, auth.uid(), 'milestone', v_row.id, 'milestone.updated', v_payload);

  return jsonb_build_object(
    'id', v_row.id, 'project_id', v_row.project_id, 'name', v_row.name,
    'target_date', v_row.target_date, 'description', v_row.description,
    'created_by', v_row.created_by, 'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.bunkai_update_milestone(uuid, text, date, text) from public, anon;
grant  execute on function public.bunkai_update_milestone(uuid, text, date, text) to authenticated, service_role;

-- ============================================================================
-- 5. What is deliberately NOT an RPC
-- ============================================================================
-- List and detail reads are plain RLS-scoped PostgREST selects through
-- ctx.db, no function (ADR-0001 Path B; 0062 shipped a whole story that way).
-- The creator column resolves through the existing
-- bunkai_resolve_activity_actors(p_workspace_id, p_user_ids[]), batched
-- exactly as lib/home/active-runs.ts already does for run executors. No
-- second auth.users-reading function is added — ADR-0011's consequences name
-- that as the thing not to do.
