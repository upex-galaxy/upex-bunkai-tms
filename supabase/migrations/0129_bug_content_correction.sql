-- Migration: 0129 — BK-1835: correct a filed defect's title, severity,
-- description and reproduction steps
-- Authored: 2026-11-15
--
-- Governing record: the BK-1835 "AI Product Owner — Decision" (P1-P9) and
-- "AI Tech Lead — Decision" (T1-T7) comments of 2026-11-15, and ADR-0012
-- (rpc-authorization-invariant). Additive and idempotent: one new column with
-- a default, one new function, two `create or replace` copy-forwards.
--
-- What it does:
--   1. bugs.content_version — the staleness token (T1). Starts at 1 and is
--      bumped ONLY by an effective correction, so a status or assignee change
--      never makes a content save stale (content and lifecycle are
--      independent, business rule 1). updated_at was rejected for exactly that
--      reason: bugs_set_updated_at fires on every write, assign and status
--      included.
--   2. bunkai_bug_json — body copied forward from 0070 plus content_version,
--      so every composed defect (detail read, create, assign, status, correct)
--      carries the token the next correction must send back.
--   3. bunkai_correct_bug — the only write path for a correction (T4).
--   4. bunkai_list_activity — body copied forward from 0120 plus the
--      `bug.corrected` event (allowlist backstop + positive projection, P6).
--
-- Authorization (rpc-authorization.md §4, ADR-0012), same shape as 0118's
-- bunkai_assign_bug:
--   * SECURITY DEFINER, because `bugs` has no UPDATE policy (0046) and adding
--     one would open a REST write path with no audit row. DEFINER keeps the
--     write and its activity row atomic in one path.
--   * No actor parameter: the caller is auth.uid(). Execute is granted to
--     `authenticated` only and revoked from `service_role` (a null uid would
--     fail the membership check anyway) and from `qa_inspector_ro`, the
--     read-only inspector role 0085's default privilege would otherwise reach.
--   * A missing defect and a defect in a workspace the caller is not a member
--     of both raise P0002 (404). Only a confirmed member without write access
--     gets the distinct 42501 (403): that member can already read the defect.
--   * The row is locked FOR UPDATE and the caller re-checked after the lock,
--     the same rule as 0114 / 0118.
--   * Only title, severity, description, steps_to_reproduce and
--     content_version are written. Provenance, status, assignee, evidence and
--     sync state are untouched by construction.
--
-- Custom SQLSTATE codes (bugs domain, 453xx block; 45313 was the highest,
-- 0054):
--   45314  bug_content_stale  (p_expected_version is not the current
--                              content_version: the defect changed since the
--                              caller loaded it)
-- Reused: 45301 bug_title_invalid, 45302 bug_severity_invalid (0046).

-- ============================================================================
-- 1. bugs.content_version
-- ============================================================================

alter table public.bugs
  add column if not exists content_version integer not null default 1;

alter table public.bugs drop constraint if exists bugs_content_version_positive;
alter table public.bugs
  add constraint bugs_content_version_positive check (content_version >= 1);

-- ============================================================================
-- 2. bunkai_bug_json — 0070's body plus content_version
-- ============================================================================
-- Still `language sql stable`, still SECURITY INVOKER: 0070's §4 answers hold
-- unchanged (one new scalar from the same already-authorized row).

