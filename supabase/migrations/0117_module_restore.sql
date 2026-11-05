-- =============================================================================
-- 0117_module_restore
-- BK-601 : see what is archived and restore an archived Module (BK-039).
-- =============================================================================
--
-- WHY. bunkai_archive_module_subtree (0023) archives a whole branch across four
-- tables and nothing could undo it. A restore must be the exact inverse of ONE
-- archive, so the system records which rows that archive took instead of deducing
-- it from a shared timestamp (AI Tech Lead ruling on BK-601, ADR-0024).
--
-- WHAT.
--   1. archive_batch_id on modules, user_stories, acceptance_criteria and atcs.
--      NULL on live rows, on rows archived on their own, and on every row archived
--      before this migration (no backfill). No index: the restore reaches rows
--      through their parent keys.
--   2. atcs_guard_archive_columns also covers the new column on atcs. The other
--      three tables have no such guard for archived_at either: `authenticated`
--      holds table UPDATE on them under member-plus RLS. Existing ADR-0012 debt,
--      not widened here.
--   3. bunkai_archive_module_subtree: one batch id per call, stamped next to the
--      timestamp, and the top Module locked before the subtree is collected.
--      Signature, return, counts and event are unchanged from 0023.
--   4. bunkai_restore_module_subtree: the inverse. See its header.
--   5. bunkai_list_activity: module.restored joins the backstop allowlist and the
--      projection; module.archived and module.restored project the Module's name
--      under the caller's RLS, so old archive entries read by name too. Body
--      otherwise unchanged from 0116.
--
-- WHAT ARCHIVES WRITE. bunkai_archive_user_story (0111), bunkai_archive_atc and
-- bunkai_restore_atc (0116) keep writing no batch id: they are not Module archives,
-- so a row they archive is never swept up by a Module restore. Any FUTURE cascade
-- writer must stamp its own batch id.
--
-- Additive and idempotent. Existing grants survive CREATE OR REPLACE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. archive_batch_id
-- -----------------------------------------------------------------------------
alter table public.modules
  add column if not exists archive_batch_id uuid;
alter table public.user_stories
  add column if not exists archive_batch_id uuid;
alter table public.acceptance_criteria
  add column if not exists archive_batch_id uuid;
alter table public.atcs
  add column if not exists archive_batch_id uuid;

comment on column public.modules.archive_batch_id is
  'BK-601: which Module archive took this row down. NULL when live, archived on its own, or archived before 0117.';
comment on column public.user_stories.archive_batch_id is
  'BK-601: which Module archive took this row down. NULL when live, archived on its own, or archived before 0117.';
comment on column public.acceptance_criteria.archive_batch_id is
  'BK-601: which Module archive took this row down. NULL when live, archived on its own, or archived before 0117.';
comment on column public.atcs.archive_batch_id is
  'BK-601: which Module archive took this row down. NULL when live, archived on its own, or archived before 0117.';

-- -----------------------------------------------------------------------------
-- 2. The ATC guard covers the new column
-- -----------------------------------------------------------------------------
drop trigger if exists atcs_guard_archive_columns on public.atcs;
create trigger atcs_guard_archive_columns
  before update of archived_at, archived_by, archive_batch_id on public.atcs
  for each row
  when (old.archived_at is distinct from new.archived_at
        or old.archived_by is distinct from new.archived_by
        or old.archive_batch_id is distinct from new.archive_batch_id)
  execute function public.bunkai_guard_atc_archive_columns();

