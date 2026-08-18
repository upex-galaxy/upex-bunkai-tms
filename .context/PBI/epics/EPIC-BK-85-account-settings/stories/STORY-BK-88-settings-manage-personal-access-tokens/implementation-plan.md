# BK-88 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

# Implementation Plan: STORY-BK-88 - Settings | Manage Personal Access Tokens

## Overview

Build the real `/settings/tokens` screen: issue, list, and revoke Personal Access Tokens (PATs) from the Settings UI. This story is ***frontend-only***. `app/api/v1/tokens/route.ts` (POST/GET), `app/api/v1/tokens/[id]/route.ts` (DELETE), and the role-gate in `lib/api/pat.ts` were already built, security-reviewed, and unit-tested under [https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135) (bug fix) and [https://jira.upexgalaxy.com/browse/BK-167#icft=BK-167](https://jira.upexgalaxy.com/browse/BK-167#icft=BK-167) (tech story), both Closed/FIXED. No backend changes are planned; this plan only adds the presentation layer that consumes those existing, tested endpoints, replacing the `ComingSoon` placeholder left by [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) at `app/(app)/settings/tokens/page.tsx`.

***Acceptance Criteria to satisfy*** ([https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88), Shift-Left Refined 2026-06-10, all 8 scenarios):

1. Issuing a token reveals the secret exactly once.
2. Issuing a token with no scopes is rejected (inline validation).
3. Invalid scope enum values are rejected server-side (422).
4. `workspace:admin` scope requires admin/owner role (403).
5. Listing tokens never exposes the secret; revoked tokens are visually distinct.
6. Cross-user token deletion is rejected (404).
7. Revoking a token requires confirmation and updates immediately, no full page reload.
8. Empty token state guides first issuance.

---

## Technical Approach

***Chosen approach:**** Server component reads the token list (and the caller's workspace memberships, for the issuance form's optional workspace dropdown) directly via the Supabase server client — the same pattern `app/(app)/settings/account/page.tsx` already uses (direct `supabase.from(...)` reads, RLS-scoped, no round-trip through the app's own REST layer for GETs). Client components handle the two mutations (issue, revoke) via `fetch('/api/v1/tokens', ...)` / `fetch('/api/v1/tokens/{id}', { method: 'DELETE' })` against the ****existing, already-tested*** API routes — matching the established client-mutation convention in `components/tests/StartRunButton.tsx` and `components/tests/NewTestBuilder.tsx` (client component owns request state, POSTs/DELETEs to its own API route, surfaces `body.error.message` verbatim via `sonner` toast).

***Alternatives considered:***

- **Server Actions for issue/revoke instead of the existing REST routes**: rejected — would duplicate the role-gate (`assertTokenIssuanceAuthorized`) and secret-minting logic that already lives in `app/api/v1/tokens/route.ts`, already reviewed and tested. Calling the existing route from the client is strictly less code and zero duplicated security logic.
- **Fetching the list via** `GET /api/v1/tokens` **from the server component instead of direct Supabase read**: rejected for consistency — `account/page.tsx` sets the local convention of reading Supabase directly from server components for GETs and only hitting the app's own API routes for state-changing calls from the client. Diverging here would leave two different data-fetch conventions on the same route tree with no benefit (the GET route offers nothing the direct read doesn't — same RLS, same columns).

***Why this approach:***

- Zero new backend surface — the story's actual net-new risk is UI-only.
- Reuses a convention already read and understood by reviewers (`account/page.tsx`, `StartRunButton.tsx`).
- Trade-off: the issuance form's workspace dropdown needs one extra query (caller's active memberships) alongside the token list — same shape as the query `account/page.tsx`'s `WorkspacesSection` already runs, so no new query pattern, just one more call site.

---

## Technical Decisions

> The four PO/UX questions and one of the two dev/security questions flagged as "blocking sprint planning" in the shift-left comments (`comments.md`, 2026-06-10) are ***RESOLVED*** by the mockup delivered 2026-07-30 (`comments.md`, Ely, 7/30/2026) and by code already shipped. None are open for this plan.

