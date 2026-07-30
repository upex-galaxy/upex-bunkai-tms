# Design brief — Bunkai TMS / bk-208-notifications
Tool session: NEW project `bunkai-bk-208-notifications` (Open Design, MCP-driven Mode A)

## Mission
Design 3 screens for the Notifications Center epic (BK-208) of Bunkai, a dark, dense,
developer-first test-management tool. We describe WHAT each screen must accomplish; HOW it
looks is your call — layout, composition, hierarchy, component choices, and micro-interactions
are fully delegated to you. Your only hard boundary is the attached design system: the project
has the `user:bunkai` design system package attached — use its native token names, never invent
colors, fonts, radii, or spacing outside it.

## Product context
Bunkai lets QA engineers and developers author test cases, run them manually or via CI/agents,
and track bugs and coverage across projects. Today the only way to learn a run finished or a bug
landed on you is to go looking — this epic makes workspace events reach the right person: an
in-app inbox, per-event-type preferences, and an email digest.

## Frozen design contract (non-negotiable)
- Design system: attached OD package `user:bunkai` (mirrors this repo's `DESIGN.md` verbatim).
  Use its native token names (e.g. `--bg-0..5`, `--fg-0..4`, `--accent`, `--pass/--fail/--blocked/
  --skipped/--running`, `--radius-*`) — no new tokens, no re-picked palette.
- Component conventions: sharp radii (3/5/7/10px), 1px hairline borders/strokes, no glassmorphism,
  no drop-heavy shadows beyond the system's `pop`/`card` shadows, Inter for UI text, JetBrains Mono
  for IDs/code/mono values (e.g. `RUN-xxx`, `BUG-xxx`, `USR-xxx`).
- Unread/status signal must never be color-only — pair every unread/read/status distinction with a
  structural or textual cue (dot + label, weight change, badge text), not color alone.

## Screens requested

### 1. notifications-inbox — Notifications inbox (bell + panel)
- Route: global overlay, mounted in the App Shell topbar (no dedicated route — opens over any
  signed-in page)
- Purpose: workspace-events inbox reachable from a topbar bell, newest-first
- User stories: BK-209 — view an inbox of workspace events; BK-211 — get notified when a run
  finishes or is aborted; BK-212 — get notified on bug assignment and status changes
- Base to extend: this screen is an ADDITION to the existing App Shell used across Bunkai
  (`test-runs-index.html` in this same design system, already in your project memory as prior art
  if visible, otherwise reconstruct from this description). That shell has: a left sidebar
  (Bunkai wordmark, global nav — Home/Projects/ATC Library/Test Runs/Bug Reports/Metrics/
  Settings — and a user block at the foot) plus a topbar with breadcrumbs on the left and a
  command-palette search box on the right. You are adding a bell icon button to that topbar
  (near the search box) that opens a slide-out panel anchored to it.
- The user must be able to: see an unread-count badge on the bell; open the panel by clicking the
  bell and see notifications listed newest-first; visually tell unread notifications apart from
  read ones (never by color alone); mark a single notification as read; mark all notifications as
  read from a header control; click a notification and land on the entity it references (a run or
  a bug), with the notification marked read as a side effect; when the referenced entity no longer
  exists, stay in the inbox and see an inline message that the item is unavailable (still marked
  read).
- Notification content vocabulary: notifications reference runs and bugs using their established
  mono ID chips (`RUN-xxx`, `BUG-xxx`) and carry a verdict/status word (passed/failed/aborted for
  runs; assigned/status-changed for bugs) — reuse the system's signal colors/labels for verdicts,
  never a bare color swatch.
- States the ACs demand: default populated (mixed read/unread, newest-first) / empty (zero
  notifications ever) / all-read (badge gone, every item read-styled) / entity-unavailable click
  result. Show all of these as sections/frames in the same file.
- Viewport: desktop-first 1440px

### 2. settings-notifications — Notification preferences
- Route: `/settings/notifications`
- Purpose: per-event-type notification channel toggles inside the Settings hub
- User stories: BK-213 — configure notification preferences per event type
- Base to extend: this screen is a NEW section inside the existing Settings hub shell already
  built for this product (`settings-account.html` in this design system). That shell has: the same
  App Shell rail on the far left (icon-only, Settings marked current), a 216px-wide Settings nav
  column next to it (a "Back to app" link + "Settings" title, then an "Available" group of
  section links — Account / Tokens / Workspaces — then a "Coming soon" group of disabled items
  each tagged "soon": Members / Notifications / Billing / Environments), and a main content area
  with its own topbar breadcrumb + route chip. For THIS screen, promote "Notifications" out of the
  "Coming soon" group into "Available" as a live, selected nav link (it now has its own working
  section) — Members, Billing, and Environments stay in "Coming soon" exactly as before.
- The user must be able to: see a grid of event types (run lifecycle, bug lifecycle, mentions)
  against two channels (in-app, email); see run lifecycle and bug lifecycle both channels on by
  default; toggle the in-app channel off for run lifecycle independently of email; toggle the
  email channel off for bug lifecycle independently of in-app; trust that toggling one channel
  never silently changes the other channel for the same event type; see the mentions row visibly
  marked as coming soon with its toggles structurally locked (not just visually dimmed).
- States the ACs demand: default (all-on grid) / partially-toggled (mix of on/off per
  event×channel) / mentions-locked row / persisted-after-reload look (same as default, just
  confirms nothing resets).
- Viewport: desktop-first 1440px

### 3. email-digest-template — Daily unread-notification email digest
- Route: none — this is a TRANSACTIONAL EMAIL, not an app screen
- Purpose: a daily digest email summarizing a recipient's unread notifications, grouped by project
- User stories: BK-214 — receive an email digest of unread notifications
- Medium constraint: this must render as valid, email-client-safe HTML (table-based or inline-
  style layout suitable for Gmail/Outlook rendering, not a CSS-grid/flexbox app layout) while still
  being visually faithful to the attached `user:bunkai` design tokens (dark surface, accent color,
  typography) adapted to what email clients can safely render — approximate with inline styles and
  websafe fallbacks for Inter/JetBrains Mono.
- The user must be able to: see one email summarizing every unread notification across all their
  projects; see items grouped under per-project headings, each heading showing that project's
  unread count; click a single "open inbox" action that would land them back in the app's inbox;
  understand which items are run-related vs bug-related at a glance, using the same RUN-xxx/
  BUG-xxx mono ID + verdict vocabulary as the in-app inbox.
- States the ACs demand: populated digest (2+ projects, several items each) — this is the only
  state; a digest with nothing unread is never sent, so there is no "empty digest" state to design.
- Viewport: email width (~600-640px), single column

## Hard constraints
- Name each screen file exactly by its slug: `notifications-inbox.html`,
  `settings-notifications.html`, `email-digest-template.html` — the repo maps files by slug.
- No new tokens. A value not in the attached `user:bunkai` package is a defect, not a creative
  choice.
- UI copy in ENGLISH on every screen, no exceptions.
- Screens 2 and 3 come after screen 1 in this same project/conversation — reuse the shell anatomy
  and visual language established in screen 1 wherever it's shared (e.g. notification list-item
  styling should look like the same design language across the inbox panel, the email digest, and
  any preview references).
- Accessibility: every unread/locked/status distinction pairs a text or structural cue with color,
  never color alone (standing project rule).

## Export & return
MCP-driven (Open Design Mode A): the orchestrating agent will call `start_run` once per screen
with a slice of this brief, poll to completion, then copy the resulting files from this project's
data directory into `.context/designs/bunkai-test-management-tool/bk-208-notifications/` in the
repo. No human action needed unless a run fails or produces an off-contract result.