-- -----------------------------------------------------------------------------
-- 3. bunkai_archive_module_subtree (body from 0023)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_archive_module_subtree(p_module_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_module_ids   uuid[];
  v_story_ids    uuid[];
  v_now          timestamptz := now();
  v_batch_id     uuid := gen_random_uuid();
  c_modules      int := 0;
  c_stories      int := 0;
  c_acs          int := 0;
  c_atcs         int := 0;
begin
  select project_id into v_project_id
    from public.modules where id = p_module_id;
  if v_project_id is null then
    raise exception 'module_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- BK-601: serializes with a restore of anything beneath this Module, which holds
  -- this row FOR SHARE. Without it the subtree below could be collected just before
  -- that restore commits, leaving an active Module under an archived one.
  perform 1 from public.modules where id = p_module_id for update;

  -- Collect the module + all active descendant modules.
  with recursive subtree as (
    select id from public.modules
      where id = p_module_id and archived_at is null
    union all
    select m.id from public.modules m
      join subtree s on m.parent_module_id = s.id
      where m.archived_at is null
  )
  select array_agg(id) into v_module_ids from subtree;

  -- Already archived (or vanished): nothing to do, no audit row.
  if v_module_ids is null then
    return jsonb_build_object(
      'modules', 0, 'user_stories', 0, 'acceptance_criteria', 0, 'atcs', 0
    );
  end if;

  select array_agg(id) into v_story_ids
    from public.user_stories
    where module_id = any(v_module_ids) and archived_at is null;
  v_story_ids := coalesce(v_story_ids, '{}'::uuid[]);

  update public.modules set archived_at = v_now, archive_batch_id = v_batch_id
    where id = any(v_module_ids) and archived_at is null;
  get diagnostics c_modules = row_count;

  update public.user_stories set archived_at = v_now, archive_batch_id = v_batch_id
    where module_id = any(v_module_ids) and archived_at is null;
  get diagnostics c_stories = row_count;

  update public.acceptance_criteria set archived_at = v_now, archive_batch_id = v_batch_id
    where user_story_id = any(v_story_ids) and archived_at is null;
  get diagnostics c_acs = row_count;

  update public.atcs set archived_at = v_now, archive_batch_id = v_batch_id
    where (module_id = any(v_module_ids) or user_story_id = any(v_story_ids))
      and archived_at is null;
  get diagnostics c_atcs = row_count;

  -- Event: module.archived (payload = the same counts the caller receives).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'module', p_module_id, 'module.archived',
    jsonb_build_object(
      'modules', c_modules,
      'user_stories', c_stories,
      'acceptance_criteria', c_acs,
      'atcs', c_atcs
    )
  );

  return jsonb_build_object(
    'modules', c_modules,
    'user_stories', c_stories,
    'acceptance_criteria', c_acs,
    'atcs', c_atcs
  );
end;
$$;

