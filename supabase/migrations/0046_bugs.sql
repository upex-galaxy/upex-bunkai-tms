-- 0046_bugs.sql — BK-40 Slice 1: TMS-Defect Filing — schema + RLS + RPCs
--
-- File a TMS-native "bug" (the domain-glossary term; Jira prose keeps saying
-- "defect" — Technical Decision 1 of the BK-40 implementation plan) from a
-- failed run step OR standalone. This migration ships ONLY the data layer:
-- table -> RLS -> composer function -> write RPC -> read RPC. It mirrors the
-- structural precedent of 0031_runs.sql (table -> RLS -> composer -> create
-- RPC -> read RPC) and reuses two existing helpers VERBATIM:
--   * bunkai_assert_actor_can_write_project (0021_atc_create_update.sql)
--   * bunkai_assert_actor_can_read_workspace (0025_test_read.sql)
--   * bunkai_set_updated_at (0004_atcs.sql, the shared updated_at trigger fn)
--
-- Adds:
--   * bugs                    — the bug/defect record. workspace_id/project_id/
--                                module_id are always populated; run_id/
--                                run_step_id/atc_id are nullable PROVENANCE
--                                links only (mirrors run_atcs.atc_id) — a
--                                standalone bug carries none of the three.
--   * bunkai_bug_json          — composer (header + nested module {id,name,path})
--   * bunkai_create_bug        — atomic SECURITY DEFINER create
--   * bunkai_list_project_bugs — membership-gated, newest-first project list
--
-- Authorization model: Path A (explicit-actor SECURITY DEFINER), reusing
-- bunkai_assert_actor_can_write_project verbatim (ADR-0001; no new ADR needed
-- per the BK-40 implementation plan's Technical Decision 4).
--
-- Run-linked context (module/run/step/ATC) is ALWAYS derived server-side from
-- run_step_id at the HTTP edge (app/api/v1/bugs/route.ts) — bunkai_create_bug
-- never trusts p_module_id/p_project_id blindly either way: it re-validates
-- module ∈ project itself (defense in depth, mirrors bunkai_create_atc's own
-- project-membership re-validation, 0021_atc_create_update.sql:176-188), which
-- is what actually forecloses the story's own HIGH-risk cross-project-module-
-- injection scenario at the DB layer regardless of what the HTTP layer does.
--
-- Custom SQLSTATE codes allocated for the bugs domain (class 45xxx, 453xx
-- block — the next free block; 452xx is the runs domain, up to 45214 per
-- 0045_activity_stream.sql):
--   45300  bugs_module_outside_project (module does not belong to the target project;
--                                        raised both by bunkai_create_bug's own
--                                        step 2 AND by the bunkai_bugs_check_consistency
--                                        table trigger below — same condition, two
--                                        enforcement layers, one code)
--   45301  bug_title_invalid           (RPC backstop — Zod is the primary guard)
--   45302  bug_severity_invalid        (RPC backstop — Zod is the primary guard)
--   45303  bug_evidence_limit_exceeded (RPC backstop — Zod is the primary guard;
--                                        the DB CHECK below is the hard floor)
--   45304  bugs_project_outside_workspace (project's workspace_id does not match
--                                        the row's workspace_id — raised by the
--                                        bunkai_bugs_check_consistency table trigger;
--                                        has no RPC-level analog since
--                                        bunkai_create_bug always derives
--                                        workspace_id from the project itself)
--
-- Stage 3 adversarial review (post-first-pass) found bunkai_create_bug shipped
-- with NO actor-bind guard (BLOCKER: any signed-in user could call the RPC
-- directly and pass a write-role victim's uuid as p_actor_user_id, bypassing
-- app/api/v1/bugs/route.ts entirely) and that the bugs INSERT policy never
-- cross-checked project_id/module_id against workspace_id (MAJOR: a genuine
-- write-role member of their OWN workspace could raw-REST-insert an
-- internally-inconsistent row using a foreign project_id/module_id). Both are
-- fixed in place below rather than as a follow-up migration: this file was
-- not yet merged or depended upon downstream, so there is no "already
-- shipped" shape to preserve (contrast 0039's append-only rationale for the
-- already-merged 0038).