create or replace function public.bunkai_bug_json(p_bug_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'workspace_id', b.workspace_id,
    'project_id', b.project_id,
    'module_id', b.module_id,
    'module', (
      select jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'path', m.path,
        'archived_at', m.archived_at
      )
        from public.modules m
        where m.id = b.module_id
    ),
    'run_id', b.run_id,
    'run_step_id', b.run_step_id,
    'atc_id', b.atc_id,
    'title', b.title,
    'severity', b.severity,
    'status', b.status,
    'description', b.description,
    'steps_to_reproduce', b.steps_to_reproduce,
    'evidence_urls', to_jsonb(b.evidence_urls),
    'assignee_user_id', b.assignee_user_id,
    'content_version', b.content_version,
    'created_by', b.created_by,
    'created_at', b.created_at,
    'updated_at', b.updated_at,
    'origin', case
      when b.run_id is null and b.atc_id is null then null
      else jsonb_build_object(
        'run_id', b.run_id,
        'run_step_position', (
          select rs.position
            from public.run_steps rs
            where rs.id = b.run_step_id
        ),
        'atc_id', b.atc_id,
        'atc_title', (
          select a.title
            from public.atcs a
            where a.id = b.atc_id
        ),
        'atc_layer', (
          select a.layer
            from public.atcs a
            where a.id = b.atc_id
        )
      )
    end
  )
  from public.bugs b
  where b.id = p_bug_id;
$$;

revoke execute on function public.bunkai_bug_json(uuid) from public, anon;
grant execute on function public.bunkai_bug_json(uuid) to authenticated, service_role;

-- ============================================================================
-- 3. bunkai_correct_bug — correct a defect's content
-- ============================================================================
-- A null argument means "leave this field as it is". Normalization matches
-- filing (bunkai_create_bug, 0046): the title is trimmed, the description is
-- trimmed and an empty one is stored as null, the steps are kept as typed.
-- A save whose normalized values equal the current ones is a no-op: nothing
-- is written and no activity row is added (P3, business rule 6).
--
-- Returns { bug: <bunkai_bug_json>, changed: boolean }.

create or replace function public.bunkai_correct_bug(
  p_bug_id             uuid,
  p_expected_version   integer,
  p_title              text default null,
  p_severity           text default null,
  p_description        text default null,
  p_steps_to_reproduce text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_old_title      text;
  v_old_severity   text;
  v_old_desc       text;
  v_old_steps      text;
  v_version        integer;
  v_new_title      text;
  v_new_severity   text;
  v_new_desc       text;
  v_new_steps      text;
  v_changes        jsonb := '{}'::jsonb;
begin
  -- 1. Resolve the defect. Missing and foreign collapse into one not-found.
  select workspace_id into v_workspace_id
    from public.bugs
    where id = p_bug_id;
  if v_workspace_id is null or not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'bug_not_found' using errcode = 'P0002';
  end if;

  -- 2. Write-role gate (a Viewer stops here).
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 3. Input backstops, the filing rules (Zod is the primary guard). Length
  --    is counted in code points, the unit of the table CHECK, so this raises
  --    the friendly 45301 before the CHECK could.
  if p_title is not null then
    v_new_title := btrim(p_title);
    if char_length(v_new_title) < 5 or char_length(v_new_title) > 200 then
      raise exception 'bug_title_invalid' using errcode = '45301';
    end if;
  end if;
  if p_severity is not null and p_severity not in ('P1', 'P2', 'P3', 'P4') then
    raise exception 'bug_severity_invalid' using errcode = '45302';
  end if;

  -- 4. Lock the defect, read its current content, and re-validate the caller
  --    against whatever committed during the wait.
  select title, severity, description, steps_to_reproduce, content_version
    into v_old_title, v_old_severity, v_old_desc, v_old_steps, v_version
    from public.bugs
    where id = p_bug_id
    for update;
  if not found or not public.bunkai_is_workspace_member(v_workspace_id) then
    raise exception 'bug_not_found' using errcode = 'P0002';
  end if;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 5. Staleness: the caller must have loaded the current content.
  if p_expected_version is null or p_expected_version <> v_version then
    raise exception 'bug_content_stale' using errcode = '45314';
  end if;

  -- 6. Normalize, then collect only the fields that really change.
  v_new_title := coalesce(v_new_title, v_old_title);
  v_new_severity := coalesce(p_severity, v_old_severity);
  v_new_desc := case
    when p_description is null then v_old_desc
    else nullif(btrim(p_description), '')
  end;
  v_new_steps := coalesce(p_steps_to_reproduce, v_old_steps);

  if v_new_title is distinct from v_old_title then
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('from', v_old_title, 'to', v_new_title));
  end if;
  if v_new_severity is distinct from v_old_severity then
    v_changes := v_changes || jsonb_build_object('severity', jsonb_build_object('from', v_old_severity, 'to', v_new_severity));
  end if;
  if v_new_desc is distinct from v_old_desc then
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('from', v_old_desc, 'to', v_new_desc));
  end if;
  if v_new_steps is distinct from v_old_steps then
    v_changes := v_changes || jsonb_build_object('steps_to_reproduce', jsonb_build_object('from', v_old_steps, 'to', v_new_steps));
  end if;

  -- 7. No-op: nothing written, no activity row.
  if v_changes = '{}'::jsonb then
    return jsonb_build_object('bug', public.bunkai_bug_json(p_bug_id), 'changed', false);
  end if;

  -- 8. The write: the four content columns and the version, this row only.
  update public.bugs
    set title = v_new_title,
        severity = v_new_severity,
        description = v_new_desc,
        steps_to_reproduce = v_new_steps,
        content_version = v_version + 1
    where id = p_bug_id;

  -- 9. One audit row per effective correction, however many fields changed.
  --    The full previous and new values live here; the feed projects only
  --    the title and severity pairs (bunkai_list_activity below, P6).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, auth.uid(), 'bug', p_bug_id, 'bug.corrected',
    jsonb_build_object('title', v_new_title, 'changes', v_changes)
  );

  return jsonb_build_object('bug', public.bunkai_bug_json(p_bug_id), 'changed', true);
