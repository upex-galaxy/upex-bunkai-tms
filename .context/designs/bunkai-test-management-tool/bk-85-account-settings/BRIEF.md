# Design brief — Bunkai TMS / bk-85-account-settings

Tool session: CONTINUE project "bunkai-test-management-tool" — mode FOLLOW-UP.
Note: the previous screens were designed in a different tool, so the frozen contract is re-inlined
below instead of being assumed from project memory. Visual consistency with the existing five
screens (login, home, project, editor, run) is still a hard requirement.

## Mission

Design 5 screens/states for Bunkai, a test-management tool for QA engineers. We describe WHAT each
screen must accomplish; HOW it looks is your call — layout, composition, hierarchy, component
choices, density and micro-interactions are fully delegated to you. Your only hard boundary is the
design contract below: never invent colors, fonts, spacing or radii outside it.

When done, export and return the files as described in "Export & return".

## Product context

Bunkai (分解) is a test-management tool for QA engineers who work with hundreds of acceptance test
cases per project. The register is a dense engineer's terminal — precise, dark, developer-first —
closer to Linear and VS Code than to a consumer settings page. This batch is the signed-in user's
self-service surface: identity, API tokens, and workspace membership.

## Frozen design contract (non-negotiable)

Dark theme is the canonical (and currently only) theme. Base font size 13px, body line-height 1.45.

**Surfaces**

| Token | Hex | Role |
|---|---|---|
| `--bg-0` | `#0a0b0d` | Page background |
| `--bg-1` | `#101216` | Sidebar / chrome |
| `--bg-2` | `#14171c` | Default panel / card |
| `--bg-3` | `#1a1e25` | Elevated card / focused input |
| `--bg-4` | `#232830` | Hover |
| `--bg-5` | `#2d333c` | Active / pressed |

**Text**

| Token | Hex | Role |
|---|---|---|
| `--fg-0` | `#f1f3f5` | Titles, primary action |
| `--fg-1` | `#d4d8de` | Body |
| `--fg-2` | `#9aa1ab` | Secondary |
| `--fg-3` | `#6b727c` | Tertiary / muted |
| `--fg-4` | `#4a5057` | Disabled / placeholder |

**Strokes**

| Token | Value |
|---|---|
| `--stroke-1` | `rgba(255,255,255,0.05)` — dividers |
| `--stroke-2` | `rgba(255,255,255,0.08)` — default border |
| `--stroke-3` | `rgba(255,255,255,0.13)` — hover border |
| `--stroke-strong` | `rgba(255,255,255,0.22)` — focused border |

**Accent (vermillion — used sparingly: primary actions, focus rings, progress fill)**

| Token | Hex |
|---|---|
| `--accent` | `#d9543f` |
| `--accent-hi` | `#e87060` |
| `--accent-glow` | `rgba(217,84,63,0.18)` |
| `--accent-soft` | `rgba(217,84,63,0.10)` |

**Status signals** — the only other colors that carry meaning:
`--pass #2fb673` · `--fail #e5484d` · `--blocked #e8a838` · `--skipped #8a91a0` · `--running #4f8cf7`
(each with a 10% alpha background of the same hue).

**Typography**

- `--font-sans`: Inter (`cv11`, `ss01` enabled) — all UI text and prose.
- `--font-mono`: JetBrains Mono — every ID, code value, token string, terminal-ish content.
- `--font-jp`: Noto Serif JP — kanji wordmark only.
- Ramp: 10.5px uppercase +0.04em letter-spacing (field labels) · 11–11.5px weight 500 (tags, chips,
  small buttons, kbd) · 12–12.5px weight 400–500 (buttons, inputs, table cells) · 13px weight 400
  (body) · 14–16px weight 600 (section headings) · 18–22px weight 700 (page titles).

**Geometry**

- Radii: `--r-1` 3px (chips, kbd, tags) · `--r-2` 5px (buttons, inputs) · `--r-3` 7px (cards) ·
  `--r-4` 10px (modals, large surfaces). Nothing rounder than 10px.
- Spacing: implicit 4px grid. Common gaps 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24. Padding on primary
  surfaces tops out at 16; nothing breathes more than 24.
- Shadows: `--shadow-card` = `0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.4)`;
  `--shadow-pop` = `0 12px 28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset` for modals
  and popovers.

**Component conventions**

Existing vocabulary to reuse rather than reinvent: `.btn` (default / primary vermillion fill /
ghost / outlined danger; sizes sm, default, lg, icon-only), `.chip` (status + layer variants),
`.dot` (tiny status indicator), `.kbd`, `.tag` (removable monospace input chip with an `x`),
`.input` / `.textarea` / `.select` (solid `--bg-2`, hover to `--stroke-3`, focus to accent border
plus `--bg-3`), `.card`, `.seg` (segmented control), `.bar` (4px progress bar), `.caret`
(terminal cursor for empty states). Icons: Lucide, 14px inline / 16px nav / 18px empty states,
`currentColor` defaulting to `--fg-2`. No emoji in production UI. No glassmorphism, no gradients.

**Motion**: 120ms ease on color/background/border/transform. No page transitions; navigation must
feel instantaneous. Respect `prefers-reduced-motion`.

## Screens requested

### 1. `settings-account` — Settings hub · Account section

- Route: `/settings` (lands on Account) and `/settings/account`
- Purpose: the entry point to Settings; shows who the signed-in user is and where they belong.
- User stories: BK-87 — Open a settings hub and view my account; BK-86 — View my identity and role.
- The user must be able to:
  - See their own display name, email, and role in the active workspace — and never anyone else's.
  - See which workspaces they belong to, with their role in each.
  - Move between the Settings sections (Account, Tokens, Workspaces) and always know which one they
    are currently in.
  - Reach Settings from any signed-in page and get back to the app.
