# Design brief — Bunkai TMS / bk-210-team-chat
Tool session: NEW project — Open Design MCP-driven (Mode A), project id `bunkai-bk-210-team-chat`, design system `user:bunkai`.

## Mission
Design 4 screen(s) for Bunkai, a dark, dense, engineer-first test-management tool (register:
Linear / VS Code, not a consumer chat app). We describe WHAT each screen must accomplish; HOW it
looks is your call — layout, composition, hierarchy, component choices, and micro-interactions are
fully delegated to you. Your only hard boundary is the design contract: never invent colors,
fonts, or spacing values outside the attached `user:bunkai` design system. When done, export and
return the files as described in "Export & return".

## Product context
Bunkai keeps QA conversation attached to the work instead of losing it to Slack. Team Chat is a
persistent panel/dock in the global App Shell: a workspace-wide channel plus one channel per
project, where testers mention each other and drop rich links to ATCs/Tests/Runs without leaving
the tool.

## Frozen design contract (non-negotiable)
- Colors: surfaces `--bg-0..5` (#0a0b0d → #2d333c), text `--fg-0..4` (#f1f3f5 → #4a5057), strokes
  `rgba(255,255,255,.05/.08/.13/.22)`, accent (vermillion) `--accent #d9543f` / `-hi #e87060` /
  `-glow rgba(217,84,63,.18)` / `-soft rgba(217,84,63,.10)`, signal tokens pass `#2fb673` /
  fail `#e5484d` / blocked `#e8a838` / skipped `#8a91a0` / running `#4f8cf7` (each with a `-bg` at
  .08/.10), layer chips UI `#8b6df0` / API `#4f8cf7` / Unit `#2fb673`.
- Typography: Inter for UI text, JetBrains Mono for entity IDs and message timestamps, Noto Serif
  JP only for the 分 brand mark.
- Radius: 3 / 5 / 7 / 10px (sharp, never above 10px). Spacing: 4px grid throughout.
- Component conventions: shadcn-style flat cards, 1px hairline borders, no glassmorphism, no
  gradients, no drop shadows beyond the frozen tokens, no emoji in UI copy.
- These tokens are attached to this Open Design project as the `user:bunkai` design system —
  reference them by their native token names; do not re-derive new values.

## Screens requested

### 1. chat-panel-workspace — Workspace channel
- Route: global panel/dock in the App Shell (persistent, not a modal)
- Purpose: real-time channel scoped to the whole workspace, where any member can talk to any other member
- User stories: BK-215 — chat with workspace members in real time; BK-217 — mention a teammate; BK-219 — edit/delete own messages
- The user must be able to: open the panel from the App Shell and see the workspace general channel; send a message and see it appear for other members without a refresh; see the sender's name and send time on each message; scroll up to load older history, seamlessly, across sessions; open a roster of workspace members showing role and online/offline presence; type "@" to autocomplete a teammate, arrow-key/Enter to pick, and see the inserted mention rendered highlighted inline; hover a message to reveal edit/delete actions on their own messages, save an inline edit or cancel it, and see an "edited" indicator after saving; see a deleted message replaced by a tombstone that no longer shows the original text; as a viewer role, still read full history while the composer is visibly disabled with a read-only hint; see a small number of messages that arrived while disconnected reappear in order once the connection returns, without needing to refresh
- States the ACs demand: default (channel open, history loaded); read-only composer (viewer role); edit-in-progress on a message (within the 15-minute edit window) vs edit-unavailable (window expired, hint shown); tombstoned message (own delete vs admin/moderator delete — the author sees it was removed by an admin); unread-messages-arrived-while-scrolled-up (does not force-scroll the reader)
- Viewport: desktop-first 1440px

### 2. chat-panel-project — Project channel
- Route: panel within `/projects/[projectSlug]`, same dock as screen 1
- Purpose: a per-project variant of the same channel surface, scoped to one project's members instead of the whole workspace
- User stories: BK-216 — chat in a dedicated per-project channel
- The user must be able to: switch between the pinned workspace general channel and the current project's channel from inside the panel; see only channels for projects they actually have access to; have the panel follow them automatically when they switch projects elsewhere in the app, while still being able to jump back to the general channel manually; see an unread badge on a project channel that clears once opened; reuse every workspace-channel capability (send, mention, roster, edit/delete, history) inside the project-scoped context
- States the ACs demand: consistent with screen 1's states, applied per-channel; channel-list state showing only accessible project channels plus the pinned general channel; unread-badge state on unopened channels
- Viewport: desktop-first 1440px
- Reuse the shell anatomy of `chat-panel-workspace.html`, with the project-channel section active in the switcher.

### 3. chat-entity-rich-link — Shared entity card
- Route: component inside the chat panel (both channel types), not a standalone screen — render it as a message-list state showing multiple card variants at once
- Purpose: a rich, clickable card that renders inline in a message when a teammate shares an ATC, Test, or Run, carrying enough context to act on without leaving chat
- User stories: BK-218 — share an ATC, test, or run as a rich link
- The user must be able to: paste or insert a reference to a Run and see a card with the Test name, environment, and pass/fail verdict; paste or insert a reference to an ATC and see a card with its title and workflow status; open the picker from the composer to search and insert an entity reference directly; click any card to navigate to that entity; when they lack access to the entity's project, see a restricted placeholder in the same footprint instead of its details, with no way to reveal it; when the referenced entity has since been deleted, see a graceful "no longer available" placeholder while the surrounding message text still renders normally
- States the ACs demand: resolved card (Run verdict, ATC status); restricted-placeholder card (no access); deleted-placeholder card (entity gone); the entity ID chips reuse the established mono-chip vocabulary from `RUN-xxx` / `BUG-xxx` used elsewhere in the app (e.g. Notifications inbox) — apply the same idiom to `ATC-xxx` / `T-xxx` / `RUN-xxx` references here
- Viewport: desktop-first 1440px
- Reuse the shell anatomy of `chat-panel-workspace.html` as the message-list frame these cards sit inside.

### 4. chat-search — Search overlay
- Route: overlay within the chat panel, triggered from either channel type
- Purpose: search message history across every channel the member can access, then jump straight to a match in its original conversation
- User stories: BK-220 — search the message history
- The user must be able to: open a search overlay from the chat panel and type to search message text; see results listing the matching message with its channel, author, date, and a highlighted snippet of the match; filter results by channel, author, and date range together; select a result and land in that channel scrolled to the message, with the message briefly highlighted so it's easy to spot; trust that results never include channels they don't have access to, with no hint that hidden matches exist; see a helpful empty state when a search returns nothing, suggesting they adjust terms or filters
- States the ACs demand: default/empty query state; populated results state; filtered-results state; no-matches empty state
- Viewport: desktop-first 1440px
- Reuse the shell anatomy of `chat-panel-workspace.html` as the panel this overlay sits within.

## Hard constraints
- Name each screen file exactly `{screen-slug}.html` from the list above — the repo maps files by slug.
- No new tokens. A value not in the frozen contract is a defect, not a creative choice.
- Self-contained HTML per screen (inline CSS, no external assets/CDN).
- `:focus-visible` gets a 1px `--accent` outline with 1px offset on every interactive element; full keyboard paths for sending, mentioning, editing, and searching.
- Color is never the sole signal (verdicts, unread state, read-only state all pair color with text/icon/shape).
- WCAG AA contrast throughout.
- Destructive confirmations (delete message) name the object being deleted.
- No gradients, no glassmorphism, no emoji in UI copy.
- UI copy in ENGLISH.
- Entity references (ATCs, Tests, Runs) reuse the established mono-chip vocabulary already used across the app (JetBrains Mono, e.g. `RUN-452`, `BUG-118` in the Notifications inbox) — do not invent a new visual language for IDs.
- Mention notifications must stay visually consistent with how mentions will later surface in the Notifications inbox (`notifications-inbox.html`) — same signal-token pairing, same entity-chip idiom.
- Screens 2–4 must read as the same product as screen 1: cite its shell/chrome anatomy, do not re-derive it from scratch.

## Export & return
**Open Design** (local app, REST-driven): runs are started programmatically against project
`bunkai-bk-210-team-chat` (design system `user:bunkai`), one per screen, sequential. Generated
files land under the project's data directory; the orchestrating session copies the finished
`{screen-slug}.html` files into `.context/designs/bunkai-test-management-tool/bk-210-team-chat/`.
