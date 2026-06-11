# Comments for BK-86

[View in Jira](https://jira.upexgalaxy.com/browse/BK-86)

---

### Andrés Daniel Cumare Morales - 6/8/2026, 6:18:36 AM

=== Shift-Left Refinement: BK-86 ===

## Summary

The 3 existing Gherkin scenarios in the `acceptance_criteria` field were used as the baseline (not discarded or replaced). Of those:

- ***Scenario 1**** ("Signed-in identity is visible from any screen") and ****Scenario 2*** ("Sign out ends the session and returns to sign-in") were refined in place — tightened wording so they become deterministically assertable (e.g. "name or initials" → a single resolvable source pending PO confirmation; "session ends" → explicit server-side invalidation).
- ***Scenario 3*** ("Account menu is keyboard accessible and dismissible") needed no change — already concrete and testable as written.
- ***4 new scenarios**** were added to fill gaps the original 3 leave open: role display on workspace switch, no-active-workspace empty state, sign-out failure handling, and multi-tab session termination. Each one is explicitly flagged ****NEEDS PO/DEV CONFIRMATION*** in the field — every new scenario is QA's inference, not a stated requirement.

The merged set (7 scenarios total) now lives in the `acceptance*criteria` field. The ATP DRAFT (12 test outlines across 3 functional groups, with a coverage estimate) lives in the `acceptance*test_plan` field.

## Central finding

Re-validating the codebase against the real ACs' own language ("global chrome", "account affordance") found that ***no persistent global chrome exists anywhere in the app — not even partially****. The one shared layout for authenticated routes (`app/(app)/layout.tsx`) renders no header, nav rail, or account control; the closest analogs (`WorkspaceSwitcher`, `CommandPalette`) are page-local, show workspace identity rather than user identity, and lack full keyboard/ARIA semantics. ****This reframes BK-86 from "wire identity/role/sign-out into an existing surface" to "design and build the app's first persistent account-menu primitive, then wire identity/role/sign-out into it"*** — a materially different (and larger) estimation input than the bare user-story line implies.

## Open questions blocking full estimation

1. ***What is the deterministic source for "name or initials" (Scenario 1)?*** The schema has no `display*name`/`full*name`/`avatar_url` — `/api/v1/me` exposes only `email`. This blocks writing even one assertable identity-display test.
2. ***What is the concrete page list for "global chrome" / "anywhere in the app"?*** This is the central feasibility blocker (see finding above) and the input that sizes the "reachable from every page" test outline.
3. ***Does "session ends" require server-side invalidation, and is multi-tab/multi-device propagation in scope for this story?*** Determines whether ~3 of the new scenarios are this-sprint or next-sprint work, and ties directly to the parent story's "shared machine" framing.

Action requested: PO + Dev review the merged scenarios and the 3 open questions above before this moves past Estimation. Local working copy of the full refinement: `.context/PBI/epics/EPIC-BK-85-account-settings/stories/STORY-BK-86-account-view-my-identity-role-and-sign-out/shift-left-refinement.md`

Refined on: 2026-06-08 — QA Shift-Left session

---

### Andrés Daniel Cumare Morales - 6/8/2026, 6:28:22 AM

=== Shift-Left Refinement: BK-86 — PO Response ===

***Role-play disclaimer***: This comment is authored by the AI assistant role-playing as the Product Owner for this story, as part of a quality-engineering practice exercise. These are AI-generated recommendations standing in for a real PO's decisions — they should be reviewed and ratified (or overridden) by the actual PO before estimation closes.

Responding to the open questions and new-scenario confirmations raised in the shift-left refinement, from a product-scope perspective:

## 1. "Name or initials" source (Open Question 1 / SQ-1)

***Decision: derive initials from the email local-part. No ****`display_name`**** field in this story.***

The schema has no name field, and adding one is a separate (larger) profile-settings concern. For THIS story, deterministic initials from `email` (e.g. `elena@bunkai.io` -> "EL" or "E") satisfy "see who I am at a glance" without expanding scope. A real-name/avatar feature is a natural follow-up story — flag it on the backlog, don't fold it in here.

## 2. "Global chrome" page list (Open Question 2 / SQ-2)

***Decision: every authenticated route — everything rendered through the ****`(app)`**** layout: ****`/projects`****, ****`/projects/[slug]/**`***, ****`/onboarding`****, ****`/workspaces/[id]/**`***.***

"Anywhere in the app" means anywhere Elena can be while signed in — onboarding included (she's signed in there too, and the "wrong account" anxiety this story is built on can strike during onboarding just as easily). Excluded: `/login` and other pre-auth routes — there's no identity to show before sign-in.

## 3. Session-end scope: server-side + multi-tab (Open Question 3 / SQ-4 / New Scenario D)

***Decision: both are in scope. This is the heart of the story, not an extra.***

The user story is framed entirely around "safely end my session on a shared machine." A sign-out that only redirects the current tab — leaving the session alive server-side or in another tab — doesn't deliver that promise, it just looks like it does. Ship the full guarantee or don't claim "safely."

## New Scenario A — role updates on workspace switch

***In scope — confirm.*** Directly serves the story's core value ("am I in the right account"). A stale role badge after switching directly contradicts that promise.

## New Scenario B — no-active-workspace empty state

***In scope — confirm.*** Simple copy is fine — something like "No workspace yet". Keep it short and consistent with the rest of the app's empty-state voice (Design has final say on exact wording/visual).

## New Scenario C — sign-out failure surfaced

***In scope — confirm, baseline only.*** "Tell Elena it failed, keep her signed in" is table-stakes error handling, not gold-plating. No retry flows or special UX needed beyond a clear message.

## New Scenario D — multi-tab termination

***In scope — see point 3 above.*** Same reasoning: the "shared machine" framing makes this core, not optional.

## SQ-3 — role display label

***Lean toward the simplest rule: capitalize the canonical value*** (`admin` -> "Admin", `owner` -> "Owner", etc). No custom copy deck — keep it lean. Design can confirm the visual treatment.

## BR-3 — sign-out is not RBAC-gated

***Confirm: yes.*** Ending your own session is a personal action, not a data mutation — every role and status should be able to do it. Gating it would be a bug, not a feature.

— **(AI acting as Product Owner, for QA-engineering practice)**

---

### Andrés Daniel Cumare Morales - 6/8/2026, 6:28:24 AM

=== Shift-Left Refinement: BK-86 — Dev Response ===

***Role-play disclaimer***: This comment is authored by the AI assistant role-playing as the engineer who would build this story, based on direct exploration of the current codebase (`app/(app)/layout.tsx`, `components/providers/auth-context.tsx`, `app/api/v1/me/route.ts`, `components/layout/Topbar.tsx`, `components/layout/WorkspaceSwitcher.tsx`, `middleware.ts`, `supabase/migrations/0001_tenancy.sql`). Standing in for a real Dev's technical call as part of a quality-engineering practice exercise — should be reviewed by the actual implementing engineer.

## SQ-1 — name/initials source

Confirmed: `auth.users` only exposes `email` through `/api/v1/me` — no `display*name`, `full*name`, or `avatar_url` anywhere across the 8 migrations. ***Deriving initials client-side from the email local-part is the right-sized fix*** — no schema change, no migration, no admin-API round trip. A simple deterministic rule (uppercase the first one or two alphanumeric characters before any `+`/`.` separator) covers the common case; edge cases like numeric-only local-parts (EC-1) just fall back to the raw characters — no special-casing needed.

## SQ-2 — where "global chrome" lives

Confirmed: `app/(app)/layout.tsx` today renders only `<AuthProvider>` plus a bare flex column — zero header, nav, or account control. ***The right move is to add a persistent header there***, since every authenticated route (`/projects`, `/onboarding`, `/workspaces/[id]`, all project-explorer pages) already passes through this one layout — "global chrome" becomes free for every current and future route the moment it lands here. Recommend reusing the existing `Topbar` component — it already exposes a `right` slot built for exactly this — rather than inventing a new shell primitive.

## SQ-4 + New Scenario D — server-side invalidation and multi-tab

Good news: most of this is already built. `supabase.auth.signOut()` invalidates the refresh token server-side by default — the middleware's `supabase.auth.getUser()` check on the next request will naturally reject the stale session (this is Supabase's standard behavior; worth an assertion-level test to confirm, not a new mechanism to build). For multi-tab: `AuthProvider` is **already** subscribed to `onAuthStateChange`, and Supabase broadcasts `SIGNED*OUT` across tabs via local storage — so a second tab already detects the sign-out internally. What's missing is a ***redirect-on-****`SIGNED*OUT`**** handler*** in `AuthProvider` (or the `(app)` layout) so the second tab actually navigates to `/login` instead of just updating its internal state silently. Small, contained addition — not new infrastructure.

## New Scenario C — sign-out failure surfaced

Trivial to wire: `AuthProvider.signOut()` already returns `{ error }`. The codebase already has the exact pattern needed — `WorkspaceSwitcher.tsx` calls `toast.error(...)` (via `sonner`) on a failed mutation. Reuse that: on error, show `toast.error('Could not sign out. Please try again.')` and skip the redirect. No new UI primitive required.

## Role field on `/me`

Currently ***missing*** — `/api/v1/me` returns workspace objects with no `role`. The bearer-token code path already does the `workspace*members` join (`select('workspace*id, status, workspaces!inner(...)')`); the cookie path needs the equivalent join scoped to the active workspace. Small, contained API change — and a hard prerequisite: Scenario 1's "her role in the active workspace" can't be displayed at all until this lands.

## EC-2 — role badge flicker on workspace switch

Real risk, agreed. Recommend gating the chrome's role re-fetch on the ***same ****`router.refresh()`**** cycle ****`WorkspaceSwitcher.switchTo()`**** already triggers*** — that guarantees the new role is fetched fresh against the new active-workspace cookie, instead of racing a separately-timed fetch.

## BR-3 — sign-out is RBAC-agnostic

Confirmed by code: `signOut()` calls `supabase.auth.signOut()` directly with zero role/status checks. Agree it should stay that way — coupling a session-termination action to RBAC would be a structural anti-pattern in an RLS-heavy multi-tenant app like this one.

— **(AI acting as Developer, for quality-engineering practice)**

---

### Andrés Daniel Cumare Morales - 6/8/2026, 6:28:26 AM

=== Shift-Left Refinement: BK-86 — Design Response ===

***Role-play disclaimer***: This comment is authored by the AI assistant role-playing as the Designer for this story, grounded in `DESIGN.md` — Bunkai's canonical design system (brand identity, color tokens, component vocabulary, accessibility contract). Standing in for a real Designer's call as part of a quality-engineering practice exercise — should be reviewed by the actual designer.

## SQ-1 — visual treatment for "name or initials"

Given the schema has no avatar image and Dev is deriving initials from email (see Dev's response), the right pattern is a ***small initials chip*** — sans-serif (`Inter`, the system's prose font, not `JetBrains Mono` — initials are prose, not an ID), sized to match the system's existing `.chip` vocabulary, on `--bg-3` with `--fg-0` text or `--accent-soft` background for a touch of warmth. No photo-avatar treatment — that would imply a capability (`avatar_url`) the schema doesn't have, and DESIGN.md is explicit that "status carries color; nothing else does" (principle 4) — keep this neutral, not decorative.

## SQ-2 — where the account affordance lives

***Place it in the ****`Topbar`****'s existing ****`right`**** slot**** (`components/layout/Topbar.tsx` already defines one, purpose-built for controls like this) once Dev promotes `Topbar` into the shared `(app)/layout.tsx`. This is a placement decision shared with Dev — the design win is that it slots into an **existing* component-vocabulary entry rather than inventing a new chrome primitive, keeping the "engineer's terminal" register (DESIGN.md section 1) intact.

## SQ-3 — role display label

***Capitalize the canonical enum value*** (`admin` -> "Admin", `owner` -> "Owner"). DESIGN.md's stated tone is "precise, dense, developer-first, opinionated about quality" — a friendlier copy deck ("Team Owner", "Workspace Admin") would clash with that register and add a translation layer with no real user benefit for an internal QA tool. Simple wins here.

## SQ-5 — keyboard accessibility depth

***The full ARIA ****`menu`**** pattern is the expected bar, not just Escape.**** DESIGN.md section 10 is explicit: **"Keyboard-first: every primary action has a keyboard path... Modal/dialog focus traps required"** and **"every interactive element shows **`:focus-visible`**."** Scenario 3 as written (open, then Escape, then focus-return) is a ****smoke-level example*** of that contract, not its full extent — focus-trap, arrow-key navigation between menu items, and `aria-haspopup`/`aria-expanded`/`role="menu"` semantics are all implied by the existing accessibility commitment, not new asks. Confirm: QA's outline count should reflect the fuller bar (the larger estimate behind EC-6/EC-7, not the narrow literal reading of Scenario 3 alone).

## New Scenario B — empty state

***Reuse the existing empty-state visual language*** — the system already has a dedicated `Caret` primitive (`.caret`, described as a "terminal-style cursor for empty states") for exactly this register. Something short and dry — "No workspace yet" — fits the brand's "precise, dense" tone better than a friendlier "You're not part of a team yet!" and keeps the new state visually consistent with empty states elsewhere in the app rather than inventing a new voice.

## Account menu container

Should follow the ***same dropdown-panel pattern ****`WorkspaceSwitcher`**** already establishes***: absolutely positioned, `--bg-1` surface, `--stroke-2` border, `--shadow-pop` elevation, `--r-3` radius. Reusing that pattern — instead of introducing a new menu shell — keeps "global chrome" visually coherent with the workspace control sitting right next to it.

— **(AI acting as Designer, for quality-engineering practice)**

---


_Synced from Jira by sync-jira-issues_
