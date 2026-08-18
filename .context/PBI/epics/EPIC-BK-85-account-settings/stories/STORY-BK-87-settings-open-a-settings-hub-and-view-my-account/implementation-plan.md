# BK-87 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-87)

## Summary

[https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) wires the Settings hub's navigation shell and ships exactly one real screen: `/settings` (→ `/settings/account`), showing the signed-in user's identity (email, role in the active workspace, member-since, last-active) and a read-only list of every workspace they belong to. `/settings/tokens` and `/settings/workspaces` get honest "coming soon" placeholders (their real behavior ships in [https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88) and [https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89](https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89)/90). Sign-out stays exclusively in BK-86's already-shipped account menu — this story adds zero sign-out UI. No new API route is introduced; every read reuses existing Supabase query patterns already proven in `onboarding/page.tsx` and `workspaces/[id]/members/page.tsx`.

## File / component plan

- `middleware.ts` (edit) — add `/settings` to `PROTECTED_PREFIXES` so an unauthenticated direct hit is redirected at the edge (mirrors the existing `/projects`, `/onboarding` gate).
- `components/layout/AppSidebar.tsx` (edit) — flip the `settings` nav item from `href: null` (currently rendered disabled/"soon") to `href: '/settings'`; add a `DropdownMenu.Item` "Settings" (linking to `/settings`) above the existing "Sign out" item in the bottom account menu (BK-86's shipped dropdown).
- `app/(app)/settings/layout.tsx` (new) — server component. Confirms the session (`supabase.auth.getUser()`, redirect `/login?next=/settings` if absent — defense-in-depth alongside the middleware gate) and renders `<SettingsNav>` (216px) beside `{children`}, nested inside the existing `(app)/layout.tsx` content column (to the right of the persistent 224px `AppSidebar` — see Technical Decisions).
- `components/settings/SettingsNav.tsx` (new, client — needs `usePathname()` for `aria-current`) — "Available" group: Account / Tokens / Workspaces (live links). "Coming soon" group: Members / Notifications / Billing / Environments (`aria-disabled`, no `href`, `soon` tag) — verbatim mockup structure from `settings-account.html`.
- `app/(app)/settings/page.tsx` (new) — `redirect('/settings/account')`.
- `app/(app)/settings/account/page.tsx` (new) — server component. Two independent async data sections (see Technical Decisions §TD7): identity (email + `last*sign*in*at` via the same admin-lookup pattern `GET /api/v1/me` already uses) and workspace membership (all active `workspace*members` rows for the caller, joined to `workspaces` for name/slug/plan, plus a per-workspace active-member count). Renders `<IdentityCard>` + `<Suspense><WorkspacesList></Suspense>`.
- `components/settings/IdentityCard.tsx` (new) — avatar initials (`emailInitials`, reused), email as primary label, role chip + active workspace name/slug (`roleLabel`, reused), member-since (active workspace's `joined_at`), last-active. No sign-out control (TD1).
- `components/settings/WorkspacesList.tsx` (new, client) — table: workspace name + slug (mono) + role chip + active indicator + member count. States: loading skeleton, empty (identity intact + "Create workspace" CTA → `/onboarding`), error (identity intact + retriable message, Retry calls `router.refresh()`).
- `components/settings/ComingSoon.tsx` (new) — generic {{{ title, description, route }}} card for not-yet-shipped sections; links back to the live sections.
- `app/(app)/settings/tokens/page.tsx`, `app/(app)/settings/workspaces/page.tsx` (new) — thin pages rendering `<ComingSoon>` with section-specific copy.

Not built in this story (see TD10): dedicated routes for Members / Notifications / Billing / Environments. They exist only as inert nav entries, matching the mockup's own `aria-disabled` treatment — building live-but-empty routes for them is out of this story's stated scope (`out-of-scope.md`: Members owned by [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5), Integrations/Environments Phase 2).

## Data plan

No new API route handlers. Every read is a direct server-side Supabase call inside the new page/layout components, following the exact pattern already used in `app/(app)/onboarding/page.tsx` and `app/(app)/workspaces/[id]/members/page.tsx` (create SSR client → `auth.getUser()` → typed `.from(...).select(...)` queries). This matches the acceptance-criteria.md technical-context note ("No new API endpoints required for read operations") — confirmed correct by reading the code, not assumed.

- Identity: email + `last*sign*in_at` via `createAdminClient().auth.admin.getUserById(user.id)` — the exact call `app/api/v1/me/route.ts` already makes.
- Active workspace + role: same cookie-driven resolution already used in `(app)/layout.tsx`'s `getShellData()` (`ACTIVE*WORKSPACE*COOKIE` → `resolveActiveWorkspaceId`), re-run server-side in `settings/account/page.tsx` rather than introducing a second mechanism.
- Workspace list: `workspace*members.select('workspace*id, role, joined*at').eq('user*id', user.id).eq('status', 'active')` joined to `workspaces(id, slug, name, plan)` — same shape as `onboarding/page.tsx`'s membership check, widened to fetch all rows instead of `.limit(1)`. Per-workspace member count is one additional grouped count query (still no new route).

## States

- ******Loading**** — `WorkspacesList` renders inside its own `<Suspense>` boundary with a per-row skeleton (mockup `state-loading` panel); `IdentityCard` is not gated behind the same boundary so it never waits on the workspace query.
- ******Empty**** (zero active memberships) — Identity renders normally; `WorkspacesList` shows "You don't belong to any workspace yet" + a single "Create workspace" CTA linking to the existing `/onboarding` flow (TD9).
- ******Error**** (workspace query fails) — Identity still renders (independent fetch, TD7); `WorkspacesList` shows a retriable message, Retry calls `router.refresh()` (same idiom as the project-explorer's environment-delete flow: fetch → refresh → friendly message).
- ******Session-expired**** ****— no bespoke code:**** ****`/settings/***{{ nests inside }}(app)/layout.tsx{{'s }}<AuthProvider>{{, which already reacts to a Supabase }}SIGNED_OUT{{ broadcast via }}handleAuthChangeRedirect{{ (}}lib/account/auth-redirect.ts{{) and redirects to }}/login{{, app-wide. Confirmed by reading }}auth-context.tsx{{ — this is already wired for every }}(app)` route today.

## Auth guard

Two layers, matching the existing dual pattern in this codebase:

1. `middleware.ts` — add `/settings` to `PROTECTED_PREFIXES`; an unauthenticated request is redirected before any React render, to `/login?next=<path>` (existing helper, existing param name).
2. `app/(app)/settings/layout.tsx` — a page-level `supabase.auth.getUser()` check + `redirect('/login?next=/settings')` fallback, mirroring `onboarding/page.tsx` and `workspaces/[id]/members/page.tsx` (defense-in-depth, and it's also where `user` gets resolved for the rest of the tree).

## TC-AC mapping

| ***Test case**** | ****Implementation step(s)*** |
| --- | --- |
| TC-AC1 — identity card (email/name/role, email-only fallback) | `IdentityCard.tsx` + `settings/account/page.tsx` identity fetch (admin lookup); no name fallback logic needed — `user_metadata` is confirmed empty everywhere in this codebase today (TD6), so email is always the only identity label. |
| TC-AC2 — workspace list with role + current indicator, 10+ scrollable | `WorkspacesList.tsx` + the widened `workspace_members` query; active-workspace row gets a visual "active" indicator; list container is `overflow-y-auto` with a max-height. |
| TC-AC3 — Settings reachable from account menu + direct URL | `AppSidebar.tsx` edit (nav item href + new dropdown "Settings" item) + `settings/page.tsx` + `settings/account/page.tsx` routing. |
| TC-AC4 — unauthenticated → `/login` with return path | `middleware.ts` `PROTECTED_PREFIXES` edit + `settings/layout.tsx` fallback redirect. |
| TC-AC5 — session expiry, no crash | No new code — inherited for free from the app-wide `AuthProvider`/`handleAuthChangeRedirect` wiring already covering every `(app)` route. |
| TC-AC6 — empty-state CTA | `WorkspacesList.tsx` empty branch, CTA → `/onboarding`. |
| TC-AC7 — retriable error, identity survives | `settings/account/page.tsx` split into two independent async sections (TD7) + `WorkspacesList.tsx` error/Retry branch. |

## Technical Decisions

- ******TD1 — Sign-out boundary (mockup vs. PO answer, reconciled).**** `settings-account.html` shows a "Sign out" ghost button in the Identity card header AND a full "Danger zone / Delete account" section. Neither is in scope: the PO's comment is explicit ("Sign-out is exclusive to [https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86](https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86). [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) delivers only identity display + workspace list") and no story ([https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86](https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86) through [https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90](https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90)) mentions account deletion at all. Decision: build the Identity card with NO sign-out control (BK-86's shipped `AppSidebar` account-menu dropdown already owns sign-out) and NO danger zone. This is a UI-only, fully reversible spec divergence from the mockup — flagging per Rule #15 rather than silently under- or over-building. The "Delete account" capability is filed as a future tech-story candidate, not part of this plan.
- ******TD2 — Shell nesting****: ****reuse the live 224px**** `AppSidebar`****, do not build the mockup's separate 48px icon rail.**** ****The mockup's**** `.shell` ****(48px rail + 216px settings-nav + content) is a different chrome than the app's actual shipped shell (****`AppSidebar`****, 224px, holding logo/workspace-switcher/search/nav/pinned-projects/account-menu —**** `(app)/layout.tsx`****,**** `grid-cols-[224px_1fr]`****). Per Live-UI-First (Rule #14), building a second icon rail alongside the real one would strand users from the workspace switcher, search, and pinned projects while inside Settings. Decision:**** ****`/settings/***{{ nests INSIDE the existing }}(app){{ shell; }}app/(app)/settings/layout.tsx{{ adds only the mockup's 216px }}SettingsNav` as a second column, dropping the redundant 48px rail. UI-only, fully reversible.
- ******TD3 — Auth-guard mechanism + param-name divergence.**** The AC/ATP literally specify `returnUrl=/settings`; the codebase already has one established convention, `next=`, used by `middleware.ts` and every login form. Decision: use `next=/settings`, not a second, inconsistent param name. Behavior-equivalent, wording-only divergence from the literal AC text.
- ******TD4 — Current-workspace source.**** Reuses the existing `bk*active*ws` cookie + `resolveActiveWorkspaceId` mechanism already driving `(app)/layout.tsx` and the workspace switcher ([https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6](https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6)) — resolved server-side again in `settings/account/page.tsx`, not a new mechanism.
- ******TD5 — Workspace list query reuse.**** Reuses the `workspace_members` active-membership pattern from `onboarding/page.tsx` / `workspaces/[id]/members/page.tsx` verbatim, widened to all rows. The per-workspace member-count is the one added-cost item (an extra aggregate query) purely for mockup fidelity; it is the first thing to cut if review wants a leaner diff.
- ******TD6 —**** `user*metadata` ****/ display name.**** Confirmed by grep: no code path in this repo reads or writes `user*metadata`/`full*name`/`display*name` anywhere. Email is the only identity label today — this isn't a fallback case to code defensively for, it's simply the current reality.
- ******TD7 — Error isolation between Identity and Workspaces.**** The workspace-membership query must be caught locally inside its own async server component and never allowed to throw to a route-level `error.tsx` boundary — otherwise a failed workspace fetch would blank the Identity card too, violating TC-AC7 ("identity still renders"). Establishes a Suspense-per-section pattern later Settings screens can copy.
- ******TD8 — No fabricated IDs.**** The mockup shows synthetic `USR-0042` / `WS-001` chips with no backing schema column. Decision: omit the user-id chip entirely; replace the workspace's synthetic id with the real `workspaces.slug` column already on the table.
- ******TD9 — Empty-state CTA.**** Links to the existing `/onboarding` flow (real create-workspace path) rather than new UI. Drops the mockup's secondary "Join with an invite" button — no self-serve accept-invite flow exists yet to back it.
- ******TD10 — No routes for the 4 non-linked "soon" sections.**** Members ([https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5)), Notifications ([https://jira.upexgalaxy.com/browse/BK-213#icft=BK-213](https://jira.upexgalaxy.com/browse/BK-213#icft=BK-213)), Billing ([https://jira.upexgalaxy.com/browse/BK-229#icft=BK-229](https://jira.upexgalaxy.com/browse/BK-229#icft=BK-229)), Environments (Phase 2, D11) stay inert nav entries only, per `out-of-scope.md`. A stray deep link to e.g. `/settings/billing` will 404 rather than show the mockup's honest coming-soon page for those four — a known, accepted gap, filed as a future tech-story rather than built here.

******ADR check****:**** none of TD1–TD10 clears both ADR gates (architectural AND hard-to-reverse). All are either presentational/scope choices, or re-use existing already-decided architecture (ADR-0001 principal model, the [https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86](https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86) active-workspace-cookie mechanism). No ADR recommended for this story.

## Review Workload Forecast

Estimated: 820 additions + 10 deletions = 830 total lines
400-line budget risk: High
Chain strategy: stacked-to-main (git-flow-master decision tree Q2 = Yes — see branch plan below)
Decision needed before apply: No — resolved

## Branch Plan (stacked-to-main, 2 PRs, strategy = main-integration, base = staging)

***PR1 —*** `feat/BK-87-settings-hub-shell` (branch off `staging`)

- Files: `middleware.ts` (edit), `components/layout/AppSidebar.tsx` (edit), `app/(app)/settings/layout.tsx` (new), `components/settings/SettingsNav.tsx` (new), `app/(app)/settings/page.tsx` (new), `app/(app)/settings/account/page.tsx` (new — identity section only; workspace section renders a static "Workspaces — loading" placeholder in this slice, not the real list), `components/settings/IdentityCard.tsx` (new), `components/settings/ComingSoon.tsx` (new), `app/(app)/settings/tokens/page.tsx` (new), `app/(app)/settings/workspaces/page.tsx` (new).
- Covers: TC-AC1 (identity), TC-AC3 (navigation + direct URL), TC-AC4 (auth guard), TC-AC5 (session expiry, inherited for free).
- Est. ~420 lines (incl. tests). Fully working and honest on its own — the workspace section placeholder is not broken, just not yet real (same pattern the mockup itself uses for other coming-soon sections).
- Merges to `staging` via `--no-ff` PR before PR2 branches.

***PR2 —*** `feat/BK-87-settings-workspace-list` (branch off `staging`, AFTER PR1 has merged — so PR1's shell code is present)

- Files: `components/settings/WorkspacesList.tsx` (new), edit to `app/(app)/settings/account/page.tsx` (swap the placeholder for the real `<Suspense><WorkspacesList></Suspense>`), the widened `workspace_members` query.
- Covers: TC-AC2 (workspace list + role + current indicator + 10+ scrollable), TC-AC6 (empty state), TC-AC7 (error + retry, identity isolation per TD7).
- Est. ~410 lines (incl. tests).
- Merges to `staging` via `--no-ff` PR. Jira transitions to Ready For QA only after THIS PR merges (both slices done).

Each slice is independently mergeable and leaves `staging` in a fully working state — no partial/broken intermediate state, per the `stacked-to-main` contract.

---
_Synced from Jira by sync-jira-issues_