-- ============================================================================
-- 1. bugs
-- ============================================================================

create table if not exists public.bugs (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  module_id           uuid not null references public.modules(id) on delete cascade,
  -- Provenance only (mirrors run_atcs.atc_id, 0031_runs.sql) — a standalone bug
  -- carries all three as NULL; a run-linked bug's ids are frozen at filing time
  -- and stay valid even if the source run/step/atc is later deleted.
  run_id              uuid references public.runs(id) on delete set null,
  run_step_id         uuid references public.run_steps(id) on delete set null,
  atc_id              uuid references public.atcs(id) on delete set null,
  title               text not null
                        check (title = btrim(title) and char_length(title) between 5 and 200),
  severity            text not null check (severity in ('P1', 'P2', 'P3', 'P4')),
  status              text not null default 'open'
                        check (status in ('open', 'in_progress', 'resolved', 'closed')),
  description         text,
  steps_to_reproduce  text not null default '',
  evidence_urls       text[] not null default '{}'
                        check (coalesce(array_length(evidence_urls, 1), 0) <= 10),
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists bugs_project_id_created_at_idx on public.bugs (project_id, created_at desc);
create index if not exists bugs_workspace_id_idx on public.bugs (workspace_id);
create index if not exists bugs_module_id_idx on public.bugs (module_id);
create index if not exists bugs_run_id_idx on public.bugs (run_id);

drop trigger if exists bugs_set_updated_at on public.bugs;
create trigger bugs_set_updated_at
  before update on public.bugs
  for each row
  execute function public.bunkai_set_updated_at();

alter table public.bugs enable row level security;

-- SELECT: any active workspace member.
drop policy if exists bugs_select_workspace_member on public.bugs;
create policy bugs_select_workspace_member
  on public.bugs
  for select
  using ( public.bunkai_is_workspace_member(workspace_id) );

-- INSERT: defense-in-depth only — real inserts flow through bunkai_create_bug
-- (SECURITY DEFINER / admin client). Mirrors runs_insert_workspace_role_member_plus
-- (0031_runs.sql) exactly: member+ write role required.
--
-- This checks workspace_id ALONE — like its runs.sql precedent, it does not
-- (and by itself cannot cheaply) verify project_id belongs to workspace_id or
-- module_id belongs to project_id. That gap is closed below by the
-- bunkai_bugs_check_consistency trigger, scoped to THIS table only (the same
-- gap on runs is tracked separately and is out of scope here).
drop policy if exists bugs_insert_workspace_role_member_plus on public.bugs;
create policy bugs_insert_workspace_role_member_plus
  on public.bugs
  for insert
  with check ( public.bunkai_can_write_workspace(workspace_id) );

-- Table-level defense-in-depth: cross-column consistency, independent of
-- whether the write came through bunkai_create_bug or a raw REST insert/update
-- against public.bugs directly. A write-role member of THEIR OWN workspace can
-- satisfy the INSERT policy above with a real workspace_id while supplying a
-- project_id/module_id pair that belongs to a completely different workspace
-- they have no relationship to — this trigger rejects that internally
-- inconsistent row regardless of the RLS outcome.
create or replace function public.bunkai_bugs_check_consistency()
returns trigger
set search_path = ''
language plpgsql
as $$
declare
  v_project_workspace uuid;
  v_module_project    uuid;
begin
  select workspace_id into v_project_workspace
    from public.projects
    where id = new.project_id;
  if v_project_workspace is null or v_project_workspace <> new.workspace_id then
    raise exception 'bugs_project_outside_workspace' using errcode = '45304';
  end if;

  select project_id into v_module_project
    from public.modules
    where id = new.module_id;
  if v_module_project is null or v_module_project <> new.project_id then
    raise exception 'bugs_module_outside_project' using errcode = '45300';
  end if;

  return new;
end;
$$;

drop trigger if exists bugs_check_consistency on public.bugs;
create trigger bugs_check_consistency
  before insert or update on public.bugs
  for each row
  execute function public.bunkai_bugs_check_consistency();

-- ============================================================================
-- 2. bunkai_bug_json — composer (header + nested module {id, name, path})
-- ============================================================================

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
      select jsonb_build_object('id', m.id, 'name', m.name, 'path', m.path)
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
    'created_by', b.created_by,
    'created_at', b.created_at,
    'updated_at', b.updated_at
  )
  from public.bugs b
  where b.id = p_bug_id;
