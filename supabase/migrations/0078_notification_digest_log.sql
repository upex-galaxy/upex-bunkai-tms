-- ============================================================================
-- 0078_notification_digest_log
--
-- BK-214 — Daily email digest of unread notifications. Vercel Cron (08:00
-- UTC, `vercel.json`) hits POST /api/v1/admin/send-digest (ADR-0017 — a
-- third principal class, `CRON_SECRET` bearer, beyond ADR-0001's two), which
-- calls bunkai_notification_digest_candidates() below for the eligible rows,
-- groups and renders them in TypeScript (reusing lib/notifications/view.ts's
-- resolveNotificationTitle and entity-routes.ts's buildEntityHref — the same
-- vocabulary the in-app inbox already renders, never re-derived here), sends
-- via Resend, then writes one row per (user, day) to notification_digest_log.
--
-- SHAPE — scored against supabase/migrations/0075_run_inactivity_sweep.sql's
-- precedent rather than re-deriving it. That sweep runs entirely inside
-- Postgres specifically because it needs no network egress. A real email send
-- fundamentally needs HTTP egress to a third party (Resend); pg_net could
-- reach it, but only by re-implementing this repo's existing notification
-- title/entity-link vocabulary as raw SQL string-building, duplicating logic
-- that already exists and is already tested in TypeScript. So this story uses
-- a CRON_SECRET-gated `POST /api/v1/admin/send-digest` route instead — full
-- reasoning in ADR-0017 and the AI Tech Lead Jira comment on BK-214.
--
-- EVENT VOCABULARY — verified directly against the trigger source, not
-- against the Jira refinement (which listed `bug.commented`, an event that
-- does not exist anywhere in this codebase). The only `event_type` values
-- ever INSERTed into `notifications` are `run.finished`, `run.aborted`
-- (0066_run_event_notifications.sql) and `bug.assigned`, `bug.reassigned`,
-- `bug.status_changed` (0056_bug_event_notifications.sql). `bug.unassigned`
-- is filtered into that trigger by its WHEN clause but its own branch always
-- computes zero recipients, so it never actually produces a row.
--
-- CLAIM-BEFORE-SEND. The route INSERTs a `pending` row for (user_id,
-- digest_date) BEFORE composing or sending (relying on the unique
-- constraint below) — a second overlapping invocation's insert fails on
-- conflict and skips, closing the race that a write-only-after-send design
-- would only detect after two emails were already sent. The row is then
-- UPDATEd to `sent`/`failed` once the send attempt resolves.
--
-- RETENTION. bunkai_notification_digest_candidates() re-derives the
-- notifications table's own 90-day visibility window (RLS policy
-- notifications_select_recipient_member_retained, 0053_notifications.sql).
-- A service-role query bypasses RLS entirely, so every predicate RLS would
-- apply must be re-derived explicitly here or a digest could surface a
-- notification the recipient could no longer even see in their own inbox.
-- ============================================================================


-- ============================================================================
-- 1. notification_digest_log
-- ============================================================================
--
-- One row per (user, UTC digest day). `status = 'pending'` is the claim
-- written before a send is attempted; `sent`/`failed` is the resolved
-- outcome. The next day's `digest_date` is a fresh, unclaimed slot
-- regardless of yesterday's outcome — no in-process retry (see ADR-0017 /
-- the Jira decision comment: a failed send leaves the underlying
-- notifications unread, so tomorrow's cron naturally reconsiders them).

create table if not exists public.notification_digest_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  digest_date         date not null,
  status              text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  notification_count  int  not null default 0 check (notification_count >= 0),
  error               text null,
  sent_at             timestamptz null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, digest_date)
);

create index if not exists notification_digest_log_digest_date_idx
  on public.notification_digest_log (digest_date);

alter table public.notification_digest_log enable row level security;

-- No policy is created for anon/authenticated — RLS with zero policies denies
-- every row to every role except the table owner and service_role (which
-- bypasses RLS entirely, same as every service-role-only table in this repo).
-- This is a server-internal delivery log, never a user-reachable resource.

-- Reuse the existing shared trigger function (0004_atcs.sql), same pattern
-- as notification_preferences (0062_notification_preferences.sql) — this
-- migration adds no new trigger function.
drop trigger if exists notification_digest_log_set_updated_at on public.notification_digest_log;
create trigger notification_digest_log_set_updated_at
  before update on public.notification_digest_log
  for each row
  execute function public.bunkai_set_updated_at();