- States the ACs demand:
  - Loading — account and workspace data still fetching.
  - Empty — the user belongs to no workspace yet (identity still shows; the workspace area explains
    the situation and offers a way to create or join one).
  - Error — the workspace query fails while identity is available: identity still renders, the
    workspace area explains the failure and offers a retry.
  - Session expired — the user is told to sign in again.
- Viewport: desktop-first 1440px.

### 2. `settings-tokens` — Personal Access Tokens

- Route: `/settings/tokens`
- Purpose: let a user issue, review, and revoke the API tokens that authenticate their CLI and CI.
- User stories: BK-88 — Manage Personal Access Tokens.
- The user must be able to:
  - Review every token they own by name, scopes, and creation date. The secret is never shown here.
  - Issue a new token by naming it and choosing scopes from `atc:read`, `atc:write`, `run:execute`,
    `workspace:admin`; optionally bind it to one workspace and optionally set an expiry.
  - Read the full secret exactly once, immediately after issuing it, understand unambiguously that
    it can never be retrieved again, and copy it in one gesture.
  - Revoke a token, confirming the intent first, and see the row reflect the revoked state at once.
  - Understand what tokens are for and issue their first one when they have none.
- Notes that constrain content (not layout): secrets are prefixed `bk_pat_…` and are monospace like
  every other ID in the product; scopes are fixed machine strings, not free text. There is no edit
  path for an existing token — the remedy is revoke and reissue.
- States the ACs demand: default list · empty (no tokens yet) · secret-revealed-once (post-issuance)
  · revoke confirmation · revoked row · loading · error.
- Viewport: desktop-first 1440px.

### 3. `settings-workspaces` — Workspaces

- Route: `/settings/workspaces`
- Purpose: review every workspace the user belongs to and leave the ones they no longer need.
- User stories: BK-89 — View the workspaces I belong to; BK-90 — Leave a workspace.
- The user must be able to:
  - See each workspace they belong to with their role in it, and tell at a glance which one is
    currently active.
  - Leave a workspace, confirming against the specific workspace name before it commits.
  - Understand, before trying, that a workspace they solely own cannot be left — and why.
  - See the list settle after leaving, with a different workspace now active.
- Notes that constrain content: roles are Owner / Admin / Member / Viewer. Only active memberships
  appear — invited and suspended ones do not.
- States the ACs demand: multi-workspace default · single-workspace (the only one, and it is active)
  · leave confirmation naming the workspace · blocked-because-sole-owner, with the reason visible ·
  post-leave list · loading · error.
- Viewport: desktop-first 1440px.

### 4. `account-menu-overlay` — Account menu in the app shell

- Route: overlay opened from the persistent account affordance in the global shell (present on every
  signed-in page).
- Purpose: the always-reachable identity surface and the doorway into Settings and sign-out.
- User stories: BK-86 — View my identity, role, and sign out.
- The user must be able to:
  - Recognise the affordance as themselves from anywhere in the app (initials or display name).
  - Open it and read their exact email plus their role label in the active workspace.
  - Reach Settings from it.
  - Sign out from it and land back on the sign-in screen.
  - Do all of the above with the keyboard, and dismiss the menu with the keyboard.
- States the ACs demand: closed affordance (in the shell) · open menu · keyboard-focused item.
- Viewport: desktop-first 1440px. Design it in the context of the existing app shell so it reads as
  part of the sidebar/chrome already designed in this project.

### 5. `settings-coming-soon` — Not-yet-shipped Settings section

- Route: any `/settings/*` section that has not shipped.
- Purpose: BK-87 requires that Settings sections landing later announce themselves rather than
  present a broken link.
- User stories: BK-87 (acceptance criterion on future sections).
- The user must be able to:
  - See the future sections listed alongside the live ones — Members, Notification preferences,
    Billing, Environments — and understand they are not available yet.
  - Tell that a section is unavailable *before* selecting it, and, if they select it, get a clear
    explanation instead of an error or a blank page.
- Viewport: desktop-first 1440px.

## Hard constraints

- Name each screen file with its `{screen-slug}` exactly — the repo maps files by slug.
- No new tokens. A value not in the frozen contract is a defect, not a creative choice.
- Every interactive element needs a visible `:focus-visible` treatment (1px solid `--accent`, 1px
  offset). Modals and menus trap focus. Every primary action has a keyboard path.
- Color is never the only signal: pair status color with text and/or an icon.
- Contrast must hold WCAG AA against the dark surfaces.
- Every identifier, token string, scope name, and date-like machine value renders in JetBrains Mono;
  prose renders in Inter.
- Destructive actions (revoke a token, leave a workspace) always pass through an explicit
  confirmation that names the exact object being acted on.
- Keep visual consistency with the screens already designed in this project — this module must look
  like the same application, not a settings page bolted on.

## Export & return

**Open Design** (local app): create a project, pick a screen-type skill (`web-prototype` or
`dashboard`), and paste this brief into the Discover question form / brief field. Iterate until
satisfied, then copy the final artifacts from `./.od/artifacts/<timestamp>-<slug>/` into
`.context/designs/bunkai-test-management-tool/bk-85-account-settings/` in the repo.

Preferred output: one HTML/CSS file per screen named by its `{screen-slug}`. If the tool emits a
single bundle, keep the per-screen slugs recognisable inside it (file names, frame names, or
section ids) so the repo can map screens to specs.

When the files are in place, come back to the agent session and confirm — the screen-mapping phase
resumes from its checkpoint.