$$;

revoke execute on function public.bunkai_bug_json(uuid) from public, anon;
grant execute on function public.bunkai_bug_json(uuid) to authenticated, service_role;

-- ============================================================================
-- 3. bunkai_create_bug — atomic create. SECURITY DEFINER.
-- ============================================================================
--
-- Validation order is load-bearing (observable behavior), mirrors
-- bunkai_create_atc in shape, plus the actor-bind guard bunkai_list_project_bugs
-- (below) already carries and bunkai_create_bug initially did NOT (Stage 3
-- BLOCKER — see the file header):
--   0. Actor bind. NULL auth.uid() = service-role / admin client, for which the
--      parameter IS the identity; a present-but-different uid is a spoof — an
--      attacker's own JWT paired with a write-role victim's uuid as
--      p_actor_user_id, bypassing the HTTP route entirely via a direct
--      supabase.rpc() call. Collapses into the SAME project_not_found (P0002)
--      bunkai_assert_actor_can_write_project itself raises for a missing/foreign
--      project (non-disclosure: never a third, distinct error shape).
--   1. AuthZ: bunkai_assert_actor_can_write_project (reused verbatim) — also
--      resolves workspace_id and raises project_not_found (P0002) for a
--      missing/foreign project, forbidden (42501) for a non-writer.
--   2. Module must exist, be active, and belong to p_project_id, else
--      bugs_module_outside_project (45300). This is the actual enforcement
--      point for the story's HIGH-risk cross-project-module-injection
--      scenario — independent of whatever the HTTP layer already checked.
--   3. RPC-level backstops for title/severity/evidence-count (Zod is the
--      primary guard at the HTTP edge; the DB CHECK on evidence_urls is the
--      hard floor beneath even this).
--   4. Insert (status always defaults 'open' — BK-40 never writes any other
--      status; the lifecycle enum exists now per Technical Decision 5, mirrors
--      runs.status's own precedent). The bunkai_bugs_check_consistency trigger
--      (section 1 above) also fires here, but is a no-op for this path since
--      workspace_id/project_id/module_id are already validated consistent by
--      steps 1-2.
--   5. Audit: activity_log, entity_type='bug', action='bug.filed'.
--   6. Return bunkai_bug_json(new id).

create or replace function public.bunkai_create_bug(
  p_actor_user_id      uuid,
  p_project_id         uuid,
  p_module_id          uuid,
  p_title              text,
  p_severity           text,
  p_description        text,
  p_steps_to_reproduce text,
  p_evidence_urls      text[],
  p_run_id             uuid,
  p_run_step_id        uuid,
  p_atc_id             uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_module_project uuid;
  v_title          text := btrim(coalesce(p_title, ''));
  v_description    text := nullif(btrim(coalesce(p_description, '')), '');
  v_steps          text := coalesce(p_steps_to_reproduce, '');
  v_evidence       text[] := coalesce(p_evidence_urls, '{}');
  v_bug_id         uuid;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which
  --    the parameter IS the identity; a present-but-different uid is a spoof
  --    and collapses into the missing-Project answer (non-disclosure) — the
  --    SAME P0002 bunkai_assert_actor_can_write_project itself raises for a
  --    missing/foreign project, so this never invents a third error shape.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. AuthZ + project resolution (reused verbatim).
  v_workspace_id := public.bunkai_assert_actor_can_write_project(p_actor_user_id, p_project_id);

  -- 2. Module must exist, be active, and belong to THIS project.
  select project_id into v_module_project
    from public.modules
    where id = p_module_id and archived_at is null;
  if v_module_project is null or v_module_project <> p_project_id then
    raise exception 'bugs_module_outside_project' using errcode = '45300';
  end if;

  -- 3. RPC-level backstops.
  if char_length(v_title) < 5 or char_length(v_title) > 200 then
    raise exception 'bug_title_invalid' using errcode = '45301';
  end if;
  if p_severity is null or p_severity not in ('P1', 'P2', 'P3', 'P4') then
    raise exception 'bug_severity_invalid' using errcode = '45302';
  end if;
  if coalesce(array_length(v_evidence, 1), 0) > 10 then
    raise exception 'bug_evidence_limit_exceeded' using errcode = '45303';
  end if;

  -- 4. Insert.
  insert into public.bugs (
    workspace_id, project_id, module_id, run_id, run_step_id, atc_id,
    title, severity, description, steps_to_reproduce, evidence_urls, created_by
  )
  values (
    v_workspace_id, p_project_id, p_module_id, p_run_id, p_run_step_id, p_atc_id,
    v_title, p_severity, v_description, v_steps, v_evidence, p_actor_user_id
  )
  returning id into v_bug_id;

  -- 5. Audit (DEFINER-only writer).
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'bug', v_bug_id, 'bug.filed',
    jsonb_build_object(
      'title', v_title,
      'severity', p_severity,
      'run_id', p_run_id,
      'run_step_id', p_run_step_id
    )
  );

  -- 6. Return the composed bug json.
  return public.bunkai_bug_json(v_bug_id);
end;
$$;

revoke execute on function public.bunkai_create_bug(
  uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid
) from public, anon;
grant execute on function public.bunkai_create_bug(
  uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid
) to authenticated, service_role;

-- ============================================================================
-- 4. bunkai_list_project_bugs — membership-gated, newest-first project list
-- ============================================================================
--
-- Mirrors bunkai_report_project_runs's read-gate (0041_run_project_report.sql)
-- exactly, including the actor-bind guard baked in from day one (that RPC's
-- own header notes it had to be RETROFITTED onto bunkai_list_test_runs in
-- 0039 after a review finding — no reason to repeat that gap here).
--
-- Bare-bones list scope (Technical Decision 2): unfiltered, newest-first,
-- single page. The `limit 200` below is a defensive cap on an otherwise-
-- unbounded query, not a real pagination contract — BK-41 replaces this RPC
-- with proper keyset pagination + filters.

create or replace function public.bunkai_list_project_bugs(
  p_actor_user_id uuid,
  p_project_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  -- 0. Actor bind. NULL auth.uid() = service-role / admin client, for which
  --    the parameter IS the identity; a present-but-different uid is a spoof
  --    and collapses into the missing-Project answer (non-disclosure).
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve the Project, then re-check READ membership (any active role).
  select workspace_id into v_workspace_id
    from public.projects
    where id = p_project_id;
  if v_workspace_id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', b.id,
                 'workspace_id', b.workspace_id,
                 'project_id', b.project_id,
                 'module_id', b.module_id,
                 'module', jsonb_build_object('id', m.id, 'name', m.name, 'path', m.path),
                 'run_id', b.run_id,
                 'run_step_id', b.run_step_id,
                 'atc_id', b.atc_id,
                 'title', b.title,
                 'severity', b.severity,
                 'status', b.status,
                 'description', b.description,
                 'steps_to_reproduce', b.steps_to_reproduce,
                 'evidence_urls', to_jsonb(b.evidence_urls),
                 'created_by', b.created_by,
                 'created_at', b.created_at,
                 'updated_at', b.updated_at
               ) order by b.created_at desc, b.id desc)
        from (
          select *
            from public.bugs
            where project_id = p_project_id
            order by created_at desc, id desc
            limit 200
        ) b
        join public.modules m on m.id = b.module_id
      ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.bunkai_list_project_bugs(uuid, uuid) from public, anon;
grant execute on function public.bunkai_list_project_bugs(uuid, uuid) to authenticated, service_role;