### PO/UX Decision 1 — Revoked tokens appear in the list, with a specific visual treatment

***Resolved by:*** mockup `.context/designs/bunkai-test-management-tool/bk-85-account-settings/settings-tokens.html`.

***Decision:*** Revoked tokens stay in the list (no server-side filtering — `GET /api/v1/tokens` already returns them). Visual treatment, taken verbatim from the mockup:

- Row carries `data-revoked` → strikethrough token name (`.tk-row[data-revoked] .tk-name .nm`, line 506) plus a `chip[data-signal="fail"]` "revoked" badge next to the name (row markup for `old-laptop`/`PAT-002`, lines 882-886).
- Every other cell in the row is grayed to `--fg-4` (lines 507-509).
- The action column's Revoke button is replaced by a static `revoked <date>` note (`.revoked-note`, line 511; row markup line 893).
- Row hover is suppressed for revoked rows (line 510) — they read as inert history, not actionable items.

### PO/UX Decision 2 — Exact revoke confirmation dialog copy

***Resolved by:*** mockup `#revoke-overlay` (lines 1082-1094).

***Decision:*** Ship this copy verbatim (color-not-sole-signal: `role="alertdialog"`, danger-styled confirm button):

- Title: "Revoke token"
- Body: "You are about to revoke ***{name}**** (****{PAT-id}***). Any CLI or CI job using it will stop authenticating immediately. This cannot be undone — issue a new token instead."
- Cancel: "Cancel" · Confirm: "Revoke {name}" (danger variant)

### PO/UX Decision 3 — Expiry date and workspace binding are shown as list columns AND issuance-form fields

***Resolved by:*** mockup token table header (`.tk-row.head`, lines 822-828: Token / Scopes / Workspace / Created / Expires / Actions) and issuance form (`#issue-ws`, `#issue-exp` selects, lines 1030-1048).

***Decision:**** `TokensList` renders both as dedicated columns (Workspace: name + `WS-id` sub-line, or "All workspaces" when `workspace*id` is null; Expires: date, or "never" when `expires*at` is null, or a `blocked`-signal chip + "expires in N days" sub-line when within 7 days — mockup's `release-bot`/PAT-006 row, lines 863-880). `IssueTokenModal` offers both as ****optional*** fields (workspace: select from the caller's own active memberships; expiry: fixed choices 30 / 90 / 365 days / no expiry, matching `expires*in*days` on `POST /api/v1/tokens`).

### PO/UX Decision 4 — Clipboard API unavailable → silent success fallback

***Resolved by:*** mockup `wireCopy()` (lines 1208-1222) and {{.secret-box { user-select: all; }}} (line 620).

***Decision:*** `if (navigator.clipboard && navigator.clipboard.writeText)` → copy for real; otherwise (or on promise rejection) still flip the button to "Copied" and update the aria-live note — never show an error for this. The secret box's `user-select: all` is the standing manual fallback (the user can still triple-click / drag-select and copy by hand), so there is nothing to error about.

### Dev/Security Decision 5 — `workspace:admin` issuance is role-gated (already shipped, [https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135)/ADR-0005)

***Evidence:*** `lib/api/pat.ts:53-89` (`assertTokenIssuanceAuthorized`) requires a `workspace*id` for any `workspace:admin` scope request and requires the caller's `workspace*members.role` to be `admin` or `owner` in that specific workspace; requesting `workspace:admin` with no `workspace*id` is rejected outright (no global admin tokens). Enforced at `app/api/v1/tokens/route.ts:50-55`. Unit-tested: `lib/api/pat.test.ts` (8 cases — member-self-issue rejection, no-workspace-id rejection, admin/owner success, non-member rejection, non-admin-scope member success, global non-admin-scope success). Migration `0033*remediate*bk135*admin_scope.sql` remediated the pre-existing bad data. This plan's only obligation is to surface the 403 response's `error.message` verbatim in `IssueTokenModal` — no new server logic.

### Dev/Security Decision 6 — Secret generation and non-exposure (already shipped)