-- ============================================================================
-- 2. bunkai_notification_digest_candidates — the eligible row set, TODAY.
-- ============================================================================
--
-- AUTHORIZATION (ADR-0012 / rpc-authorization.md six-question checklist).
-- Takes NO caller-supplied identity or scope parameter — same reasoning
-- 0075 §2 records for its own system-actor design: with nothing to spoof,
-- the actor-bind requirement is vacuous by construction. Result scoping is
-- satisfied structurally: every row is reached through the notifications ->
-- workspace_members / auth.users / runs|bugs -> projects join chain below,
-- never from an external input. NOT granted to anon or authenticated (§3) —
-- it returns every eligible recipient's email address and unread content
-- across every tenant, which would be a cross-tenant data leak if reachable
-- over PostgREST by a signed-in user.
--
-- VISIBILITY, replicated manually because service-role bypasses RLS. Project
-- visibility in this schema IS workspace membership — there is no separate
-- per-project ACL (`projects_select_workspace_member`, 0002/0005) — so "the
-- user can still access this" reduces to "an ACTIVE workspace_members row
-- exists for (workspace_id, recipient_user_id)", the same predicate
-- bunkai_is_workspace_member() checks under RLS. RETENTION is the second
-- predicate RLS would apply (see header) and is re-derived explicitly below.
--
-- ENTITY RESOLUTION mirrors entity-routes.ts's own comment: only run/bug ever
-- reach the notification inbox in this vocabulary (test/atc/module/project
-- notifications are never produced). A LEFT JOIN to whichever table matches
-- `entity_type`, then an inner JOIN to `projects` on the coalesced project id,
-- means a row whose entity was deleted (both LEFT JOINs miss) is silently
-- excluded — exactly "items the user can no longer access are excluded at
-- send time" (business-rules.md), with no separate deleted-entity branch
-- needed.
--
-- PREFERENCE FILTER. notification_preferences stores only NEGATIVE state
-- explicitly — the editable-event-type default is enabled=true, and an
-- absent row means "never touched, still on default" (0062's own header).
-- So eligibility is `NOT EXISTS an explicit enabled=false row for this
-- user/category/email`, never a positive existence check.

create or replace function public.bunkai_notification_digest_candidates()
returns table (
  recipient_user_id uuid,
  recipient_email    text,
  workspace_id       uuid,
  project_id         uuid,
  project_name       text,
  project_slug       text,
  notification_id    uuid,
  event_type         text,
  entity_type        text,
  entity_id          uuid,
  payload            jsonb,
  created_at         timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    n.recipient_user_id,
    u.email,
    n.workspace_id,
    p.id,
    p.name,
    p.slug,
    n.id,
    n.event_type,
    n.entity_type,
    n.entity_id,
    n.payload,
    n.created_at
  from public.notifications n
  join public.workspace_members wm
    on wm.workspace_id = n.workspace_id
   and wm.user_id = n.recipient_user_id
   and wm.status = 'active'
  join auth.users u
    on u.id = n.recipient_user_id
   and u.email is not null
  left join public.runs r
    on n.entity_type = 'run' and r.id = n.entity_id
  left join public.bugs b
    on n.entity_type = 'bug' and b.id = n.entity_id
  join public.projects p
    on p.id = coalesce(r.project_id, b.project_id)
  where n.read_at is null
    and n.created_at >= now() - interval '90 days'
    and n.event_type in (
      'run.finished', 'run.aborted',
      'bug.assigned', 'bug.reassigned', 'bug.status_changed'
    )
    and not exists (
      select 1
        from public.notification_preferences np
        where np.user_id = n.recipient_user_id
          and np.channel = 'email'
          and np.enabled = false
          and np.event_type = case
                when n.event_type like 'run.%' then 'run_lifecycle'
                when n.event_type like 'bug.%' then 'bug_lifecycle'
              end
    )
  order by n.recipient_user_id, p.name, n.created_at desc;
$$;


-- ============================================================================
-- 3. Grants — service_role only
-- ============================================================================

revoke execute on function public.bunkai_notification_digest_candidates() from public;
revoke execute on function public.bunkai_notification_digest_candidates() from anon;
revoke execute on function public.bunkai_notification_digest_candidates() from authenticated;
grant  execute on function public.bunkai_notification_digest_candidates() to service_role;