revoke execute on function public.bunkai_archive_module_subtree(uuid) from public, anon;
grant execute on function public.bunkai_archive_module_subtree(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. bunkai_restore_module_subtree
-- -----------------------------------------------------------------------------
--
-- SELECTION. The target decides the rule, and the two rules are never mixed per row:
--   * the target has a batch id: Modules, Stories and Criteria of exactly that batch;
--   * it has none (archived before 0117): rows with no batch id whose archived_at
--     equals the target's. Correct for those rows because no bulk archive has ever
--     run. The walk stops at any Module stamped differently, so nothing beneath a
--     sub-Module archived on its own comes back.
-- ATCs (AI Product Owner ruling of 2026-11-05, gap 1): in a restored Module or
-- Story, and either the target's batch, or the "held by parent" signature
-- bunkai_restore_atc leaves (0116): no actor, no batch id, the target's timestamp.
-- An ATC archived on its own keeps its actor and its own timestamp, so it stays.
-- An ATC returns only if BOTH parents are live afterwards, because every ATC reader
-- filters only atcs.archived_at (ADR-0023). If the other parent is still archived
-- the ATC passes to it, the state bunkai_restore_atc produces, and is not counted.
--
-- REFUSALS. Every check runs before any write, so a refusal changes nothing:
--   45004 ancestor_archived    the nearest archived ancestor, id and name in DETAIL
--   45002 depth_exceeded       parent chain plus restored subtree beyond 6 levels
--   45005 name_collision       an active sibling with the same normalized name
--   45006 story_key_collision  an active Story holds a restored Story's external id
-- The last one is reachable through the product: user_stories_project_external_id_uniq
-- ignores archived rows, so an archived Story's key can be taken while it is archived.
-- An already active Module is a success with changed = false, no write and no event.
--
-- CONCURRENCY. Ancestors FOR SHARE root first, then the target FOR UPDATE, then
-- writes in the cascade's order. Ancestors come first so that restoring a parent and
-- its child at once cannot deadlock. Before the ATCs are selected, both parents of
-- every ATC in reach are held FOR SHARE, Modules then Stories, the order
-- bunkai_restore_atc uses: an archive of a parent outside the restored set either
-- finishes first, and the ATC passes to that parent, or waits and sweeps the ATC up
-- afterwards. A bunkai_restore_atc holding those rows has committed by then too.
--
-- AUTHORIZATION (ADR-0012, rpc-authorization.md section 4). SECURITY DEFINER because
-- the write spans four tables and activity_log, which has no client INSERT policy.
-- No actor parameter: the actor is auth.uid(), which a PAT also has (impersonating
-- client), so there is nothing to spoof. A non-writer gets 42501 and a missing id
-- P0002, as bunkai_archive_module_subtree does; the route reads the Module with the
-- caller's RLS first, so a stranger gets 404.
--
-- Failpoint module_restore.before_event (ADR-0022) proves the write and its event
-- are one transaction.
create or replace function public.bunkai_restore_module_subtree(p_module_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id    uuid;
  v_workspace_id  uuid;
  v_parent_id     uuid;
  v_name          text;
  v_archived_at   timestamptz;
  v_batch_id      uuid;
  v_chain         uuid[];
  v_lock_id       uuid;
  v_ancestor_id   uuid;
  v_ancestor_name text;
  v_levels        int;
  v_module_ids    uuid[];
  v_story_ids     uuid[];
  v_atc_ids       uuid[];
  v_conflict      text;
  c_modules       int := 0;
  c_stories       int := 0;
  c_acs           int := 0;
  c_atcs          int := 0;
begin
  select project_id into v_project_id
    from public.modules where id = p_module_id;
  if v_project_id is null then
    raise exception 'module_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with recursive up as (
    select m.parent_module_id as id, 1 as lvl
      from public.modules m
      where m.id = p_module_id and m.parent_module_id is not null
    union all
    select m.parent_module_id, up.lvl + 1
      from public.modules m
      join up on m.id = up.id
      where m.parent_module_id is not null
  )
  select coalesce(array_agg(id order by lvl desc), '{}'::uuid[]) into v_chain from up;

  foreach v_lock_id in array v_chain loop
    perform 1 from public.modules where id = v_lock_id for share;
  end loop;

  select parent_module_id, name, archived_at, archive_batch_id
    into v_parent_id, v_name, v_archived_at, v_batch_id
    from public.modules
    where id = p_module_id
    for update;

  if v_archived_at is null then
    return jsonb_build_object(
      'id', p_module_id, 'name', v_name, 'changed', false,
      'modules', 0, 'user_stories', 0, 'acceptance_criteria', 0, 'atcs', 0
    );
  end if;

  -- Refusal: an archived ancestor. Read after the locks.
  with recursive up as (
    select m.id, m.name, m.parent_module_id, m.archived_at, 1 as lvl
      from public.modules m
      where m.id = v_parent_id
    union all
    select m.id, m.name, m.parent_module_id, m.archived_at, up.lvl + 1
      from public.modules m
      join up on m.id = up.parent_module_id
  )
  select id, name into v_ancestor_id, v_ancestor_name
    from up
    where archived_at is not null
    order by lvl
    limit 1;
  if v_ancestor_id is not null then
    raise exception 'ancestor_archived' using
      errcode = '45004',
      detail = jsonb_build_object('ancestor_id', v_ancestor_id, 'ancestor_name', v_ancestor_name)::text;
  end if;

  -- Collect what this archive took.
  with recursive subtree as (
    select m.id, 1 as lvl
      from public.modules m
      where m.id = p_module_id
    union all
    select m.id, s.lvl + 1
      from public.modules m
      join subtree s on m.parent_module_id = s.id
      where case when v_batch_id is not null
                 then m.archive_batch_id = v_batch_id
                 else m.archive_batch_id is null and m.archived_at = v_archived_at
            end
  )
  select array_agg(id), max(lvl) into v_module_ids, v_levels from subtree;

  select coalesce(array_agg(x.id), '{}'::uuid[]) into v_story_ids
    from public.user_stories x
    where x.module_id = any(v_module_ids)
      and case when v_batch_id is not null
               then x.archive_batch_id = v_batch_id
               else x.archive_batch_id is null and x.archived_at = v_archived_at
          end;

  -- Refusal: the live tree's depth. Measured on the parent chain.
  if coalesce(array_length(v_chain, 1), 0) + v_levels > 6 then
    raise exception 'depth_exceeded' using errcode = '45002';
  end if;

  -- Refusal: an active sibling already holds the name.
  select s.name into v_conflict
    from public.modules s
    join public.modules a
      on a.project_id = s.project_id
     and a.parent_module_id is not distinct from s.parent_module_id
     and a.archived_at is null
     and lower(btrim(a.name)) = lower(btrim(s.name))
    where s.id = any(v_module_ids)
    limit 1;
  if v_conflict is not null then
    raise exception 'name_collision' using
      errcode = '45005',
      detail = jsonb_build_object('module_name', v_conflict)::text;
  end if;

  -- Refusal: an active Story already holds a restored Story's external id.
  select upper(x.external_id) into v_conflict
    from public.user_stories x
    join public.user_stories a
      on a.project_id = x.project_id
     and upper(a.external_id) = upper(x.external_id)
     and a.archived_at is null
    where x.id = any(v_story_ids)
      and x.external_id is not null
    limit 1;
  if v_conflict is not null then
    raise exception 'story_key_collision' using
      errcode = '45006',
      detail = jsonb_build_object('external_id', v_conflict)::text;
  end if;

  -- Writes, in the cascade's lock order.
  update public.modules set archived_at = null, archive_batch_id = null
    where id = any(v_module_ids);
  get diagnostics c_modules = row_count;

  update public.user_stories set archived_at = null, archive_batch_id = null
    where id = any(v_story_ids);
  get diagnostics c_stories = row_count;

  update public.acceptance_criteria x set archived_at = null, archive_batch_id = null
    where x.user_story_id = any(v_story_ids)
      and case when v_batch_id is not null
               then x.archive_batch_id = v_batch_id
               else x.archive_batch_id is null and x.archived_at = v_archived_at
          end;
  get diagnostics c_acs = row_count;

  perform 1 from public.modules m
    where m.id in (
      select x.module_id from public.atcs x
       where x.module_id = any(v_module_ids) or x.user_story_id = any(v_story_ids)
    )
    order by m.id
    for share;

  perform 1 from public.user_stories s
    where s.id in (
      select x.user_story_id from public.atcs x
       where x.module_id = any(v_module_ids) or x.user_story_id = any(v_story_ids)
    )
    order by s.id
    for share;

  select coalesce(array_agg(x.id), '{}'::uuid[]) into v_atc_ids
    from public.atcs x
    where (x.module_id = any(v_module_ids) or x.user_story_id = any(v_story_ids))
      and (
        (v_batch_id is not null and x.archive_batch_id = v_batch_id)
        or (x.archive_batch_id is null and x.archived_by is null and x.archived_at = v_archived_at)
      );

  update public.atcs a set archived_at = null, archived_by = null, archive_batch_id = null
    from public.modules m, public.user_stories s
    where a.id = any(v_atc_ids)
      and m.id = a.module_id
      and s.id = a.user_story_id
      and m.archived_at is null
      and s.archived_at is null;
  get diagnostics c_atcs = row_count;

  -- What is left has a parent still archived: it goes with that parent (ADR-0023).
  update public.atcs a
    set archived_at = coalesce(s.archived_at, m.archived_at),
        archived_by = null,
        archive_batch_id = null
    from public.modules m, public.user_stories s
    where a.id = any(v_atc_ids)
      and m.id = a.module_id
      and s.id = a.user_story_id
      and a.archived_at is not null;

  if exists (
    select 1 from public.bunkai_test_failpoints f
     where f.name = 'module_restore.before_event'
       and f.workspace_id = v_workspace_id
  ) then
    raise exception 'test_failpoint' using errcode = 'P0001';
  end if;

  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'module', p_module_id, 'module.restored',
    jsonb_build_object(
      'modules', c_modules,
      'user_stories', c_stories,
      'acceptance_criteria', c_acs,
      'atcs', c_atcs
    )
  );

  return jsonb_build_object(
    'id', p_module_id,
    'name', v_name,
    'changed', true,
    'modules', c_modules,
    'user_stories', c_stories,
    'acceptance_criteria', c_acs,
    'atcs', c_atcs
  );
