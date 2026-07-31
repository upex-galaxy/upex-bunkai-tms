-- Migration: 0045 — TMS Activity Stream read RPCs (BK-49 Slice 1: DB)
-- Authored: 2026-07-31
--
-- NOTE ON NUMBERING: 0042/0043 are already taken by BK-35 ("mark run step" +
-- Realtime replication) — pushed to origin/feat/BK-35-mark-run-step but not
-- yet merged into origin/staging at authoring time. 0044 (BK-90,
-- leave-workspace) is already merged into origin/staging and present in this
-- branch's history. 0045 is confirmed next-free against the local migrations
-- directory, every local and remote branch's migrations tree (`git log --all
-- -- supabase/migrations/`), and origin/staging's own ledger.
--
-- Read-only feed over the existing `activity_log` table (0009_cross_cutting.sql)
-- for a new standalone `/activity` route (BK-49). No new event writers, no
-- schema change to activity_log itself — additive index + two RPCs only.
--
-- Adds:
--   * activity_log_workspace_created_at_id_idx — keyset-seek index (the
--     existing activity_log_workspace_id_created_at_idx from 0009 lacks the
--     `id` tie-break the seek predicate needs).
--   * bunkai_list_activity            — SECURITY INVOKER (ADR-0001 Path B):
--     runs under the caller's own RLS via principal.db, never an admin
--     client. activity_log_select_workspace_member (0009) does the
--     cross-workspace isolation work transparently — a non-member's call
--     simply RLS-filters to zero rows. No explicit-actor param, no in-band
--     membership assert: unlike the SECURITY DEFINER RPCs elsewhere in this
--     repo (BK-37/38), this one carries no privilege to check in the first
--     place.
--   * bunkai_resolve_activity_actors  — SECURITY DEFINER (ADR-0011): the
--     opposite posture, deliberately. Resolving auth.users.email for OTHER
--     workspace members requires escalation (the auth schema isn't exposed
--     to PostgREST) — narrowly scoped by an in-band bunkai_is_workspace_member
--     assert against the CALLER (auth.uid()), not the target ids.
--
--     Implementation note: the implementation plan's Database design section
--     tags this function `language sql`. Pure SQL-language functions in
--     Postgres cannot execute a `raise exception` statement at all (RAISE is
--     PL/pgSQL-only), and a per-row WHERE-clause guard would only fire when
--     at least one row of `auth.users` matches `p_user_ids` — silently
--     skipping the assert (and returning an empty set instead of raising)
--     whenever every requested id happens to not match. ADR-0011's whole
--     point is a LOUD, unconditional failure, not a silent empty set. This
--     function is therefore `language plpgsql` so the membership check runs
--     as a guard clause before the query, every time, independent of
--     p_user_ids' contents. The security posture itself (SECURITY DEFINER,
--     grant to authenticated, single-column auth.users read, in-band
--     co-membership assert) matches the plan and ADR-0011 exactly — only the
--     procedural-language mechanics changed.
--
-- Custom SQLSTATE (class 45xxx; highest allocated so far is 45213,
-- 0044_leave_workspace.sql's sole_owner — this migration opens a new slot for
-- the activity domain rather than reusing the 452xx "run domain" block):
--   45214  activity_cursor_invalid  (exactly one cursor half supplied)

-- ============================================================================
-- 1. activity_log_workspace_created_at_id_idx — the keyset access path
-- ============================================================================
--
-- 0009's activity_log_workspace_id_created_at_idx covers the equality +
-- ordering but carries no `id` tie-break column, which the (created_at, id) <
-- (cursor) seek predicate needs to stay index-only. Additive: the existing
-- index stays, both are cheap on an append-only, moderate-cardinality table.

create index if not exists activity_log_workspace_created_at_id_idx
  on public.activity_log (workspace_id, created_at desc, id desc);

-- ============================================================================
-- 2. bunkai_list_activity — keyset-paged, allowlist-filtered activity feed
-- ============================================================================
--
-- SECURITY INVOKER (the clause is simply omitted — plpgsql defaults to
-- INVOKER). This is the load-bearing security property of this function: it
-- runs the SELECT under the CALLING role, so RLS's
-- activity_log_select_workspace_member (0009) evaluates against the caller's
-- own auth.uid() on every call path (cookie SSR session or PAT-minted user
-- JWT via ADR-0001 Path B's principal.db) and silently returns zero rows for
-- a non-member. Using SECURITY DEFINER here (or calling this RPC from an
-- admin/service-role client in the route) would bypass that RLS check
-- entirely and reopen the exact cross-workspace leak the Stage 1 review
-- flagged and closed by construction — see ADR-0001, Risk R2 in the
-- implementation plan, and the API route's own comment (Slice 2) pointing
-- back here.
--
-- Validation order (mirrors 0038/0039's shape, minus the actor-bind guard —
-- there is no explicit actor parameter here to spoof):
--   1. Clamp p_limit into 1..50, default 30 (Decision 1, implementation-plan.md).
--   2. p_actions NULL -> default to the MVP allowlist (direct-caller backstop;
--      the API route always passes it explicitly — Decision 2).
--   3. Cursor backstop: both halves NULL = first page; exactly one supplied is
--      rejected (45214), never silently degraded to page 1 (mirrors 0039's
--      run_cursor_invalid).
--   4. One keyset page (limit+1 probe) on workspace_id = p_workspace_id AND
--      action = any(p_actions) AND (created_at, id) < (cursor), newest first.
--   5. Per-row projection via a `case (action)` that returns ONLY the
--      allowlisted payload keys per action (positive projection — never
--      `select payload` raw). run.aborted's free-text `reason` is never
--      selected anywhere in this function (Decision 3, Risk R3).
--   6. next_cursor: same probe-based shape as 0038/0039.

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
      'atc.created', 'test.created', 'run.finished', 'run.aborted'
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
                       'modules', k.payload -> 'modules',
                       'user_stories', k.payload -> 'user_stories',
                       'acceptance_criteria', k.payload -> 'acceptance_criteria',
                       'atcs', k.payload -> 'atcs'
                     )
                   when 'atc.created' then
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

-- ============================================================================
-- 3. bunkai_resolve_activity_actors — batch actor email resolution (ADR-0011)
-- ============================================================================
--
-- SECURITY DEFINER (the opposite posture from bunkai_list_activity above, and
-- deliberately so — see ADR-0011). auth.users is not exposed to PostgREST on
-- this project, so resolving OTHER members' emails requires escalation; the
-- escalation is narrowed to "asserts the CALLER's own co-membership first"
-- (auth.uid(), non-spoofable, no explicit actor param — same pattern as
-- 0023_module_activity_log.sql's module-mutation RPCs), then returns ONLY
-- `email` for the requested ids. A failed membership check RAISES (loud),
-- never silently returns an empty set — that would look like "nobody has
-- these ids" instead of "you may not ask". See the migration header for why
-- this is `language plpgsql` rather than the plan's literal `sql` tag.

create or replace function public.bunkai_resolve_activity_actors(
  p_workspace_id uuid,
  p_user_ids     uuid[]
)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Unconditional guard (runs before the query, every call, regardless of
  -- p_user_ids' contents) — not a per-row filter.
  if not public.bunkai_is_workspace_member(p_workspace_id) then
    raise exception 'not_workspace_member' using errcode = '42501';
  end if;

  -- No per-id co-membership filter needed: every actor_user_id on an
  -- activity_log row was already an active member of p_workspace_id at write
  -- time (ADR-0011). Only `email` is selected — no other auth.users column.
  return query
    select u.id, u.email
      from auth.users u
      where u.id = any(p_user_ids);
end;
$$;

revoke all on function public.bunkai_resolve_activity_actors(uuid, uuid[]) from public, anon;
grant execute on function public.bunkai_resolve_activity_actors(uuid, uuid[]) to authenticated, service_role;
