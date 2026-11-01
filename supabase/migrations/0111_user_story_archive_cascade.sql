-- =============================================================================
-- 0111_user_story_archive_cascade
-- BK-1555 — archiving a User Story archives its acceptance criteria and ATCs.
-- =============================================================================
--
-- WHY. `DELETE /api/v1/user-stories/{id}` set only `user_stories.archived_at`.
-- The story's ATCs kept `archived_at = null`, so `GET /api/v1/atcs/{id}`
-- (bunkai_get_atc) served them with 200, against the BK-595 decision
-- ("archived, including via an archived parent: 404"). Every ATC reader (by id,
-- usage, search, library, workbench tree and table, detail page, export, Test
-- builder library) filters only `atcs.archived_at`: they rely on the invariant
-- module archiving keeps (bunkai_archive_module_subtree, 0014/0023), where an
-- archived parent means archived children. Story archiving was the one writer
-- that broke it. Decision and scored alternatives: BK-1555, "AI Tech Lead —
-- Decision" (2026-11-01).
--
-- WHAT.
--   1. bunkai_archive_user_story(p_story_id): archives the story, its live
--      acceptance criteria and its live ATCs with ONE timestamp in ONE
--      transaction, and returns the archived story row (the route's
--      `{ user_story }` body, unchanged). Errors:
--        P0002  story not found
--        42501  caller cannot write the story's workspace
--        55000  story already archived (route: 409 already_archived)
--   2. Backfill: every live criterion and ATC under a story that is ALREADY
--      archived takes that story's own archived_at (2 rows on 2026-11-01).
--
-- Additive: one new function, plus a data backfill that only fills
-- archived_at where it is null. No un-archive path exists for stories, and
-- bunkai_create_atc already refuses an archived story, so no live ATC can
-- appear under an archived story afterwards.
--
-- GRANTS. Mirrors bunkai_archive_module_subtree: SECURITY DEFINER,
-- search_path = '', role gate through bunkai_can_write_workspace (auth.uid()),
-- execute revoked from public/anon, granted to authenticated/service_role.
-- 0085's default privileges also hand a new function to qa_inspector_ro; this
-- one WRITES, so it is revoked from qa_inspector_ro explicitly (0086 rule,
-- 0109 mechanism). qa_inspector_rw keeps the default grant, like the module
-- function.
-- =============================================================================

create or replace function public.bunkai_archive_user_story(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_now          timestamptz := now();
  v_row          public.user_stories;
begin
  -- The module is the authoritative owner (user_stories.project_id is
  -- nullable), the same lookup bunkai_archive_module_subtree makes.
  select m.project_id into v_project_id
    from public.user_stories us
    join public.modules m on m.id = us.module_id
    where us.id = p_story_id;
  if v_project_id is null then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;

  select workspace_id into v_workspace_id
    from public.projects where id = v_project_id;
  if not public.bunkai_can_write_workspace(v_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.user_stories set archived_at = v_now
    where id = p_story_id and archived_at is null
    returning * into v_row;
  if v_row.id is null then
    raise exception 'already_archived' using errcode = '55000';
  end if;

  update public.acceptance_criteria set archived_at = v_now
    where user_story_id = p_story_id and archived_at is null;

  update public.atcs set archived_at = v_now
    where user_story_id = p_story_id and archived_at is null;

  return jsonb_build_object(
    'id', v_row.id,
    'module_id', v_row.module_id,
    'project_id', v_row.project_id,
    'title', v_row.title,
    'description', v_row.description,
    'external_id', v_row.external_id,
    'external_url', v_row.external_url,
    'status', v_row.status,
    'created_at', v_row.created_at,
    'archived_at', v_row.archived_at
  );
end;
$$;

revoke execute on function public.bunkai_archive_user_story(uuid) from public, anon;
grant execute on function public.bunkai_archive_user_story(uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qa_inspector_ro') then
    revoke all on function public.bunkai_archive_user_story(uuid) from qa_inspector_ro;
  end if;
end;
$$;

-- Backfill: children of stories archived before this migration.
update public.acceptance_criteria c
  set archived_at = s.archived_at
  from public.user_stories s
  where c.user_story_id = s.id
    and s.archived_at is not null
    and c.archived_at is null;

update public.atcs a
  set archived_at = s.archived_at
  from public.user_stories s
  where a.user_story_id = s.id
    and s.archived_at is not null
    and a.archived_at is null;