end;
$$;

revoke execute on function public.bunkai_correct_bug(uuid, integer, text, text, text, text) from public, anon, service_role;
grant execute on function public.bunkai_correct_bug(uuid, integer, text, text, text, text) to authenticated;

-- The 0085 default privilege grants EXECUTE on every new function to the QA
-- inspector roles. The read-only one must never reach a write path (0086's
-- own invariant), so it is revoked here, guarded like 0118 / 0124.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_correct_bug(uuid, integer, text, text, text, text)
      from qa_inspector_ro;
  end if;
end;
$$;

-- ============================================================================
-- 4. bunkai_list_activity — 0120's body plus `bug.corrected`
-- ============================================================================

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
      'module.restored',
      'jira_connection.connected', 'jira_connection.changed', 'jira_connection.disconnected',
      'bug.corrected'
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
                   when 'bug.corrected' then
                     -- BK-1835 (P6): the defect's title after the correction,
                     -- the names of the changed fields, and the previous/new
                     -- pairs of title and severity only. Description and steps
                     -- are free text: their values stay in activity_log.
                     jsonb_build_object(
                       'title', k.payload -> 'title',
                       'changed_fields', coalesce((
                         select jsonb_agg(f.key order by f.key)
                           from jsonb_object_keys(
                             case when jsonb_typeof(k.payload -> 'changes') = 'object'
                                  then k.payload -> 'changes' else '{}'::jsonb end
                           ) as f(key)
                       ), '[]'::jsonb),
                       'title_change', k.payload -> 'changes' -> 'title',
                       'severity_change', k.payload -> 'changes' -> 'severity'
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
                   when 'jira_connection.connected' then
                     -- BK-1619: the site host only. Never the token, the
                     -- secret id or the email.
                     jsonb_build_object('site_host', k.payload -> 'site_host')
                   when 'jira_connection.changed' then
                     jsonb_build_object('site_host', k.payload -> 'site_host')
                   when 'jira_connection.disconnected' then
                     jsonb_build_object('site_host', k.payload -> 'site_host')
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

revoke execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) from public, anon;
grant execute on function public.bunkai_list_activity(uuid, int, timestamptz, uuid, text[]) to authenticated, service_role;
