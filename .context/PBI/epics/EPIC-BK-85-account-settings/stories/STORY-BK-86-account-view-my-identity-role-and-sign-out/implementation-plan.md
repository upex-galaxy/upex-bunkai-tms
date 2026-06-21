# BK-86 — Implementation Plan (Spec Implementation Plan / Dev)

> Story: **Account | view my identity, role, and sign out** · Epic BK-85 · 3 pts
> Stage 1 (Planning) output. Built **live-first**: current running app shell is the source of truth; `app.jsx` mockup is inspiration only.

---

## 0. Live-first reframe (READ FIRST — supersedes the stale shift-left Dev note)

The shift-left thread (2026-06-08) assumed **no global chrome existed** and pointed the account affordance at `Topbar`'s `right` slot. **The live code has moved on.** Verified against the current `staging` branch:

| Shift-left assumption (stale) | Live reality (verified) |
|---|---|
| No persistent shell; `Topbar` instantiated per-page | `app/(app)/layout.tsx` renders a **persistent global `AppSidebar`** on every authenticated route (ADR-0003 app-shell) |
| Account affordance must be built fresh in `Topbar.right` | `AppSidebar` **already has a user block** (`components/layout/AppSidebar.tsx` L322-362): initials chip + email + "Sign out" with toast-on-error + `router.push('/login')` |
| `/me` role missing only on the **cookie** path; bearer path has a `workspace_members` join | After **ADR-0001** unified gateway, `/me` uses ONE RLS-scoped `db` query for both paths and returns **no `role` at all** — the fix is one uniform join, not a cookie-vs-bearer reconciliation |
| Initials source TBD | User block already shows `email[0]` (single char) — must be upgraded to the ratified **2-letter email-local-part** rule |

**Net effect:** BK-86 is **harden + complete the existing `AppSidebar` user block**, not greenfield. The `Topbar.right` slot is a red herring for this story — the live account affordance lives in the sidebar's bottom user block, sitting directly beside the workspace switcher exactly as the Designer's "visually coherent with the workspace control next to it" note intended.

**Genuine gaps vs the ACs (what this story actually builds):**
1. `/me` returns no `role` → add active-workspace role to the response (hard prerequisite).
2. No role label shown in the user-block menu.
3. Menu is a plain `div`+`button` stack — **no ARIA menu semantics** (no `role="menu"`/`menuitem`, `aria-haspopup`/`aria-expanded`, focus-trap, arrow-key nav). Scenario 3 + Group 3 a11y bar unmet.
4. Initials are single-char `email[0]`; ratified rule is **2-letter email-local-part** (`elena@bunkai.io` → "EL").
5. No **no-active-workspace** empty state for the role section.
6. No **redirect-on-`SIGNED_OUT`** handler → cross-tab/multi-device termination (Scenario D) navigates silently in other tabs but does not redirect them.

---

## 1. AC / decision → files map