***Evidence:*** `generateSecret()` (`app/api/v1/tokens/route.ts:130-134`, mirrored in `lib/api/pat.ts:155-159`) uses `crypto.getRandomValues` over 32 bytes (~256 bits of entropy), base64url-encoded. Only `sha256Hex(secret)` is persisted, into the sibling `access*token*secrets` table (`route.ts:86-92`) — never the raw secret. The raw secret is present exactly once, in the `201` response body (`route.ts:94-106`); `GET /api/v1/tokens` selects an explicit column list that excludes both `hash` and the raw secret (`route.ts:116-121`). No server-side logging of the secret exists anywhere in the route. This plan's obligation is purely presentational: never persist the secret to client state beyond the single reveal step's local component state, and never include it in any URL, `console.log`, or analytics call.

### Decision 7 — Hand-built modals, not a new shadcn dialog primitive

***Chosen:*** Two hand-built overlay components (`IssueTokenModal`, `RevokeTokenModal`) matching the existing in-repo convention at `components/runs/RunnerView.tsx:485-569` (plain `fixed inset-0` overlay + `role="dialog"`/`role="alertdialog"`, click-outside-to-close via `stopPropagation`, `Button` variants from `@components/ui/button`) — not `bunx shadcn add dialog`.

***Reasoning:***

