-- 0068_story_traceability_report.sql — BK-45: render a User Story's full
-- AC -> ATC -> Test -> Run -> Defect evidence chain in ONE round trip.
--
-- Adds:
--   * bunkai_report_story_traceability — membership-gated, per-story chain
--     assembly (level-wise CTEs, jsonb_agg composition, one statement)
--   * bugs_atc_id_idx — bugs has no index on atc_id; the defect-scoping join
--     below needs it (D12, comment 12176)
--
-- Every product/technical decision behind this migration was ratified on the
-- BK-45 Jira ticket, comments 2026-08-05 by the AI Product Owner / Business
-- Analyst (12171) and the AI Tech Lead (12176), per CLAUDE.md Critical Rule
-- #18. This header cites the rulings; it does not re-derive them.
--
-- ADR-0012 compliance (six-question gate, answered in the Stage 1 plan
-- before this file was written):
--   1. SECURITY DEFINER is required, not a convenience: atc_acceptance_criteria
--      has no project_id/workspace_id column and no RLS-reachable scope path,
--      so SECURITY INVOKER cannot scope the AC<->ATC join.
--   2. The identity parameter cannot be deleted: routes call report RPCs
--      through createAdminClient() (auth.uid() IS NULL there), so the caller
--      must supply the actor explicitly, same as 0048/0049/0052.
--   3. Actor bind sits at step 0, before any table read (below). It is
--      INERT on the admin-client call path (auth.uid() NULL) — the real
--      protection is (4), never relied on alone.
--   4. Every returned row source is independently scoped — see the `pair`
--      CTE comment below, the critical one: it is the ONLY guard against a
--      cross-project ATC entering the chain through the unscoped
--      atc_acceptance_criteria join table (the exact class of leak that
--      shipped once already, migration 0047's incident).
--   5. Precedent copied verbatim: 0048_project_coverage_report.sql,
--      0049_recovery_cycle_report.sql, 0052_defect_heatmap_report.sql —
--      same actor-bind shape, same grant/revoke convention, same
--      non-disclosure P0002 raised for missing/foreign/non-member alike.
--   6. Known, pre-existing debt NOT fixed here (AI Tech Lead D11): the
--      module-cascade archive-orphan hole in bunkai_archive_module_subtree
--      (0014) and the identical own-state-only archived filtering already
--      shipped in 0048/0050/0052. Zero orphans measured live today — no
--      backfill required. Recorded as a follow-up tech story.
--
-- Grain: p_user_story_id, not p_project_id (PO ruling — the route is
-- /projects/{projectSlug}/traceability?story={userStoryId}, one story's
-- chain per read). The project is DERIVED inside the function via
-- user_stories.module_id -> modules.project_id — NEVER through the nullable
-- user_stories.project_id (AI Tech Lead fact 1: that column is a nullable
-- 0016 backfill and using it as a scope predicate is a silent tenancy hole).
--
-- "Latest run" = runs.started_at DESC, tiebreak id DESC (AI Tech Lead D10) —
-- a total, stable order riding the SAME grain as the shipped
-- runs_test_id_started_at_idx (0031) / runs (project_id, status, started_at
-- desc, id desc) (0038/0041) convention; no new index needed for this.
--
-- Archived filtering (AI Tech Lead D11) is belt-and-braces on the ATC set:
-- own archived_at, own module's archived_at, and a path-prefix check against
-- any archived ANCESTOR module (bunkai_archive_module_subtree's recursive
-- arm can strand live descendants under an already-archived intermediate
-- module — fact 5 on the ticket). Applied identically to acceptance_criteria
-- (own archived_at only — an AC has no module ancestry of its own; it
-- inherits scope through user_stories -> modules, which the story-level
-- resolution already fixes to ONE story).
--
-- Defect scoping (AI Tech Lead, defect-scoping join decision): bugs.atc_id
-- against this story's live ATC set, PLUS bugs.project_id. NOT bugs.run_id
-- (would leak a Test's other stories' defects into this chain — EC9, the
-- PO's own worked example) and NOT a run_step_id walk (extra join, no
-- benefit, no index). All defects for the ATC ship, not only the latest
-- run's (a defect's own status is the honest signal; recovery-cycle exists
-- because defect lifecycle already runs independently of run verdicts).
--
-- In-flight run representation (AI Tech Lead, D15): a `state` discriminator
-- computed in SQL, run-level 'running' outranking any position verdict, so
-- the UI and a future BK-50 export can never derive it differently and
-- drift apart.
--
-- Test-layer resolution (gap found while implementing the Tech Lead's own
-- sketch, filled under the same technical authority the ticket delegates
-- "exact SQL/RPC shape" to): the sketch on the ticket never joins
-- test_steps/tests, reasoning those tables carry no project/workspace
-- column. That is correct for SCOPING, but the RPC still needs to answer
-- "does a Test chain this ATC at all", independent of whether it was ever
-- run — otherwise "No test written yet" and "No run recorded yet" (two
-- DIFFERENT ratified copy states, PO decision on the AC-02 placeholder)
-- collapse into the same "no row" signal. `chain_test` below closes this:
-- it reaches test_steps/tests ONLY by atc_id, and the atc_id set is already
-- project-scoped via `pair` before this CTE ever runs — Test data enters
-- purely as context hanging off an already-scoped ATC, the same posture
-- the Tech Lead specifies for Run data.
--
-- Concurrency (EC12): the ENTIRE chain is assembled in ONE
-- `select ... into v_result` statement. Under READ COMMITTED this takes one
-- snapshot, so a concurrent Jira import can only produce a slightly-stale
-- read, never a torn one. Binding implementation constraint (AI Tech Lead):
-- the step-1 scope-resolution SELECT below reads ONLY user_stories/modules/
-- projects for authorization — no chain data. If a future change splits the
-- final select into two statements, tearing becomes possible again; Stage 3
-- review must check this explicitly (the failure is silent).