| AC / Decision | Files | Approach |
|---|---|---|
| **Prereq: `/me` role** (Scenario 1 role, New A) | `app/api/v1/me/route.ts`, `app/api/v1/me/route.openapi.ts` | After resolving `activeWorkspaceId`, add one `db.from('workspace_members').select('role').eq('workspace_id', activeWorkspaceId).eq('user_id', principal.userId).maybeSingle()` (skip when `activeWorkspaceId` null). Add `active_workspace_role: MemberRole \| null` to the response + the zod `MeResponseSchema` (`z.enum(['viewer','member','admin','owner']).nullable()`). Uniform for cookie + bearer — `principal.userId` exists in both (ADR-0001). |
| **Scenario 1** — identity visible on every authed screen | `components/layout/AppSidebar.tsx` (already global via `app/(app)/layout.tsx`) | No new shell. Already rendered on `/projects`, `/projects/[slug]/**`, `/onboarding`, `/workspaces/[id]/**`; `/login` excluded (outside `(app)`). Satisfies ratified scope #2 for free. |
| **Decision #1** — initials from email local-part (2-letter) | `components/layout/AppSidebar.tsx` + new pure helper `lib/account/initials.ts` | New framework-agnostic `emailInitials(email)`: take local-part before `@`, strip `+tag`, split on `.`/`-`/`_`, uppercase first char of first 1-2 tokens; single-token → first 2 alphanumerics; numeric-only → raw chars (EC-1). Replace `email[0]` in the chip. Unit-tested. |
| **Scenario 1 + Decision #8** — role label, capitalized canonical | `components/layout/AppSidebar.tsx` + `lib/account/role-label.ts` | New `roleLabel(role)` = capitalize canonical (`admin`→"Admin"). Render in the open menu under email. Consume `active_workspace_role` from `/me`. |
| **Scenario 1** — only own identity ever shown | (no change) | Server passes only the caller's `userEmail`/role via RLS-scoped `db`; multi-tenant guard is inherent. Covered by assertion test on `/me`. |
| **New Scenario A + Decision #4** — role updates on workspace switch | `components/layout/AppSidebar.tsx` | Role is fetched by the menu from `/me`; `switchWorkspace()` already calls `router.refresh()`. Gate the role re-fetch on that same refresh cycle (EC-2, no separate race) — invalidate cached `/me` on switch so the next menu-open reads fresh role against the new active-workspace cookie. |
| **New Scenario B + Decision #5** — no-active-workspace empty state | `components/layout/AppSidebar.tsx` | When `active_workspace_role` is null (or no active workspace), render role section as short empty copy ("No workspace yet" — Design owns final wording) instead of blank/undefined. |
| **Scenario 2** — sign out ends session + redirect, no back-restore | `components/layout/AppSidebar.tsx` (existing `handleSignOut`), relies on `middleware.ts` | Keep existing `signOut()` → `router.push('/login')` + `router.refresh()`. `supabase.auth.signOut()` already invalidates server-side (refresh token revoked); middleware `getUser()` rejects the stale cookie on the next protected request (assertion-level test, no new mechanism). |
| **New Scenario C + Decision #6** — sign-out failure surfaced, session preserved | `components/layout/AppSidebar.tsx` (existing) | Already implemented: on `{ error }`, `toast.error(...)`, reset `busy`, skip redirect. Verify copy reads clearly ("Could not sign out…"). No retry flow (baseline per ratified #6). |
| **New Scenario D + Decision #3/#7** — multi-tab/device termination | `components/providers/auth-context.tsx` | Add a redirect-on-`SIGNED_OUT` effect: in `onAuthStateChange`, when `_event === 'SIGNED_OUT'`, `router.replace('/login')`. Supabase already broadcasts `SIGNED_OUT` cross-tab via localStorage; the missing piece is the navigation. Guard against redirect on the same tab that already navigated (idempotent). |
| **Scenario 3 + Group 3** — keyboard a11y: focus-trap, arrow-nav, ARIA, Escape, focus-return | `components/layout/AppSidebar.tsx` user block → wrap in `@radix-ui/react-dropdown-menu` | Replace the hand-rolled `userOpen` div/button menu with Radix `DropdownMenu` (already a dependency, currently unused). Free: `role="menu"`/`menuitem`, `aria-haspopup`/`aria-expanded`, focus-trap, arrow-key nav, Escape-to-close, focus-return to trigger. Sign out + (read-only) identity/role rows become `DropdownMenu.Item`/labels. Keep the existing visual tokens (`--bg-1`/`shadow-pop`/`--r-3`) on `DropdownMenu.Content`. |
| **Decision #9 / BR-3** — sign-out not RBAC-gated | (no change) | `signOut()` calls `supabase.auth.signOut()` with zero role checks; correct as-is. |

---

## 2. /me prerequisite — exact change + blast radius

**File:** `app/api/v1/me/route.ts` (+ schema `app/api/v1/me/route.openapi.ts`).