end;
$$;

revoke execute on function public.bunkai_restore_module_subtree(uuid) from public, anon;
grant execute on function public.bunkai_restore_module_subtree(uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_restore_module_subtree(uuid) from qa_inspector_ro;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. bunkai_list_activity (body from 0116)
-- -----------------------------------------------------------------------------
create or replace function public.bunkai_list_activity(
  p_workspace_id      uuid,
  p_limit             int default 30,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null,
  p_actions           text[] default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit       int;
  v_actions     text[];
  v_items       jsonb;
  v_fetched     int;
  v_next_cursor jsonb;
  v_last        jsonb;
begin
  -- 1. Page size: clamp into 1..50, never unbounded.
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  -- 2. Allowlist backstop: the route always passes it explicitly (Decision 2);
  --    a direct/PAT caller that omits it gets the same MVP set, not "all".
  v_actions := coalesce(
    p_actions,
    array[
      'module.renamed', 'module.description_updated', 'module.moved', 'module.archived',
      'atc.created', 'test.created', 'run.finished', 'run.aborted',
      'bug.assigned', 'bug.reassigned', 'bug.unassigned', 'bug.status_changed',
      'export.requested', 'export.downloaded',
      'atc.updated',
      'member.removed',
      'atc.archived', 'atc.restored',
      'module.restored'
    ]::text[]
  );

  -- 3. Cursor backstop: the keyset position is a PAIR. Exactly one half is not
  --    a position — raise rather than silently degrade to the first page.
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'activity_cursor_invalid' using errcode = '45214';
  end if;

  -- 4-5. One keyset page (limit+1 probe) + per-row positive projection.
  with page as (
    select a.id, a.entity_type, a.entity_id, a.action, a.actor_user_id, a.created_at, a.payload
      from public.activity_log a
      where a.workspace_id = p_workspace_id
        and a.action = any(v_actions)
        and (
          p_cursor_created_at is null
          or p_cursor_id is null
          or (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id)
        )
      order by a.created_at desc, a.id desc
      limit v_limit + 1
  ),
  kept as (
    select * from page order by created_at desc, id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', k.id,
                 'entity_type', k.entity_type,
                 'entity_id', k.entity_id,
                 'action', k.action,
                 'actor_user_id', k.actor_user_id,
                 'created_at', k.created_at,
                 'payload', case (k.action)
                   when 'module.renamed' then
                     jsonb_build_object('name', k.payload -> 'name', 'new_path', k.payload -> 'new_path')
                   when 'module.description_updated' then
                     -- source payload is always {} (0023) — no content leak.
                     '{}'::jsonb
                   when 'module.moved' then
                     jsonb_build_object('new_path', k.payload -> 'new_path')
                   when 'module.archived' then
                     jsonb_build_object(
                       'name', (select m.name from public.modules m where m.id = k.entity_id),
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'module.restored' then
                     jsonb_build_object(
                       'name', (select m.name from public.modules m where m.id = k.entity_id),
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'atc.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'atc.updated' then
                     -- BK-268: positive projection. Only the title, the TRUE
                     -- affected count and up to 3 Test titles ever leave the
                     -- DB. Titles resolve under the CALLER's RLS (function is
                     -- SECURITY INVOKER; tests_select_workspace_member), so a
                     -- Test the caller cannot see (or that was deleted after
                     -- the edit) simply does not resolve and folds into the
                     -- count remainder.
                     jsonb_build_object(
                       'title', k.payload -> 'title',
                       'affected_test_count',
                         case when jsonb_typeof(k.payload -> 'affected_test_ids') = 'array'
                              then jsonb_array_length(k.payload -> 'affected_test_ids') else 0 end,
                       'affected_tests', coalesce((
                         select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title) order by r.title, r.id)
                           from (
                             select t.id, t.title
                               from public.tests t
                              where t.workspace_id = p_workspace_id
                                and jsonb_typeof(k.payload -> 'affected_test_ids') = 'array'
                                and t.id in (
                                  select e.value::uuid
                                    from jsonb_array_elements_text(k.payload -> 'affected_test_ids') e
                                )
                              order by t.title, t.id
                              limit 3
                           ) r
                       ), '[]'::jsonb)
                     )
                   when 'atc.archived' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'atc.restored' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'test.created' then
                     jsonb_build_object('title', k.payload -> 'title')
                   when 'run.finished' then
                     jsonb_build_object('verdict', k.payload -> 'verdict', 'skipped_steps', k.payload -> 'skipped_steps')
                   when 'run.aborted' then
                     -- reason is DELIBERATELY excluded (Decision 3, Risk R3) —
                     -- free-text, unredacted operator input never leaves the
                     -- DB via this feed. Only skipped_steps is projected.
                     jsonb_build_object('skipped_steps', k.payload -> 'skipped_steps')
                   when 'bug.assigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.reassigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.unassigned' then
                     jsonb_build_object(
                       'previous_assignee_user_id', k.payload -> 'previous_assignee_user_id',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'bug.status_changed' then
                     jsonb_build_object(
                       'previous_status', k.payload -> 'previous_status',
                       'status', k.payload -> 'status',
                       'assignee_user_id', k.payload -> 'assignee_user_id'
                     )
                   when 'export.requested' then
                     '{}'::jsonb
                   when 'export.downloaded' then
                     '{}'::jsonb
                   when 'member.removed' then
                     -- BK-572: who was removed and the role they held.
                     jsonb_build_object(
                       'removed_user_id', k.payload -> 'removed_user_id',
                       'removed_role', k.payload -> 'removed_role'
                     )
                   else '{}'::jsonb
                 end
               ) order by k.created_at desc, k.id desc)
        from kept k), '[]'::jsonb),
    (select count(*) from page)
    into v_items, v_fetched;

  -- 6. next_cursor: NULL when the probe row was absent (no further page).
  --    Otherwise the (created_at, id) of the LAST row actually returned.
  if v_fetched > v_limit and jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    v_next_cursor := jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next_cursor);
end;
$$;

-- Verification (run after apply):
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and column_name = 'archive_batch_id'; -- 4
--   select has_function_privilege('anon', 'public.bunkai_restore_module_subtree(uuid)', 'EXECUTE'); -- false
--   select has_function_privilege('qa_inspector_ro', 'public.bunkai_restore_module_subtree(uuid)', 'EXECUTE'); -- false
--   select md5(prosrc) from pg_proc where proname = 'bunkai_restore_module_subtree'; -- equals the file's body
