# BK-213 — Implementation Plan (Dev)

> Local-only planning doc (not a `[SYNC]` file). Push a summary to the Jira
> "Spec Implementation Plan (Dev)" field / a comment if that custom field is
> unavailable, per `.agents/jira-required.yaml` fallback rule.

## 1. Scope recap

Personal, global (cross-workspace) notification preferences grid: 2 editable
event types (`run_lifecycle`, `bug_lifecycle`) x 2 channels (`in_app`,
`email`), instant-save toggles, plus a structurally-locked `mentions` row
(visible, immutable) per AC5 / business-rules.md. Per `out-of-scope.md`, this
story does NOT touch the notification producers (BK-211/BK-212) or the inbox —
it ships the preferences CRUD surface only. Enforcement wiring (producers
consulting these preferences before writing a `notifications` row) is
explicitly a sibling-story concern.

## 2. Data model

New table `public.notification_preferences`:

| column | type | notes |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| user_id | uuid | FK `auth.users(id) on delete cascade` |
| event_type | text | `check in ('run_lifecycle','bug_lifecycle','mentions')` |
| channel | text | `check in ('in_app','email')` |
| enabled | boolean | default `true` |
| updated_at | timestamptz | maintained by existing `bunkai_set_updated_at()` trigger (0004_atcs.sql) |

`unique (user_id, event_type, channel)`. No row is ever seeded at signup —
read-time defaults (see §3) mean an absent row is a valid, meaningful state
("never touched, still on default"), avoiding a signup-trigger for a purely
additive preference.

**Why no rows for `mentions` are ever allowed to exist**: business-rules.md
states the mentions row is immutable until Team Chat ships. Rather than trust
only the UI (`disabled` control) and the API (Zod enum excludes `mentions`),
the INSERT/UPDATE RLS policies themselves reject `event_type = 'mentions'` —
defense in depth at the layer that actually holds the data. The GET response
synthesizes the two locked mention cells in application code; the table is
guaranteed to never contain one.

## 3. Authorization model (ADR-0012 / rpc-authorization.md six-question check)

This story adds **zero Postgres functions** — no RPC, no `SECURITY DEFINER`,
nothing the six-question checklist's actor-bind requirement applies to. Every
read and write is a plain RLS-scoped PostgREST call through the caller's own
session (`getAuth(ctx).db`), mirroring `notifications`' mark-read pattern
(migration 0053's own header: "plain RLS-scoped PostgREST update... no RPC").
There is no caller-supplied identity parameter anywhere (`user_id` is never
accepted from the request body; it comes only from `principal.userId` /
`auth.uid()`), so ADR-0012 questions 1-3 are vacuous by construction, and
question 4 (result scoping) is satisfied structurally by
`user_id = auth.uid()` on every policy — not merely asserted once in
apex code.

## 4. API

`app/api/v1/notification-preferences/route.ts`:
- `GET` — returns the caller's effective grid: 4 editable cells (existing row
  value, or default `enabled: true` when absent) + 2 hardcoded locked
  `mentions` cells (`enabled: false, locked: true`), fixed row/channel order
  matching the mockup grid.
- `PATCH` — body `{ event_type: 'run_lifecycle' | 'bug_lifecycle', channel:
  'in_app' | 'email', enabled: boolean }`. Zod enum deliberately excludes
  `mentions` — a request naming it fails validation (422), no bespoke error
  code needed. Upserts one row (`onConflict: 'user_id,event_type,channel'`),
  `user_id` always `principal.userId`, never client-supplied.

Business logic lives in `response.ts` (unit-testable with a fake `db`,
mirroring `notifications/[id]/read/response.ts`); `route.ts` stays a thin
`withApiHandler` wrapper.

## 5. UI

Extends the live Settings hub (BK-87) — reuses `SettingsNav` /
`SETTINGS_NAV_AVAILABLE` (`lib/settings/nav-items.ts`) rather than the
mockup's separate icon rail (Rule #14: live shell wins). Adds:
- `lib/settings/nav-items.ts`: moves `notifications` from
  `SETTINGS_NAV_COMING_SOON` to `SETTINGS_NAV_AVAILABLE` with
  `href: '/settings/notifications'`.
- `app/(app)/settings/notifications/page.tsx`: server component, mirrors
  `settings/account/page.tsx`'s auth guard + fetch shape, fetches the grid via
  the caller's own RLS-scoped client (no admin client needed — fully
  self-scoped) and hands it to a client component.
- `components/settings/NotificationPreferencesGrid.tsx`: client component,
  instant-save per-cell PATCH with optimistic toggle + revert-on-error +
  `sonner` toast, mirrors `BugsListView.tsx`'s fetch/error-state convention.
- `components/ui/switch.tsx`: new minimal button-based switch
  (`role="switch"`, `aria-checked`, `disabled`) matching the mockup's `.switch`
  CSS 1:1 via existing Tailwind tokens (`bg-signal-pass`, `bg-surface-5`,
  `stroke-2`, `stroke-strong`, `fg-2`, `fg-4`) — no new dependency. No
  shadcn/Radix switch exists in this repo yet (checked
  `@radix-ui/react-*` deps + `components/ui/`); adding one for a single
  boolean toggle would be a speculative abstraction for a single caller
  (Rule: "no abstractions for single-use").

## 6. Tests

- `app/api/v1/notification-preferences/route.test.ts` — fake-db unit tests
  for `listNotificationPreferences` / `upsertNotificationPreference` (default
  merge logic, mentions rejection, error mapping), mirrors
  `notifications/[id]/read/route.test.ts`.
- `lib/notification-preferences/notification-preferences-write-path.test.ts`
  — **real-DB integration test**, mirrors
  `list-notifications-isolation.test.ts`: signs in as `QA_E2E_USER_EMAIL`
  for real, PATCHes a real cell through the real RLS-scoped client, cross-
  checks the persisted row via the service-role client (proves the write hit
  the actual table, not a mock), reads it back through the real GET logic,
  and proves the DB-level `mentions` lock rejects an insert even when
  attempted directly against the table (bypassing the API's Zod gate).
  Captures/restores the two touched cells' prior state in `beforeAll`/
  `afterAll` since `QA_E2E` is a shared fixture across test files.
- `lib/settings/nav-items.test.ts` (existing file) — extend for the moved nav
  entry.

## 7. Migration numbering

Verified via `mcp__supabase__list_migrations` (project `fmbpikzpkafptqximhxn`)
immediately before writing the file: highest applied version is `0061`. Local
tree also has `0058`-`0061` committed to `staging` (`0058_atc_title_min_
length.sql` is committed but not yet applied live — a different in-flight
story, not this one). Next number: **`0062`**.

## 8. Explicitly out of scope (per ticket's own `out-of-scope.md`)

- Wiring BK-212's existing bug-notification trigger (`bunkai_notify_bug_event`,
  0056) or any future BK-211 run-notification producer to actually consult
  this table before inserting a `notifications` row. **Flagged as a follow-up
  gap**, not silently dropped — see final delivery report.
- Per-workspace overrides, mute schedules, digest cadence, new channels — all
  explicitly out of scope per the ticket.