**The join (uniform, both auth paths):**
```ts
let activeWorkspaceRole: MemberRole | null = null;
if (activeWorkspaceId) {
  const { data: membership } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', activeWorkspaceId)
    .eq('user_id', principal.userId)
    .maybeSingle();
  activeWorkspaceRole = (membership?.role as MemberRole) ?? null;
}
// add to response: active_workspace_role: activeWorkspaceRole
```
Same pattern already proven in `app/(app)/projects/[projectSlug]/layout.tsx` (the `canCreate` role lookup). Runs against the RLS-scoped `db`, so it self-narrows to the caller — no admin client, no cross-tenant leak.

**Schema:** add `active_workspace_role: z.enum(['viewer','member','admin','owner']).nullable()` to `MeResponseSchema`; run `bun run api:sync` so the OpenAPI facade + `@schemas/*` types regenerate.

**Blast radius (additive-only, low):**
- `/me` consumers today: `WorkspaceSwitcher.tsx` and `AppSidebar.tsx` both type a **local** `MeResponse` interface and read only `workspaces`/`active_workspace_id` — an added optional field is non-breaking; neither destructures unknown keys.
- PAT/bearer consumers: response gains a field; additive, no contract break. `auth.source`/`scopes` untouched.
- One extra DB round-trip per `/me` call, RLS-scoped + indexed on `(workspace_id, user_id)` PK — negligible. `force-dynamic` already set.
- No migration, no schema change, no new RLS policy (read of own membership row is already permitted by `workspace_members_select_self_or_admin`).

---

## 3. UI plan (live-first)

**Files reused (the actual live shell):**
- `app/(app)/layout.tsx` — already renders `AppSidebar` globally; **no change** (global-chrome requirement already met).
- `components/layout/AppSidebar.tsx` — the live account affordance host. User block (L322-362) is enhanced in place: 2-letter initials, role label, empty state, Radix menu.
- `components/providers/auth-context.tsx` — add the `SIGNED_OUT` redirect effect (cross-tab).
- New pure helpers: `lib/account/initials.ts`, `lib/account/role-label.ts` (framework-agnostic, unit-tested, per Stack §10).
- `@radix-ui/react-dropdown-menu` (existing dep, first use) for the ARIA menu.

**How the menu opens:** the existing user-block button becomes the Radix `DropdownMenu.Trigger` (keeps the initials chip + email + chevron visual). Click or keyboard (`Enter`/`Space`/arrow) opens `DropdownMenu.Content` anchored above the trigger (`side="top"`), styled with the frozen tokens already on the current panel (`bg-surface-1`, `border-stroke-2`, `shadow-pop`, `rounded-3`). Content shows: "Signed in as" + email (label), role label (or "No workspace yet" empty state), then the "Sign out" `DropdownMenu.Item`.

