-- Migration: 0067 — BK-211 Slice 2: carry the terminal call's session kind
-- (`via`) through `bunkai_finish_run` / `bunkai_abort_run` into `activity_log`.
--
-- REWRITE of two LIVE SECURITY DEFINER functions (`create or replace` on
-- `bunkai_finish_run`, 0037_run_finish.sql, and `bunkai_abort_run`,
-- 0036_run_abort.sql). NOT additive — this is exactly the class of change
-- `.agents/project.yaml` -> `autonomous_delivery.migrations: autonomous`
-- excludes ("ADDITIVE changes only proceed unattended; drop / rename /
-- rewrite of a live object still stops for approval"). This file is written
-- and committed by this run; it is NOT applied. See the migration-gate note
-- in this run's report for why applying 0066 without 0067 (or vice versa)
-- would leave the system in an incoherent state.
--
-- Decision trail (BK-211 comments — implemented here, not re-decided):
--   12196 (AI Product Owner, 2026-08-06) ruled that self-suppression must
--   read the terminal call's SESSION KIND, not actor identity alone (see
--   0066's header for the full rationale — ADR-0001 Path B, agent-with-
--   starter's-own-PAT case).
--   12198 (AI Tech Lead, 2026-08-06) scored how to plumb that signal into
--   the trigger 0066 introduces. Candidate A (26/30) wins: an optional
--   `p_via text default null` parameter on both RPCs, defaulted so every
--   existing caller (including a PAT client calling the RPC directly,
--   bypassing the HTTP route entirely) keeps working unchanged and lands on
--   NULL. A NULL `via` reads as non-interactive in 0066's trigger
--   (`(new.payload ->> 'via') = 'cookie'` is false for both NULL and
--   'bearer') and therefore NOTIFIES — the safe default per 12198: a missed
--   terminal notification is silent, a surplus one is visible.
--
-- `p_via` is a CHANNEL DESCRIPTOR, not an identity or scope parameter — it
-- says HOW the caller connected (`'cookie' | 'bearer'`, the same domain
-- `lib/api/principal.ts` already declares and `app/api/v1/runs/route.ts`
-- already threads into `executor_mode` at run-CREATE time), never WHO they
-- are. ADR-0012's actor-bind invariant governs `p_actor_user_id` on these
-- two RPCs, which is UNCHANGED by this migration and keeps its existing
-- gate (`bunkai_assert_actor_can_write_workspace`, step 2 in both bodies,
-- unmoved). Every other line of both function bodies is byte-identical to
-- the live definition verified against project fmbpikzpkafptqximhxn at
-- Stage 2 start of this run — only the parameter list and the
-- `activity_log` payload's `jsonb_build_object(...)` call change.
--
-- No SQLSTATE change: `p_via` is validated by nothing (any text value or
-- NULL is accepted and stored verbatim as `via`; 0066's trigger only ever
-- compares it against the literal 'cookie'). An unrecognised value (neither
-- 'cookie' nor 'bearer') behaves identically to NULL from the trigger's
-- point of view: non-interactive, so it notifies — never a new failure mode.

-- ============================================================================
-- 1. bunkai_finish_run — adds p_via text default null
-- ============================================================================
--
-- Postgres treats a changed parameter LIST as a different function signature
-- even when the new parameter is defaulted — `create or replace function`
-- only replaces a function whose signature is byte-identical; a widened
-- signature creates a SECOND, coexisting overload instead of replacing the
-- first. Left alone, the old 3-arg `bunkai_finish_run(uuid, uuid, text)`
-- would keep resolving for any caller passing exactly 3 named arguments —
-- PostgREST's `.rpc()` calls with named parameters, so a 3-arg call is an
-- EXACT match and would keep landing on the never-notifying old body,
-- silently defeating this entire migration. The explicit drop below is
-- therefore load-bearing, not cleanup.

drop function if exists public.bunkai_finish_run(uuid, uuid, text);

create or replace function public.bunkai_finish_run(
  p_actor_user_id uuid,
  p_run_id        uuid,
  p_verdict       text,
  p_via           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status       text;
  v_verdict      text := btrim(coalesce(p_verdict, ''));
  v_skipped      int;
begin
  -- 1. Resolve + lock the Run header.
  select workspace_id, status
    into v_workspace_id, v_status
    from public.runs
    where id = p_run_id
    for update;
  if v_workspace_id is null then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: member+ write access. 42501, no disclosure. Human/agent/ci same gate.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 3. Only a running Run can be finished (first terminal action wins).
  if v_status <> 'running' then
    raise exception 'run_not_finishable' using errcode = '45206';
  end if;

  -- 4. Verdict backstop (Zod is the primary guard at the HTTP edge).
  if v_verdict not in ('passed', 'failed') then
    raise exception 'finish_verdict_invalid' using errcode = '45207';
  end if;

  -- 5a. Close the Run with the final verdict (abort_reason stays NULL).
  update public.runs
    set status      = v_verdict,
        finished_at = now(),
        version     = version + 1
    where id = p_run_id;

  -- 5b. Skip every not-yet-executed step; preserve recorded results.
  update public.run_steps rs
    set status = 'skipped'
    from public.run_atcs ra
    where ra.id = rs.run_atc_id
      and ra.run_id = p_run_id
      and rs.status = 'pending';
  get diagnostics v_skipped = row_count;

  -- 5c. Skip still-pending chain positions so the chain reads coherently.
  update public.run_atcs
    set status = 'skipped'
    where run_id = p_run_id
      and status = 'pending';

  -- 6. Audit (DEFINER-only writer). `via` (BK-211/12198) is the terminal
  --    call's session kind, a channel descriptor for the run-event
  --    notification trigger (0066) — not an identity or scope parameter.
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', p_run_id, 'run.finished',
    jsonb_build_object('verdict', v_verdict, 'skipped_steps', v_skipped, 'via', p_via)
  );

  return public.bunkai_run_json(p_run_id);
end;
$$;

revoke execute on function public.bunkai_finish_run(uuid, uuid, text, text) from public, anon;
grant execute on function public.bunkai_finish_run(uuid, uuid, text, text) to authenticated, service_role;

-- ============================================================================
-- 2. bunkai_abort_run — adds p_via text default null
-- ============================================================================
-- Same signature-widening hazard as bunkai_finish_run above — the drop is
-- load-bearing, not cleanup (see that section's comment for the full
-- reasoning).

drop function if exists public.bunkai_abort_run(uuid, uuid, text);

create or replace function public.bunkai_abort_run(
  p_actor_user_id uuid,
  p_run_id        uuid,
  p_reason        text,
  p_via           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status       text;
  v_reason       text := btrim(coalesce(p_reason, ''));
  v_skipped      int;
begin
  -- 1. Resolve + lock the Run header.
  select workspace_id, status
    into v_workspace_id, v_status
    from public.runs
    where id = p_run_id
    for update;
  if v_workspace_id is null then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;

  -- 2. AuthZ: member+ write access. 42501, no disclosure.
  perform public.bunkai_assert_actor_can_write_workspace(p_actor_user_id, v_workspace_id);

  -- 3. Only a running Run can be aborted.
  if v_status <> 'running' then
    raise exception 'run_not_abortable' using errcode = '45204';
  end if;

  -- 4. Reason backstop (Zod is the primary guard at the HTTP edge).
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'abort_reason_too_short' using errcode = '45205';
  end if;

  -- 5a. Close the Run.
  update public.runs
    set status      = 'aborted',
        abort_reason = v_reason,
        finished_at = now(),
        version     = version + 1
    where id = p_run_id;

  -- 5b. Skip every not-yet-executed step; preserve recorded results.
  update public.run_steps rs
    set status = 'skipped'
    from public.run_atcs ra
    where ra.id = rs.run_atc_id
      and ra.run_id = p_run_id
      and rs.status = 'pending';
  get diagnostics v_skipped = row_count;

  -- 5c. Skip still-pending chain positions so the chain reads coherently.
  update public.run_atcs
    set status = 'skipped'
    where run_id = p_run_id
      and status = 'pending';

  -- 6. Audit (DEFINER-only writer). `via` (BK-211/12198) is the terminal
  --    call's session kind, a channel descriptor for the run-event
  --    notification trigger (0066) — not an identity or scope parameter.
  insert into public.activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, payload)
  values (
    v_workspace_id, p_actor_user_id, 'run', p_run_id, 'run.aborted',
    jsonb_build_object('reason', v_reason, 'skipped_steps', v_skipped, 'via', p_via)
  );

  return public.bunkai_run_json(p_run_id);
end;
$$;

revoke execute on function public.bunkai_abort_run(uuid, uuid, text, text) from public, anon;
grant execute on function public.bunkai_abort_run(uuid, uuid, text, text) to authenticated, service_role;
