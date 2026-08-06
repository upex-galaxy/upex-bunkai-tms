-- Migration: 0066 — BK-211 Slice 1: Notifications | run.finished / run.aborted
-- producer (DB layer only). ADDITIVE ONLY — no DROP, no REPLACE of any
-- pre-existing object other than a fresh `create or replace function` for a
-- function this migration itself introduces.
--
-- Wires the two upstream producers that already exist — BK-39's
-- `bunkai_finish_run` (0037_run_finish.sql) and BK-36's `bunkai_abort_run`
-- (0036_run_abort.sql), which write `run.finished` / `run.aborted` rows to
-- `activity_log` — into BK-209's `notifications` inbox (0053). An
-- `AFTER INSERT ON activity_log` trigger is the natural fit, mirroring
-- BK-212's shipped `bunkai_notify_bug_event` (0056_bug_event_notifications.sql)
-- exactly: both producer RPCs already write their audit row inside the SAME
-- transaction as the mutation, so a trigger on that write gets the
-- notification "for free" inside that transaction, without either RPC
-- needing to know BK-211 exists.
--
-- NOTE ON NUMBERING: verified against the LIVE project's migration ledger
-- (mcp__supabase__list_migrations, project fmbpikzpkafptqximhxn) at Stage 2
-- start of this run — the highest applied migration is
-- 0065_atc_tags_cap_guard (0058_atc_title_min_length was applied later by
-- timestamp but is numbered lower), so 0066 is the next free number.
--
-- Decision trail (BK-211 comments, all read in full before writing this
-- file — not re-decided here, only implemented):
--   12169 (AI Product Owner, 2026-08-05) — recipient scope (N4, 2026-07-11
--     ratification): the run starter only. No watcher/participant audience.
--   12173 (AI Tech Lead, 2026-08-05) — recipient column (`runs.executor_user_id`,
--     no schema change to `public.runs`), trigger-vs-RPC shape (AFTER INSERT
--     trigger on activity_log, mirroring 0056), the exact payload shape
--     ({title, project_slug, verdict} / {title, project_slug, reason}), the
--     migration shape, and the ADR-0012 six-question checklist. EVERYTHING in
--     12173 stands EXCEPT its suppression predicate.
--   12196 (AI Product Owner, 2026-08-06) — SUPERSEDES 12173's suppression
--     predicate. Identity-only suppression (`actor is not distinct from
--     starter`) silently fails AC Scenario 1/4 whenever an agent finishes the
--     run using the starter's OWN PAT (ADR-0001 Path B: a PAT impersonates
--     its owning user, so the impersonated actor IS the starter). Ratified
--     rule: suppress ONLY when the actor is the starter AND the terminal call
--     arrived through an interactive cookie session. Any bearer/PAT-borne
--     terminal event notifies, even when it authenticates as the starter.
--   12198 (AI Tech Lead, 2026-08-06) — the mechanical cost of paying 12196:
--     the session kind is not available inside this trigger unless the two
--     terminal RPCs are widened to carry it. Candidate A (26/30, this run's
--     migration 0067) — an optional `p_via text default null` on
--     `bunkai_finish_run` / `bunkai_abort_run`, projected into the
--     `activity_log` payload as `via` — is the ratified way to pay it. THIS
--     migration (0066) is written against that contract: it reads
--     `new.payload ->> 'via'`, a key that migration 0067 (not yet applied —
--     see the migration-gate note in this run's report) is what actually
--     populates. Until 0067 is applied, every `activity_log` row this trigger
--     sees carries no `via` key, `new.payload ->> 'via'` reads NULL, `NULL =
--     'cookie'` is NULL (never true), so the suppression branch below never
--     fires and every terminal event notifies — including self-finishes. That
--     is the exact "incoherent intermediate state" 0067's own header warns
--     about, and it is why this run applies NEITHER migration.
--
-- Authorization model (ADR-0012 / rpc-authorization.md): this trigger
-- function is `SECURITY DEFINER` by necessity — its whole purpose is to
-- write a `notifications` row on behalf of the RECIPIENT (the run starter),
-- who by the suppression rule is never `auth.uid()` in the notifying case,
-- and `notifications` deliberately carries no INSERT policy for
-- authenticated clients at all (0053's own comment, restated verbatim by
-- 0056: "Rows arrive only via a future producer SECURITY DEFINER function").
-- A trigger function takes NO caller-supplied parameter of any kind — there
-- is nothing to actor-bind (ADR-0012 question 3 is vacuous here) because
-- there is no parameter to spoof in the first place. `SECURITY DEFINER` is
-- declared explicitly rather than relying on this trigger incidentally
-- running inside its DEFINER callers' elevated role (mirrors 0056).
--
-- What this trigger DOES trust, and why each source is already authorized:
--   - `new.workspace_id` / `new.actor_user_id` / `new.entity_id` / `new.action`
--     / `new.payload` — the activity_log row this trigger fires ON. Both
--     `bunkai_finish_run` and `bunkai_abort_run` bind `workspace_id` to the
--     run's OWN row (never a caller-supplied value) and `actor_user_id` to
--     `p_actor_user_id` directly before writing it — this trigger consumes
--     an already-trustworthy row, it does not re-derive trust.
--   - `public.runs.executor_user_id` / `.test_title` / `.project_id` and
--     `public.projects.slug`, looked up by `new.entity_id` (the run this
--     activity row is ABOUT) — read-only lookups scoped to that same run,
--     never a caller-supplied id.
-- Nothing here is a caller-supplied identity or scope parameter, so there is
-- no actor-bind guard to write — the six-question checklist's actionable
-- items are (4) result scoping (every row this trigger inserts is scoped to
-- `new.workspace_id` and a recipient computed only from `public.runs`,
-- never an external input) and (6) the DB-integration test
-- (`lib/notifications/run-event-trigger-isolation.test.ts`, this slice).
--
-- Idempotency: reuses BK-212's `notifications.source_event_id` +
-- `notifications_source_event_recipient_key` unique constraint (0056) —
-- NO schema change needed here. Every insert below goes through
-- `on conflict (source_event_id, recipient_user_id) do nothing`.
--
-- Payload: a per-action POSITIVE projection (never a blanket copy of
-- `new.payload`), mirroring 0055's "Decision 3 / Risk R3" convention and
-- 0056's identical choice. `title` (runs.test_title, the start-time
-- snapshot — 0040_run_module_snapshot.sql) and `project_slug`
-- (projects.slug) are added; neither exists in the activity_log payload
-- today. `project_slug` is mandatory: `resolveNotificationHref`
-- (lib/notifications/entity-routes.ts) needs it for the deep link, and
-- 0053's own design constraint is that "the inbox never has to join live
-- runs/tests/bugs to render a summary" — this trigger does that one join so
-- the read path never has to. No `run_id` key: for `entity_type = 'run'`,
-- `entity_id` IS the run id already (see 12173's rationale, quoted in this
-- story's comment trail).
--
-- Custom SQLSTATE: none allocated — this trigger never raises. A run row
-- that cannot be resolved (should not happen; this fires inside the SAME
-- transaction as the RPC that just wrote the referencing activity_log row)
-- is treated as "nothing to snapshot yet" and silently skipped. A null
-- recipient (`executor_user_id` is `on delete set null`) is also a silent
-- early return, never a null insert (notifications.recipient_user_id is
-- NOT NULL — a null insert would raise 23502 and roll back the finish/abort
-- that fired this trigger). Both are on purpose, mirroring 0056's own
-- header: "a defect in this producer can never raise out of an AFTER INSERT
-- trigger and roll back the [run closure] that fired it."

-- ============================================================================
-- 1. bunkai_notify_run_event — AFTER INSERT trigger on activity_log
-- ============================================================================

create or replace function public.bunkai_notify_run_event()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_test_title   text;
  v_project_slug text;
  v_recipient    uuid;
  v_payload      jsonb;
begin
  -- Snapshot the run's start-time test title, its project's slug, and its
  -- starter, scoped to THIS run (new.entity_id) only. `executor_user_id` is
  -- the starter: bunkai_create_run stamps it with p_actor_user_id at start
  -- (0031_runs.sql) and no path ever rewrites it afterward.
  -- `executor_mode` is deliberately NOT selected — it is never a branch in
  -- this rule (12196: suppression reads the SESSION KIND of the terminal
  -- call, via `new.payload ->> 'via'`, never the run's declared executor).
  select r.test_title, p.slug, r.executor_user_id
    into v_test_title, v_project_slug, v_recipient
    from public.runs r
    join public.projects p on p.id = r.project_id
    where r.id = new.entity_id;

  -- Nothing to snapshot: never raise out of an AFTER INSERT trigger, or the
  -- finish/abort that fired it rolls back (0056 header, verbatim reasoning).
  if v_test_title is null then
    return new;
  end if;

  -- Null recipient (starter's account deleted -> executor_user_id ON DELETE
  -- SET NULL): no notification, silently — notifications.recipient_user_id
  -- is NOT NULL, so there is nothing coherent to insert.
  if v_recipient is null then
    return new;
  end if;

  -- Suppression (12196, superseding 12173's identity-only predicate):
  -- self-suppress ONLY when the actor is the starter AND the terminal call
  -- arrived through an interactive cookie session. A bearer/PAT-borne call
  -- notifies even when it authenticates as the starter (ADR-0001 Path B —
  -- the impersonated actor IS the starter, so identity alone is not enough
  -- to distinguish "Elena finished her own run" from "an agent finished it
  -- using Elena's PAT"). `is not distinct from` (not `<>`) is 0056's own
  -- operator: `activity_log.actor_user_id` is nullable, and `<>` against a
  -- null yields null (never false), which would silently suppress every
  -- notification for an unattributed event.
  if v_recipient is not distinct from new.actor_user_id
     and (new.payload ->> 'via') = 'cookie'
  then
    return new;
  end if;

  if new.action = 'run.finished' then
    v_payload := jsonb_build_object(
      'title', v_test_title,
      'project_slug', v_project_slug,
      'verdict', new.payload -> 'verdict'
    );
  else -- 'run.aborted'
    v_payload := jsonb_build_object(
      'title', v_test_title,
      'project_slug', v_project_slug,
      'reason', new.payload -> 'reason'
    );
  end if;

  insert into public.notifications (
    workspace_id, recipient_user_id, event_type, entity_type, entity_id, payload, source_event_id
  )
  values (
    new.workspace_id, v_recipient, new.action, 'run', new.entity_id, v_payload, new.id
  )
  on conflict (source_event_id, recipient_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists activity_log_notify_run_event on public.activity_log;
create trigger activity_log_notify_run_event
  after insert on public.activity_log
  for each row
  when (
    new.entity_type = 'run'
    and new.action in ('run.finished', 'run.aborted')
  )
  execute function public.bunkai_notify_run_event();