create or replace function public.bunkai_report_story_traceability(
  p_actor_user_id  uuid,
  p_user_story_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id   uuid;
  v_workspace_id uuid;
  v_result       jsonb;
begin
  -- 0. Actor bind, step 0, before any table read. Same non-disclosing error
  --    as not-found — byte-identical shape to 0048/0049/0052. Inert on the
  --    admin-client call path (auth.uid() NULL); the real protection is the
  --    per-CTE scoping below, never this bind alone.
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve scope through module_id (NEVER the nullable
  --    user_stories.project_id — fact 1), then re-check READ membership.
  --    Both failures raise the identical P0002 (non-disclosure).
  select m.project_id, p.workspace_id into v_project_id, v_workspace_id
    from public.user_stories us
    join public.modules  m on m.id = us.module_id
    join public.projects p on p.id = m.project_id
   where us.id = p_user_story_id;
  if v_workspace_id is null then
    raise exception 'user_story_not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, v_workspace_id);

  -- 2. ONE statement, ONE snapshot (EC12 — see header). Every CTE below is
  --    itself scoped to v_project_id / p_user_story_id; none of them is a
  --    workspace-wide read narrowed only by RLS.
  with archived_anc as (
    -- Archived-ancestor closer (AI Tech Lead D11): modules.path is a
    -- '/'-joined depth<=6 string with a per-project unique constraint, so a
    -- single not-exists against this tiny set catches an ATC stranded under
    -- an already-archived intermediate module that bunkai_archive_module_subtree's
    -- recursive arm failed to walk past.
    select path from public.modules
     where project_id = v_project_id and archived_at is not null
  ),
  live_atc as (
    -- Ghost-free, project-scoped ATC set. This project_id predicate is the
    -- actual project-scope enforcement for the whole report (RLS does not
    -- reach atc_acceptance_criteria at all — see `pair` below).
    select a.id, a.slug, a.title, a.layer
      from public.atcs a
      join public.modules m on m.id = a.module_id
     where a.project_id = v_project_id
       and a.archived_at is null
       and m.archived_at is null
       and not exists (
         select 1 from archived_anc anc
          where m.path like anc.path || '/%'
       )
  ),
  crit as (
    -- This story's own, non-archived acceptance criteria (AC-06). Ordered
    -- by position for a stable card order.
    select ac.id, ac.title, ac.position
      from public.acceptance_criteria ac
     where ac.user_story_id = p_user_story_id
       and ac.archived_at is null
  ),
  pair as (
    -- AC x ATC. Repetition across ACs is INTENTIONAL (PO ruling — an ATC
    -- bound to 2 ACs on this story appears under EACH). THIS is the load-
    -- bearing scope guard: atc_acceptance_criteria carries no project_id/
    -- workspace_id column and no DB constraint tying the ATC and the AC to
    -- the same project, so joining against the already-scoped `live_atc`
    -- (not the raw atcs table) is the ONLY thing preventing a cross-project
    -- ATC — mis-linked by hand or by the still-granted legacy
    -- bunkai_save_atc RPC — from entering this story's chain.
    select c.id as ac_id, la.id as atc_id, la.slug, la.title, la.layer
      from crit c
      join public.atc_acceptance_criteria j on j.acceptance_criterion_id = c.id
      join live_atc la on la.id = j.atc_id
  ),
  latest_run as (
    -- Exactly one row per ATC: the most recently STARTED run touching it
    -- (PO ruling — an in-flight run IS the latest run), tiebreak `id desc`
    -- for a total, stable order across reloads (AI Tech Lead D10). Scoped
    -- to this project's runs only. Carries runs' own denormalized
    -- test_id/test_title (0031) so the Test column for a run ATC never
    -- needs a separate tests join — see `chain_test` below for the
    -- never-run case.
    select distinct on (ra.atc_id)
           ra.atc_id,
           r.id as run_id,
           r.status as run_status,
           ra.status as atc_status,
           r.started_at,
           r.finished_at,
           r.test_id as run_test_id,
           r.test_title as run_test_title,
           case
             when r.status  = 'running' then 'in_flight'
             when r.status  = 'aborted' then 'aborted'
             when ra.status = 'pending' then 'in_flight'
             else ra.status
           end as state
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
     where ra.atc_id in (select atc_id from pair)
       and r.project_id = v_project_id
     order by ra.atc_id, r.started_at desc, r.id desc
  ),
  chain_test as (
    -- Which Test chains this ATC (test_steps.atc_id), INDEPENDENT of
    -- whether it has ever been run. Needed to distinguish the PO's ratified
    -- copy: "No test written yet" (no Test at all) vs. "No run recorded
    -- yet" (a Test exists, never executed) — `latest_run` alone cannot tell
    -- these apart, since both read as "no row". tests/test_steps carry no
    -- project_id of their own; safe here because the entry point (atc_id)
    -- is already project-scoped via `pair` — Test data enters only as
    -- context hanging off an already-scoped ATC, the same reasoning the AI
    -- Tech Lead gives for reaching Run data via run_atcs.atc_id rather than
    -- joining tests directly. `distinct on` picks one Test deterministically
    -- if an ATC ever chains into more than one (no PO ruling covers that
    -- shape; must not be non-deterministic regardless).
    select distinct on (ts.atc_id) ts.atc_id, ts.test_id, t.title as test_title
      from public.test_steps ts
      join public.tests t on t.id = ts.test_id
     where ts.atc_id in (select atc_id from pair)
     order by ts.atc_id, ts.test_id
  ),
  chain_bug as (
    -- Defect-scoping join (AI Tech Lead decision): bugs.atc_id against this
    -- story's live ATC set, plus bugs.project_id. NOT bugs.run_id (a Test
    -- may chain ATCs from several stories — EC9 leak) and NOT restricted to
    -- the latest run (a defect's own status is the honest signal, per the
    -- ticket's "latest-run scoping, decided" note). run_step_id travels for
    -- display precision only, never as a scoping key (it is nullable even
    -- on run-linked defects).
    select b.id, b.title, b.severity, b.status, b.created_at,
           b.run_id, b.run_step_id, b.atc_id
      from public.bugs b
     where b.project_id = v_project_id
       and b.atc_id in (select atc_id from pair)
  )
  select jsonb_build_object(
    'story', (
      select jsonb_build_object(
        'id', us.id, 'title', us.title,
        'status', us.status, 'archived_at', us.archived_at
      )
        from public.user_stories us
       where us.id = p_user_story_id
    ),
    'criteria', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'atcs', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', pr.atc_id,
                'slug', pr.slug,
                'title', pr.title,
                'layer', pr.layer,
                -- Test column: prefer the run's own denormalized test
                -- (matches what actually executed), fall back to
                -- chain_test for an ATC that has a Test but no run yet.
                -- Absent entirely => "No test written yet" (UI layer).
                'test', coalesce(
                  (select jsonb_build_object('id', lr.run_test_id, 'title', lr.run_test_title)
                     from latest_run lr
                    where lr.atc_id = pr.atc_id and lr.run_test_id is not null),
                  (select jsonb_build_object('id', ct.test_id, 'title', ct.test_title)
                     from chain_test ct
                    where ct.atc_id = pr.atc_id)
                ),
                'latest_run', (
                  select jsonb_build_object(
                    'run_id', lr.run_id,
                    'run_status', lr.run_status,
                    'atc_status', lr.atc_status,
                    'started_at', lr.started_at,
                    'finished_at', lr.finished_at,
                    'state', lr.state
                  )
                    from latest_run lr
                   where lr.atc_id = pr.atc_id
                ),
                'defects', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', cb.id, 'title', cb.title, 'severity', cb.severity,
                      'status', cb.status, 'created_at', cb.created_at,
                      'run_id', cb.run_id, 'run_step_id', cb.run_step_id
                    )
                    order by cb.created_at desc
                  )
                    from chain_bug cb
                   where cb.atc_id = pr.atc_id
                ), '[]'::jsonb)
              )
              order by pr.slug
            )
              from pair pr
             where pr.ac_id = c.id
          ), '[]'::jsonb)
        )
        order by c.position
      )
        from crit c
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.bunkai_report_story_traceability(uuid, uuid) from public, anon;
grant  execute on function public.bunkai_report_story_traceability(uuid, uuid) to authenticated, service_role;

-- bugs has no index on atc_id; the chain_bug CTE above seeks it per ATC.
-- Partial (atc_id is not null) so it indexes only run/ATC-linked defects and
-- stays small, matching run_atcs_atc_id_idx's own partial-index precedent
-- (0050).
create index if not exists bugs_atc_id_idx
  on public.bugs (atc_id)
  where atc_id is not null;