**A11y approach (Group 3 bar):** Radix `DropdownMenu` supplies `role="menu"`/`role="menuitem"`, `aria-haspopup`/`aria-expanded` on the trigger, roving-tabindex arrow-key navigation, focus-trap while open, `Escape`-to-close, and focus-return to the trigger on close — the full ARIA menu pattern the Designer set as the bar, instead of the literal narrow Scenario 3 reading. The workspace switcher is intentionally left as-is (separate control, out of this story's scope per Out-Of-Scope "Workspace switcher UI owned by BK-6"); only the **account** menu gets the ARIA upgrade.

**Design fidelity:** reuse frozen tokens only (DESIGN.md §2 / master-design-plan §2). No new colors/radii/fonts. Initials in `Inter` (prose), neutral chip — no photo-avatar (matches Designer note + "status carries color; nothing else does").

---

## 4. Test plan

Live test setup: **`bun:test`** (`*.test.ts` colocated; DB-touching suites self-skip when Supabase env absent, e.g. `lib/api/rls-parity.test.ts`). No E2E in this skill (out of scope; QA owns Playwright).

- **Pure helpers (unit, no DB):**
  - `lib/account/initials.test.ts` — `elena@bunkai.io`→"EL"; `elena+qa@bunkai.io`→"EL" (+tag stripped); `e@x.io`→"E"/"EX" rule; numeric-only local-part fallback (EC-1); empty/invalid → safe fallback.
  - `lib/account/role-label.test.ts` — `admin`→"Admin", `owner`→"Owner", `viewer`→"Viewer", `member`→"Member"; null → empty-state sentinel.
- **`/me` role (API, DB-gated, self-skip):** signed-in caller gets `active_workspace_role` matching their `workspace_members` row for the active workspace; null when no active workspace (Scenario B); never another user's role (multi-tenant isolation assertion, mirrors `rls-parity.test.ts` pattern); cookie and bearer both populate it.
- **Sign-out server invalidation (assertion-level):** after `signOut()`, a request carrying the prior cookie to a protected route is rejected by middleware `getUser()` and redirected to `/login` (Scenario 2). Back-navigation does not restore (covered by middleware behavior + a route-guard assertion).
- **a11y menu behaviors (component-level):** trigger exposes `aria-haspopup`/`aria-expanded`; open menu has `role="menu"` with `role="menuitem"` children; Escape closes + focus returns to trigger (Scenario 3); focus is trapped while open (EC-6); arrow keys move between items. (Radix-backed; assert the rendered ARIA contract.)
- **Multi-tab termination (Scenario D):** unit-assert the `onAuthStateChange` handler calls `router.replace('/login')` on a `SIGNED_OUT` event (the cross-tab broadcast itself is Supabase-owned; we test our redirect reaction).
- **Sign-out failure (Scenario C):** `signOut()` returning `{ error }` triggers `toast.error` and leaves no redirect / session intact.

> Spec Compliance Matrix (one row per AC scenario) is produced at Stage 3 against this test plan.

---

## 5. Risks / unknowns

- **`/me` blast radius:** additive field, but `bun run api:sync` must regenerate the OpenAPI facade or `@schemas` types drift. Both live `/me` consumers use local interfaces → low risk, but verify after sync. **Mitigation:** types:check + api:sync in verification.
- **Multi-tab / multi-device testing:** the cross-tab `SIGNED_OUT` broadcast is Supabase/localStorage-owned and hard to assert in `bun:test`. We unit-test our redirect reaction only; true 2-tab and 2-device propagation is a manual/Playwright check QA performs on staging (note for the Spec Compliance Matrix as `manual:` evidence).
- **Radix swap regressions:** replacing the hand-rolled menu with Radix changes focus/outside-click/escape handling. The existing `setUserOpen` + `fixed inset-0` overlay + the shared Escape `useEffect` (which also serves `wsOpen`) must be untangled carefully so the workspace switcher's Escape still works. **Surgical:** only the user-block menu migrates; leave `wsOpen` logic intact.
- **Role flicker on switch (EC-2):** mitigated by gating role re-fetch on the existing `router.refresh()` cycle; verify no stale-role frame after switch.
- **Empty-state copy:** "No workspace yet" is placeholder — Design owns final wording (ratified #5). Non-blocking.

**Mockup gems the live UI lacks → future tech-story (do NOT fold in here):**
- Avatar image / `display_name` / profile editing — no schema support (explicitly Out-Of-Scope; backlog a profile-settings story).
- Account-menu extras from the mockup (theme toggle, keyboard-shortcuts entry, account settings deep-link to BK-87's hub) — defer to BK-87 / a chrome-polish tech-story.

---

## 6. Technical Decisions

- **Account affordance lives in `AppSidebar` user block, not `Topbar.right`** — live shell uses the sidebar; this is where the affordance already is. (Live-first override of the stale shift-left placement note. Not ADR-worthy: presentation placement, reversible.)
- **`/me` role via one uniform RLS-scoped join** (not a cookie-vs-bearer reconciliation) — ADR-0001 already unified the paths; honoring it, not violating it. No new ADR.
- **Radix `DropdownMenu` for the ARIA bar** — existing dependency; cheaper + more correct than hand-rolling focus-trap/arrow-nav. Story-local, reversible.

## Review Workload Forecast

Estimated: ~150 additions + ~40 deletions = ~190 total lines
400-line budget risk: **Low**
Chain strategy: **stacked-to-main** (single feature branch `feature/BK-86-account-menu` → staging)
Decision needed before apply: **No**