- ✅ `components/ui/` has no `dialog.tsx`/`alert-dialog.tsx` today (confirmed: only `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `tabs.tsx`). Adding a new primitive for one story's two modals is a bigger footprint than reusing the pattern the repo already has, twice, in `RunnerView.tsx`.
- ✅ Per Rule #14 (Live-UI-first), the live convention is the fidelity baseline; the mockup is inspiration. `RunnerView.tsx`'s modals already satisfy the visual bar (overlay + card + Button variants) this story needs.
- ✅ Small, deliberate improvement over the `RunnerView.tsx` baseline: both new modals add Escape-to-close and return-focus-to-trigger (the mockup's `openOverlay`/`closeOverlay`/`trapFocus`, lines 1104-1126, do this; `RunnerView.tsx`'s existing modals do not). This is cheap (one shared `useModalDismiss(open, onClose)` hook, ~15 lines, no new dependency) and warranted here specifically because one of the two modals reveals a security-sensitive secret — closing it accidentally without the "I stored it" step matters more than in a routine confirm.
- ❌ Trade-off: this introduces one small shared hook not present in `RunnerView.tsx`'s modals. Documented here so it reads as a deliberate, narrow addition, not silent divergence from the live pattern.

---

## UI/UX Design

***Design System:*** `.context/design/master-design-plan.md` §4.10 (Settings — mockup gate lifted 2026-07-30), frozen tokens in `.context/design/master-design-plan.md` §2. Screen: `.context/designs/bunkai-test-management-tool/bk-85-account-settings/settings-tokens.html`.

### Components

***Reused (no changes):***

- `Card`, `CardHeader`, `CardContent` (`@components/ui/card`) — list container, matching `WorkspacesList.tsx`'s structure.
- `Badge` (`@components/ui/badge`) — scope chips, count chip.
- `Button` (`@components/ui/button`) — `primary` (New token / Create token / Confirm), `ghost` (Revoke / Cancel), `danger` (Revoke confirm) variants already exist, no new variant needed.
- `Input`, `Label` (`@components/ui/input`, `@components/ui/label`) — token name field.
- `AccessTokenScope`, `ALLOWED*PAT*SCOPES` (`@lib/api/pat`) — reused for the 4 fixed scope checkboxes instead of re-declaring the enum (DRY; both are plain const/type exports with no server-only side effects, so importing them into a client component is safe — the module's functions like `mintPat`/`assertTokenIssuanceAuthorized` are simply unreferenced and tree-shaken out).

***New (this story):***

- 🆕 `TokensList` (`components/settings/TokensList.tsx`, client) — Card with header (title, active-count `Badge`, "New token" `Button` that opens `IssueTokenModal`) + body switching on `resolveTokensViewState` (`error` / `empty` / `list`). List rows: name + `PAT-<id>` (token prefix), scope chips, workspace cell, created date, expiry cell, action cell (Revoke button or revoked note). Exports a `TokensListSkeleton` sibling, mirroring `WorkspacesList`'s pattern.
- 🆕 `IssueTokenModal` (`components/settings/IssueTokenModal.tsx`, client) — two-step dialog: ***Step 1**** (name input, 4 scope checkboxes, optional workspace select, optional expiry select, Create button gated by `canSubmitIssueForm`); ****Step 2*** (secret reveal: warning banner, secret box with copy button, "Done — I stored it"). Owns its own `open` state; parent (`TokensList`) renders it once and toggles visibility, so the secret never round-trips through a parent re-render after Step 2 closes.
- 🆕 `RevokeTokenModal` (`components/settings/RevokeTokenModal.tsx`, client) — single-step `alertdialog`, named token + prefix interpolated into the mockup's exact copy (Decision 2), danger Confirm.

### Wireframe

```
Settings > Tokens
┌───────────────────────────────────────────────────────────┐
│ Personal access tokens                                    │
│ Authenticate the Bunkai CLI and your CI against your acct. │
├───────────────────────────────────────────────────────────┤
│ [icon] Your tokens   [3 active]           [+ New token]   │
├───────────────────────────────────────────────────────────┤
│ Token        Scopes         Workspace   Created  Expires  │
│ ci-deploy    atc:read       UPEX Core   06-12    09-10  [Revoke]
│ PAT-007      run:execute    WS-001                          │
│ local-cli    atc:read/write All wksp.   03-28    never   [Revoke]
│ PAT-004                                                     │
│ old-laptop¬  atc:read       All wksp.   —        —       revoked 04-15
│ PAT-002 [revoked]  (grayed, strikethrough)                   │
├───────────────────────────────────────────────────────────┤
│ (i) Secrets shown once. Use BUNKAI_TOKEN / bunkai auth ...  │
└───────────────────────────────────────────────────────────┘
```

### States

- ***Loading***: `TokensListSkeleton` — per-row skeleton bars, no global spinner; "New token" is not rendered until data resolves (mirrors `WorkspacesListSkeleton`).
- ***Empty*** (AC8): icon + "No personal access tokens" + explanatory copy ("Tokens let the Bunkai CLI and your CI act as you without your password...") + primary "Issue your first token" CTA opening `IssueTokenModal` directly.
- ***Error***: "We couldn't load your tokens" + retry `Button` calling `router.refresh()` (same recovery pattern as `WorkspacesList`'s `workspaces-retry`).
- ***List*** (1+ tokens): table rows as above, active tokens actionable, revoked tokens inert per Decision 1.
- ***Secret-revealed*** (transient, inside `IssueTokenModal` Step 2): warning panel + secret box + Copy.

### Data-testid convention

Mirrors `WorkspacesList`'s convention (`workspaces-list`, `workspaces-empty`, `workspaces-retry`, `workspace-row-{slug`}):

`tokens-list`, `tokens-empty`, `tokens-error`, `tokens-retry`, `tokens-rows`, `token-row-{id`}, `token-revoke-{id`}, `issue-token-open`, `issue-token-modal`, `issue-token-name`, `issue-token-scope-{scope`}, `issue-token-create`, `issue-token-secret`, `issue-token-copy`, `issue-token-done`, `revoke-token-modal`, `revoke-token-confirm`, `revoke-token-cancel`.

---

## Types & Type Safety

- `AccessTokenScope`, `ALLOWED*PAT*SCOPES` imported from `@lib/api/pat` (already exported, already the server's own source of truth for valid scopes — no redeclaration).
- New local types in `lib/tokens/`: `TokenRow` (id, name, prefix, scopes, workspaceId, workspaceLabel, expiresAt, revokedAt, createdAt), `TokensViewState = 'error' | 'empty' | 'list'` (mirrors `WorkspacesViewState`), `WorkspaceOption` (id, slug, name — for the issuance form's dropdown).
- The Supabase query in `tokens/page.tsx` selects the same column list `GET /api/v1/tokens` already selects (`id, name, scopes, workspace*id, token*prefix, expires*at, revoked*at, last*used*at, created_at`) — typed via the generated `Database` type (`@lib/types/supabase`), consistent with `account/page.tsx`.

---

## Content Writing

All copy is either (a) taken verbatim from the mockup (secret warning, revoke dialog, empty-state explanation, footer note — all already domain-appropriate, written for this exact feature) or (b) drawn from the existing AC/scope text (e.g. the AC1 warning "Store this token now — it cannot be retrieved later." is the frozen server-provided `warning` field from the `201` response body, not client-authored copy — `route.ts:103`). No new generic/placeholder copy is introduced.

---

## Implementation Steps

### Step 1: `lib/tokens/view-state.ts` — list view-state resolver

***Task:*** Pure function `resolveTokensViewState({ error, rowCount }): 'error' | 'empty' | 'list'`, identical shape to `resolveWorkspacesViewState` (`lib/account/workspaces.ts:76`).

***Testing:*** Unit tests mirroring `lib/account/workspaces.test.ts` — error takes priority over empty; 0 rows → empty; 1+ rows → list.

***Estimated time:*** 20 min.

### Step 2: `lib/tokens/format.ts` — display formatting

***Task:*** Pure functions for: (a) expiry cell — `formatExpiryCell(expiresAt, now)` → {{{ label: 'never' | ISO date, isExpiringSoon: boolean }}} (blocked-signal threshold: expiring within 7 days, matching the mockup's `release-bot` example "expires in 2 days"); (b) workspace cell — `formatWorkspaceCell(workspaceId, workspaceLabel)` → "All workspaces" when null, else "`{name`} / `{id`}"; (c) issuance-form expiry choice labels — `formatExpiryChoiceDate(days, now)` → the computed target date shown next to each fixed choice (30/90/365 days).

***Edge cases handled:*** `expires*at` null (never expires), `expires*at` in the past (already-expired row — still rendered, not specially treated beyond the date itself, since expired-but-not-revoked is a valid, if unusual, state the API can return), `workspace_id` null (global token).

***Testing:*** Unit tests per function — boundary at exactly 7 days, null inputs, past-dated expiry.

***Estimated time:*** 45 min.

### Step 3: `lib/tokens/issue-form.ts` — client-side issuance validation gate

***Task:*** Pure function `canSubmitIssueForm({ name, scopes }): boolean` — `true` only when `name.trim().length > 0 && scopes.length > 0`. Mirrors the mockup's `validateIssue()` (lines 1158-1162) and closes AC Scenario 2 client-side (the server's own 422 on an empty `scopes` array, already covered by [https://jira.upexgalaxy.com/browse/BK-126#icft=BK-126](https://jira.upexgalaxy.com/browse/BK-126#icft=BK-126), is the belt-and-suspenders backstop — this function is what disables the Create button before any request is sent).

***Testing:*** Unit tests — empty name, whitespace-only name, no scopes, valid combination.

***Estimated time:*** 15 min.

### Step 4: `lib/tokens/copy-to-clipboard.ts` — clipboard helper with silent fallback

***Task:*** `async function copySecret(text: string): Promise<void>` — attempts `navigator.clipboard.writeText`; catches (or short-circuits when the API is absent) and resolves regardless, per Decision 4. Side-effecting (DOM API), not a pure-logic unit under the Unit Test Authoring Gate — no co-located test required; exercised indirectly by manual QA of AC1's copy affordance.

***Estimated time:*** 15 min.

### Step 5: `app/(app)/settings/tokens/page.tsx` — real server component

***Task:*** Replace the `ComingSoon` placeholder. Async server component reading (a) the caller's tokens (direct `supabase.from('access_tokens').select(...)`, RLS-scoped, same column list `GET /api/v1/tokens` already selects) and (b) the caller's active workspace memberships (same join shape as `account/page.tsx`'s `WorkspacesSection`, narrowed to `{id, slug, name`}) inside one `Suspense`-wrapped async section (`TokensSection`), matching the TD7 isolation pattern already established (a failed query renders the section's own error state, never throws to `error.tsx`).

***Edge cases handled:*** failed query → `error` view-state (caught locally, per `WorkspacesSection`'s `catch` pattern); zero workspaces → issuance form's workspace select still renders with only the "All workspaces" default option.

***Testing:*** No new pure logic here (thin server component); covered by the manual AC walkthrough in Step 8 and by the existing route-level tests (BK-120-133) that the page's fetch/mutation calls exercise indirectly.

***Estimated time:*** 40 min.

### Step 6: `components/settings/TokensList.tsx`

***Task:*** Client component rendering the Card, header (title, active-count badge computed as `tokens.filter(t => !t.revokedAt).length`, "New token" button), and body per `resolveTokensViewState`. Renders `IssueTokenModal` and `RevokeTokenModal` once each (not per-row), driven by local `issueOpen` / `revokeTarget` state. On successful issue or revoke, closes the relevant modal and calls `router.refresh()` — the same "no full page reload" recovery mechanism `WorkspacesList`'s retry button already uses (a Next.js soft refresh re-runs the server component and re-renders with fresh data; it is not a browser navigation/reload, satisfying AC Scenario 7's "without a full page reload").

***Edge cases handled:*** empty state (AC8), error state, revoked-row rendering (Decision 1), expiring-soon chip (Step 2's `isExpiringSoon`).

***Testing:*** No new pure logic beyond what Steps 1-2 already unit-test; this component is the consumer, verified via the manual AC walkthrough (Step 8).

***Estimated time:*** 1h 30min.

### Step 7: `components/settings/IssueTokenModal.tsx` + `components/settings/RevokeTokenModal.tsx`

***Task:*** `IssueTokenModal` — Step 1 form (name `Input`, 4 scope checkboxes from `ALLOWED*PAT*SCOPES`, workspace `<select>` from the prop list, expiry `<select>` with computed date labels from Step 2's `formatExpiryChoiceDate`), Create button disabled via `canSubmitIssueForm`; on submit, `POST /api/v1/tokens` with {{{ name, scopes, workspace*id?, expires*in_days? }}}; on non-2xx, `toast.error(body.error.message)` verbatim (covers AC3/AC4 surfacing — the 422/403 logic itself already exists server-side) and stays on Step 1; on `201`, moves to Step 2 (secret reveal, warning copy per AC1, secret box + Copy via Step 4's `copySecret`, "Done — I stored it" closes + triggers the parent's `router.refresh()`).

`RevokeTokenModal` — `alertdialog` with Decision 2's exact copy; on confirm, `DELETE /api/v1/tokens/{id`}; on `204`, `toast.success('Token revoked')` + close + parent `router.refresh()`; on non-2xx (404 — already-revoked or a stale id), `toast.error(body.error.message)` and close without refreshing (nothing changed server-side).

***Edge cases handled:*** double-submit while a request is in flight (disable Create/Confirm during the request, matching `StartRunButton`'s `submitting` guard); Escape-to-close + focus-return via the shared `useModalDismiss` hook from Decision 7.

***Testing:*** No new pure logic beyond Steps 1-4; verified via the manual AC walkthrough (Step 8). The fetch/response-handling branches exercise the already-tested server behavior ([https://jira.upexgalaxy.com/browse/BK-120#icft=BK-120](https://jira.upexgalaxy.com/browse/BK-120#icft=BK-120), [https://jira.upexgalaxy.com/browse/BK-123#icft=BK-123](https://jira.upexgalaxy.com/browse/BK-123#icft=BK-123), BK-126-129, [https://jira.upexgalaxy.com/browse/BK-122#icft=BK-122](https://jira.upexgalaxy.com/browse/BK-122#icft=BK-122), [https://jira.upexgalaxy.com/browse/BK-125#icft=BK-125](https://jira.upexgalaxy.com/browse/BK-125#icft=BK-125), [https://jira.upexgalaxy.com/browse/BK-131#icft=BK-131](https://jira.upexgalaxy.com/browse/BK-131#icft=BK-131), [https://jira.upexgalaxy.com/browse/BK-132#icft=BK-132](https://jira.upexgalaxy.com/browse/BK-132#icft=BK-132)) end-to-end.

***Estimated time:*** 2h 30min.

### Step 8: Integration — manual AC walkthrough on staging

***Task:**** Walk all 8 AC scenarios end-to-end against a real staging session (member + admin/owner fixtures, per `.env` `QA*E2E*USER_**` credentials).

***Flow:***

1. Empty state → issue first token (AC8, AC1).
2. Attempt issuance with no scopes selected → Create stays disabled, no request sent (AC2).
3. Issue a `workspace:admin` token as a `member`-role user in a workspace → 403 surfaced verbatim (AC4).
4. Issue a `workspace:admin` token as an `admin`/`owner` → succeeds (AC4 positive path).
5. List renders scopes/workspace/created/expires, no secret anywhere in the DOM or network tab (AC5).
6. Revoke an active token → confirm dialog exact copy, row flips to revoked treatment without a full page reload (AC7), a subsequent call using that token's bearer form returns 401 (already covered by [https://jira.upexgalaxy.com/browse/BK-133#icft=BK-133](https://jira.upexgalaxy.com/browse/BK-133#icft=BK-133), spot-checked here).
7. Confirm a foreign token id cannot be revoked via the UI (not reachable through normal navigation, but spot-check the DELETE call shape matches BK-131's 404 contract).

***Testing:*** E2E manual walkthrough per the 17 previously UI-deferred ATP outlines (now unblocked — [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) is Ready For QA) — QA executes and updates the ATP/ATR fields; authoring those formal TCs is QA's own workflow, outside this dev plan's scope.

***Estimated time:*** 45 min (dev-side smoke pass before handoff to QA).

---

## Unit Test Authoring Gate

Per this skill's mandatory Stage 2 gate, every pure-logic unit introduced gets a co-located test ***before*** the surrounding UI is wired up:

| ***Module**** | ****Pure function(s)**** | ****Test file*** |
| --- | --- | --- |
| `lib/tokens/view-state.ts` | `resolveTokensViewState` | `lib/tokens/view-state.test.ts` |
| `lib/tokens/format.ts` | `formatExpiryCell`, `formatWorkspaceCell`, `formatExpiryChoiceDate` | `lib/tokens/format.test.ts` |
| `lib/tokens/issue-form.ts` | `canSubmitIssueForm` | `lib/tokens/issue-form.test.ts` |

Explicitly ***not*** re-tested here (already covered, this story does not touch them): `assertTokenIssuanceAuthorized`, `assertNoGlobalAdminScope`, `mintPat` (`lib/api/pat.test.ts`, [https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135)/ADR-0005). `lib/tokens/copy-to-clipboard.ts` is side-effecting (DOM Clipboard API) and out of scope for the gate, per the gate's own pure-logic-only criterion.

---

## Dependencies

- [x] `app/api/v1/tokens/route.ts` (POST/GET) — shipped, tested.
- [x] `app/api/v1/tokens/[id]/route.ts` (DELETE) — shipped, tested.
- [x] `lib/api/pat.ts` role-gate — shipped, tested ([https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135)/ADR-0005).
- [x] [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) Settings shell + `/settings` layout guard — Ready For QA, already covers `/settings/tokens` (no new guard needed).
- [x] Mockup `settings-tokens.html` — delivered 2026-07-30, resolves all open PO/UX questions (Technical Decisions 1-4).
- [ ] None blocking — no pre-requisite is outstanding.

---

## Risks & Mitigations

> ***WARNING:**** ****Risk 1 — Review Workload Forecast comes back High*** (see block below). Mitigation: this plan does not invent a chain strategy; it surfaces the forecast and defers the chained-PR decision to `/git-flow-master` (Step 4) at the Stage 1→2 boundary, as the gate requires.

***Risk 2:*** The issuance form's workspace dropdown depends on the caller's active memberships; a user in zero workspaces still needs a usable form.

- ***Impact:*** Low
- ***Mitigation:*** the select always includes the "All workspaces" default option regardless of membership count (Step 5's edge case).

***Risk 3:*** `router.refresh()` after revoke could show a stale row for a moment if Supabase read-after-write consistency lags.

- ***Impact:*** Low
- ***Mitigation:*** the DELETE route already returns `204` only after the `revoked_at` update commits (`route.ts:30-46`); `router.refresh()` is issued after the `204` resolves, not optimistically.

---

## Estimated Effort

| ***Step**** | ****Time*** |
| --- | --- |
| 1. `lib/tokens/view-state.ts` + test | 20 min |
| 2. `lib/tokens/format.ts` + test | 45 min |
| 3. `lib/tokens/issue-form.ts` + test | 15 min |
| 4. `lib/tokens/copy-to-clipboard.ts` | 15 min |
| 5. `tokens/page.tsx` | 40 min |
| 6. `TokensList.tsx` | 1h 30min |
| 7. `IssueTokenModal.tsx` + `RevokeTokenModal.tsx` | 2h 30min |
| 8. Manual AC walkthrough | 45 min |
| ***Total**** | ****~7h 10min*** |

***Story points:*** 5 (matches `story.md`).

---

## Definition of Done Checklist

- [ ] All 8 Acceptance Criteria scenarios pass (Step 8 walkthrough).
- [ ] `lib/tokens/view-state.ts`, `format.ts`, `issue-form.ts` each have a co-located, passing test file (Unit Test Authoring Gate).
- [ ] No new backend code — `app/api/v1/tokens*` untouched; existing tests (`lib/api/pat.test.ts`) still green.
- [ ] `bun run types:check` clean (no `next build` — Critical Rule #17).
- [ ] Lint clean.
- [ ] Revoked-row, empty, loading, and error states all reachable and visually match Technical Decision 1 / the mockup's states strip.
- [ ] Secret never appears in a `console.log`, URL, or persisted client state beyond `IssueTokenModal`'s own local Step-2 state.
- [ ] Deployed to staging; QA unblocked to execute the 17 previously-deferred UI ATP outlines.

---

## Review Workload Forecast

Estimated: 1300 additions + 35 deletions = 1335 total lines
400-line budget risk: High
Chain strategy: pending
Decision trace: n/a (not yet resolved — risk is High, decision deferred to /git-flow-master per gate)
Decided by: n/a
Decision needed before apply: Yes

***Per-file basis*** (new files ×1.5, modified ×1.0, +20% tests/docs buffer per `workload-forecast.md`):

| ***File**** | ****Op**** | ****Base est.**** | ****Weighted*** |
| --- | --- | --- | --- |
| `app/(app)/settings/tokens/page.tsx` | Modified | 85 | 85 |
| `components/settings/TokensList.tsx` | New | 175 | 262 |
| `components/settings/IssueTokenModal.tsx` | New | 200 | 300 |
| `components/settings/RevokeTokenModal.tsx` | New | 85 | 127 |
| `lib/tokens/view-state.ts` + test | New | 45 | 67 |
| `lib/tokens/format.ts` + test | New | 120 | 180 |
| `lib/tokens/issue-form.ts` + test | New | 43 | 64 |
| `lib/tokens/copy-to-clipboard.ts` | New | 18 | 27 |

This is a mostly-new, single-page feature (1 rewritten page + 3 new components + 3 new lib modules + 3 test files) with two non-trivial dialogs (a 2-step form and an alertdialog) — the honest estimate crosses the 400-line reviewer budget. Per `workload-forecast.md`'s gate rule, `Chain strategy` is left `pending` and no `Decision trace` is invented here; the Stage 1→2 boundary hands this off to `/git-flow-master` (Step 4 — chained-PR decision tree) before implementation starts.

---
_Synced from Jira by sync-jira-issues_
