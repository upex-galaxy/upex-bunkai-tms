-- Migration: 0070 — BK-337: TMS-Defect Detail | Open a defect and read its
-- full record
-- Authored: 2026-08-14
--
-- Widens `bunkai_bug_json` (0046_bugs.sql, `assignee_user_id` added by
-- 0054_bug_assignment_status.sql) with the two pieces of nested provenance
-- the single-defect read view needs and the two list composers deliberately
-- do NOT carry (Tech Lead ruling, TQ2 — extending the shared composer, not
-- forking a second one, so create/assign/status-transition responses and the
-- detail read can never drift apart on one entity):
--
--   * `origin` — a nested object built from the bug's own frozen provenance
--     ids (`run_id`, `run_step_id`, `atc_id`), carrying the run's identity,
--     the failed step's 0-based `run_steps.position` (so the page can render
--     "Failed at step {position + 1} of {ATC title}" without a second round
--     trip), and the ATC's title/layer. NULL end to end for a standalone
--     defect (all three provenance ids are null) — the page reads that as
--     "Filed manually" per the Product Owner's Q3/2.1 ruling, never as an
--     error.
--   * `module.archived_at` — so the page can render an "Archived" tag on a
--     defect filed against a since-archived module (Product Owner Q3,
--     decision C: render it, tag it, never 404 it) WITHOUT copying
--     `bunkai_list_bugs`'s `archived_at is null` exclusion (0051_bugs_list.sql
--     Decision 12) — that filter belongs to the list surfaces only; a
--     single-defect read must stay reachable regardless of the module's
--     current archived state (Tech Lead's explicit instruction against
--     copying that RPC's predicate here).
--
-- No schema change: `create or replace function` only, exactly as 0054 did
-- when it added `assignee_user_id`. Still `language sql stable`, still NO
-- `security definer` (unchanged from 0046/0054) — the function keeps running
-- as SECURITY INVOKER, under the caller's own session and RLS.
--
-- Authorization (rpc-authorization.md §4, answered in full in this Story's
-- implementation-plan.md — restated here because it is exactly the reasoning
-- that makes this migration safe to widen):
--
--   1. Needs SECURITY DEFINER? No — stays INVOKER, unchanged.
--   2. Can the identity parameter be removed? Already has none (`p_bug_id`
--      only).
--   3. Actor bind at step 0? N/A — no actor parameter to spoof; RLS is the
--      enforcement mechanism on every DIRECT call.
--   4. Which returned rows cross a tenant boundary, and what constrains each?
--      Two call shapes exist for this one function:
--        (a) Direct call from `GET /api/v1/bugs/{id}` (new this Story), via
--            the caller's own RLS-scoped client (never the admin client).
--            Every subselect this migration adds — `runs`, `run_steps`,
--            `atcs` for `origin`, `modules` for `archived_at` — is scoped by
--            THAT caller's own RLS on each of those tables
--            (runs_select_workspace_member / run_steps_select_workspace_member
--            / atcs' own workspace-member policy / modules', all pre-existing).
--            A caller who cannot read the linked run/step/ATC gets `null`
--            nested fields, never an error and never another tenant's rows.
--        (b) Indirect calls from the three existing SECURITY DEFINER callers
--            — `bunkai_create_bug`, `bunkai_assign_bug`,
--            `bunkai_transition_bug_status` (0046/0054) — which execute as
--            `postgres`. `postgres` carries `rolbypassrls`
--            (0063_environment_cross_workspace_404.sql:4-13), so RLS does
--            NOT constrain the widened subselects when this function is
--            invoked from inside one of those three. **RLS is therefore NOT
--            what holds the boundary on path (b) — the ticket's own
--            published rationale says RLS here, and that is wrong.** What
--            actually holds it is the EXISTING `bugs_check_consistency`
--            BEFORE INSERT/UPDATE trigger (0046_bugs.sql:162-213, extended by
--            0054), which pins `run_id` to the bug's own `project_id`,
--            `run_step_id` to that `run_id`, and `atc_id` to that same
--            `project_id` on every write, before a row can ever exist with
--            mismatched provenance. Because the trigger already guarantees
--            those three ids can only ever reference the SAME project as the
--            bug row itself, the widened `origin` subselects — keyed off
--            exactly those already-validated ids, on a bug the DEFINER
--            caller was already authorized to touch by ITS OWN checks before
--            calling this composer — can only ever resolve provenance
--            belonging to that same, already-authorized bug. There is no
--            cross-tenant read reachable through path (b); the trigger, not
--            RLS, is the boundary there.
--   5. Does the failure path disclose existence? No new channel. Unchanged:
--      NULL row for "does not exist" AND for "exists, but RLS hides it from
--      this caller" — the route's null-check collapses both into the same
--      `throwBugNotFound()` 404 the sibling /assign and /status routes
--      already raise for their own P0002.
--   6. DB-integration test proving both properties against the real
--      database: `lib/bugs/detail-isolation.test.ts` (new this Story).

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
    'created_by', b.created_by,
    'created_at', b.created_at,
    'updated_at', b.updated_at,
    -- BK-337 — nested provenance for the Origin panel. NULL end to end for a
    -- standalone defect (run_id/run_step_id/atc_id all null on `bugs`) —
    -- every key below is then absent from the object entirely (jsonb_build_
    -- object with a NULL scalar arg still emits the key with a JSON null
    -- value, which the API/UI both already treat as "no origin").
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

-- Grants unchanged (already authenticated + service_role, 0054:218-219) —
-- `create or replace function` preserves existing grants, this is a no-op
-- restated for auditability, not a new grant.
revoke execute on function public.bunkai_bug_json(uuid) from public, anon;
grant execute on function public.bunkai_bug_json(uuid) to authenticated, service_role;
