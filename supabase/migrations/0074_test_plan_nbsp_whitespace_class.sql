-- ============================================================================
-- 0074_test_plan_nbsp_whitespace_class
--
-- BK-591 — Test Plan uniqueness wrongly treats an NBSP-padded name as a
-- duplicate. Fixes the whitespace class used by 0073's normalization so that
-- U+00A0 is preserved, per the whitespace rule 0073 itself ratified.
--
-- Root cause: 0073 line 24 and lib/test-plans/validation.ts:25-27 both assert
-- that Postgres's `\s` does NOT match U+00A0. Both are FALSE — `\s` is
-- `[[:space:]]`, which matches U+00A0 under this instance's UTF-8 collation.
-- So the RPC collapsed a trailing NBSP to a plain space, btrim stripped it,
-- and the name normalized onto its unpadded twin -> 23505 -> 409.
--
-- Verified on the live instance (PostgreSQL 17.6) BEFORE writing this file:
--   regexp_replace('a'||U&'\00A0'||'b', '\s+',            '|', 'g') -> 'a|b'
--   regexp_replace('a'||U&'\00A0'||'b', '[[:space:]]+',   '|', 'g') -> 'a|b'
--   regexp_replace('a'||U&'\00A0'||'b', '[\t\n\v\f\r ]+', '|', 'g') -> 'a<NBSP>b'
--
-- The INTENT in both comments is the ratified rule (BK-202 Technical Question
-- 2: match the milestones scope, do not widen it to Unicode Zs). The
-- TypeScript layer happens to implement that intent correctly — it spells the
-- class out — so it needs no behavioural change; only its comment was
-- corrected. Only the SQL diverged from the rule it declared.
--
-- This touches FOUR expressions, not the two BK-591 names: the table CHECK
-- constraints carry the same `\s`, so fixing only the RPCs would make a
-- correctly-stored NBSP name fail test_plans_name_check — turning a 409 into
-- a constraint violation. CHECK and RPC encode one rule and move together.
-- `goal` is corrected alongside `name` because the rule is the table's, not
-- the name column's, and both carry the identical defective expression.
--
-- btrim() is deliberately unchanged: it strips ASCII spaces only and does NOT
-- strip U+00A0 (length(btrim('x'||U&'\00A0')) = 2), which is the behaviour
-- this rule wants and which validation.ts mirrors with `.replace(/^ +| +$/g,
-- '')`. The ONLY change is the character class inside regexp_replace.
--
-- Backfill: none. Verified before writing — 7 rows, 0 violate either new CHECK.
-- Classified DESTRUCTIVE (drops/re-adds live constraints, rewrites the output
-- of two live functions); applied under
-- `autonomous_delivery.migrations: unrestricted`.
--
-- Function bodies below are byte-identical to what was applied to the live
-- instance, and were re-read from pg_proc / pg_constraint and diffed after the
-- apply (2 explicit-class hits per function, 0 remaining `\s`).
-- ============================================================================

alter table public.test_plans drop constraint test_plans_name_check;
alter table public.test_plans add  constraint test_plans_name_check
  check (name = btrim(regexp_replace(name, '[\t\n\v\f\r ]+', ' ', 'g'))
         and char_length(name) between 1 and 100);

alter table public.test_plans drop constraint test_plans_goal_check;
alter table public.test_plans add  constraint test_plans_goal_check
  check (goal = btrim(regexp_replace(goal, '[\t\n\v\f\r ]+', ' ', 'g'))
         and char_length(goal) <= 100);

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
  select workspace_id into v_workspace_id from public.projects where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- BK-591: class spelled out because Postgres `\s` DOES match U+00A0.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[\t\n\v\f\r ]+', ' ', 'g'));
  v_goal := btrim(regexp_replace(coalesce(p_goal, ''), '[\t\n\v\f\r ]+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'test_plan_name_length' using errcode = '45600';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'test_plan_description_length' using errcode = '45601';
  end if;
  if char_length(v_goal) > 100 then
    raise exception 'test_plan_goal_length' using errcode = '45602';
  end if;

  insert into public.test_plans (workspace_id, project_id, name, description, goal, created_by)
  values (v_workspace_id, p_project_id, v_name, v_description, v_goal, auth.uid())
  returning * into v_row;

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

revoke execute on function public.bunkai_create_test_plan(uuid, text, text, text) from public, anon;
grant  execute on function public.bunkai_create_test_plan(uuid, text, text, text) to authenticated;

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
  select workspace_id, status, name, description, goal
    into v_workspace_id, v_status, v_current_name, v_current_description, v_current_goal
    from public.test_plans where id = p_test_plan_id for update;
  if v_workspace_id is null then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;

  if not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'test_plan_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status <> 'open' then
    raise exception 'test_plan_not_open' using errcode = '45603';
  end if;

  -- BK-591: same rulebook as create.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[\t\n\v\f\r ]+', ' ', 'g'));
  v_goal := btrim(regexp_replace(coalesce(p_goal, ''), '[\t\n\v\f\r ]+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'test_plan_name_length' using errcode = '45600';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'test_plan_description_length' using errcode = '45601';
  end if;
  if char_length(v_goal) > 100 then
    raise exception 'test_plan_goal_length' using errcode = '45602';
  end if;

  update public.test_plans
    set name = v_name,
        description = v_description,
        goal = v_goal
    where id = p_test_plan_id
    returning * into v_row;

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
