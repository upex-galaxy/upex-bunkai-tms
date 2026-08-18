# BK-90 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

# Implementation Plan: STORY-BK-90 - TMS-Workspace | Leave a workspace

## Overview

Add a self-service "Leave workspace" action to `/settings/workspaces` (BK-89's read-only list). No self-removal capability exists today — only `workspace*members*delete_admin` (migration `0005`), letting an admin/owner remove OTHER members. This story adds the self-removal capability, the count-based owner guard, a PAT cascade, and the confirm-to-leave UI.

***Acceptance Criteria to satisfy*** (corrected per the 2026-07-31 ratification comments — see Technical Decisions):

1. Scenario 1 (refined) — confirm dialog names workspace; membership removed; active workspace falls back per BR-1.
2. Scenario 2 (refined) — sole owner blocked with an explanatory lock, not just a disabled button.
3. New Scenario A — ***superseded wording***: leaving the user's only workspace is BLOCKED (action doesn't render), NOT redirected to `/onboarding` as the stored field text still says.
4. New Scenario B — no cascade on authored content; PAT revocation is a separate, confirmed side effect, not part of this guarantee.
5. New Scenario C — a co-owner can leave when ≥1 other active owner remains.

---

## Technical Approach

***Chosen:*** A new SECURITY DEFINER RPC, `bunkai*leave*workspace(p*workspace*id uuid)`, following the `bunkai*bootstrap*workspace` (migration `0006`) precedent for an atomic multi-step workspace transaction. In one transaction it: validates active membership, applies the last-membership guard, applies the count-based owner guard, deletes the caller's `workspace_members` row, soft-revokes the caller's workspace-scoped PATs. A thin `DELETE /api/v1/workspaces/{id}/membership` route wraps it, session-only (mirrors `DELETE /api/v1/tokens/[id]`'s bearer-rejection).

***Alternatives considered:***

- RLS-policy-only self-removal (`workspace*members*delete*self`): rejected — a bare DELETE policy can't atomically cascade the PAT revocation, can't distinguish `sole*owner`/`last*membership`/`not*a_member` as separate client-branchable errors, and reintroduces a check-then-delete race a single transaction avoids.
- Client-guard-only, unconditional DELETE: rejected — Scope requires the sole-owner guard "enforced server-side."

***Why:*** ✅ Matches this repo's one existing multi-row-workspace-transaction precedent. ✅ Distinct custom SQLSTATEs let the route branch cleanly. ❌ Trade-off: one more migration + RPC wrapper + route vs. a single RLS line — accepted for atomicity + server-enforcement requirement.

---

## Technical Decisions

> Decisions 1-4 ratified 2026-07-31 by the PO (Jira comments on [https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90](https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90)), cited verbatim. Decision 5-6 are this plan's own.

### Decision 1: Multi-owner gate is count-based, not identity-based (RATIFIED)

***Chosen:*** Any `role='owner'` member may leave IF ≥1 other active `role='owner'` row remains afterward. No ownership-transfer sub-flow in scope.

***Source (Ely, 7/31/2026 1****:07:****35 PM):*** "Multi-owner gate: count-based ('are you the LAST remaining owner'), not identity-based. Any member with `role='owner'` can leave as long as at least one other active owner remains. No ownership-transfer sub-flow in this story's scope. New Scenario C confirmed as written."

`bunkai*is*workspace*owner(ws*id)` is already a row-level role check, not a comparison against `workspaces.owner*user*id` — multiple owner rows already possible today. `owner*user*id` stays untouched (creation-time "creator of record" audit field, decoupled from the RBAC owner set, per the same comment).

### Decision 2: Leaving your only workspace is BLOCKED, not redirected (RATIFIED — supersedes stored AC wording)

***Chosen:*** With exactly one active membership, the Leave action does not render at all — no dialog, no message.

***Source (Ely, 7/31/2026 1****:11:****15 PM, "Correction to the previous comment — mockup takes precedence"):*** "Leaving your only workspace: the mockup's `state:single-workspace` panel explicitly says 'The Leave action doesn't render — leaving your only workspace would strand the account.' This is a block ..., not a redirect to `/onboarding`. ... New Scenario A is superseded by this."

This reverses an earlier same-day comment (1:07:35 PM) that had said "route to `/onboarding`" — explicitly superseded per Critical Rule #15 (shipped mockup outranks the earlier practice-exercise recommendation). `acceptance-criteria.md`***'s stored New-Scenario-A text is stale*** — this plan implements the corrected, blocked behavior. Flagged (Risk 3 below), not silently fixed in the Jira field by this plan.

### Decision 3: Workspace-scoped PATs auto-revoke in the same transaction (RATIFIED)

***Chosen:*** `UPDATE access*tokens SET revoked*at = now() WHERE user*id = auth.uid() AND workspace*id = <left*ws*id> AND revoked_at IS NULL`, inside the leave RPC's transaction.

***Source (Ely, 7/31/2026 1****:07:****35 PM):*** "Workspace-scoped PATs on leave: auto-revoked in the same transaction as the membership delete ... Split out as its own assertion, distinct from New Scenario B's 'no cascade on authored content' guarantee." Untouched by the later correction comment — stands as ratified. Reuses BK-88's exact `access*tokens.revoked*at` mechanism (migration `0008`), no new column.

### Decision 4: Confirmation UX is type-to-confirm (RATIFIED — supersedes earlier "simple dialog" recommendation)

***Chosen:*** The Leave button in the confirm modal stays disabled until the user types the workspace's exact name.

***Source (Ely, 7/31/2026 1****:11:****15 PM):*** "Confirmation UX: the mockup uses a type-to-confirm pattern ..., not the simple confirm/cancel dialog the role-played 'Design' answer recommended. Following the mockup: type-to-confirm, matching its tested implementation exactly."

Supersedes the 2026-06-10 role-played "Design" answer (simple confirm/cancel), which was explicitly disclaimed as a practice exercise. Mockup (`settings-workspaces.html` lines 881-897, 917-948) is unambiguous: `#lv-input` gates `#lv-confirm[disabled]` via exact string match against `data-ws`.

### Decision 5: Dedicated SECURITY DEFINER RPC, not RLS-only (this plan)

Same reasoning as Technical Approach above. Custom errcodes follow this repo's established `45xxx` convention (migrations `0015`, `0018`, `0021`, `0024`, `0026`); current max in use as of this plan is `45211` (`grep -rhoE "errcode = '4[0-9]{4}'" supabase/migrations/*.sql | sort -u`) — re-verify at implementation time, tentatively take `45212`/`45213`.

### Decision 6: Leave action is opt-in on the shared `WorkspacesList`, not default-on (this plan)

***Discovery:*** `components/settings/WorkspacesList.tsx` (built by [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87)) is rendered from TWO call sites: `settings/account/page.tsx` (BK-87's summary widget) and `settings/workspaces/page.tsx` (BK-89's dedicated page) — same component, same `WorkspaceRow[]` shape.

***Chosen:*** Add `enableLeaveAction?: boolean` (default `false`); only `settings/workspaces/page.tsx` passes `true`. `settings/account/page.tsx` is untouched.

***Why:*** Scope explicitly scopes the action to "the Workspaces section," not the Account summary; avoids an unreviewed behavior change on a page this story doesn't budget QA for. Trade-off: the two call sites diverge slightly — already-accepted precedent, since their data-fetching (`WorkspacesSection`) is already duplicated, not shared, by design.

---

## AC → Implementation Step Mapping

| ***Scenario**** | ****ATP Outline**** | ****Step(s)*** |
| --- | --- | --- |
| Scenario 1 (refined) | Positive #1, Integration #1 | 2 (RPC), 4 (route), 6 (modal), 7 (list wiring + active-ws re-resolution) |
| Scenario 2 (refined) | Negative #1 | 1 (owner-count query), 2 (RPC sole-owner guard), 5 (fetch wiring), 7 (locked-note UI, verbatim mockup copy) |
| New Scenario A (***corrected:**** ****block, not redirect***) | Boundary #1 (re-read against the correction) | 2 (RPC last-membership guard, defense-in-depth), 7 (hide action entirely when `workspaces.length === 1`) |
| New Scenario B | Positive #3 | No code step — FK-scoped content already survives untouched. Step 8 adds an explicit DoD regression check so QA verifies rather than assumes it. |
| New Scenario C | Positive #2 | 2 (RPC count-based guard), 5 (owner-count fetch), 7 (list wiring) |
| Integration — active-ws re-resolution per BR-1 | Integration #1 | 4 (route re-runs `resolveActiveWorkspaceId` / `bk*active*ws` after a successful leave) |

---

## Backend Design

***Migration*** `0042*leave*workspace.sql` (next after `0041*run*project*report.sql`): `bunkai*leave*workspace(p*workspace*id uuid) returns void`, `language plpgsql security definer set search*path = ''` (matches every existing helper/RPC). Logic, one transaction:

1. `v*user*id := auth.uid()`; raise `not_authenticated` (`42501`) if null.
2. Look up caller's `role` for `(p*workspace*id, v*user*id)` where `status='active'`; raise `not*a*member` if no row (defense-in-depth — UI never offers Leave for a workspace the caller can't see, but the RPC must not trust the client; avoids an existence-oracle by not distinguishing "doesn't exist" from "not a member").
3. Count caller's total active memberships; if `<= 1`, raise `last_membership` (Decision 2's server-side backstop — tentative errcode `45212`).
4. If `v*role = 'owner'`: count OTHER active owners in the same workspace; if `0`, raise `sole*owner` (Decision 1 — tentative errcode `45213`).
5. `DELETE FROM workspace*members WHERE workspace*id = p*workspace*id AND user*id = v*user_id`.
6. `UPDATE access*tokens SET revoked*at = now() WHERE user*id = v*user*id AND workspace*id = p*workspace*id AND revoked_at IS NULL` (Decision 3, verbatim).

Grants mirror `0006`/`0005`: revoke from `public, anon`; grant `execute` to `authenticated`.

***Edge case — concurrent co-owner leaves:*** two co-owners leaving near-simultaneously could both pass the count check before either commits (read-committed snapshot). Accepted, documented in the function comment, flagged as a possible future `SELECT ... FOR UPDATE` hardening — out of scope; Scope's requirement is "enforced server-side," not "fully serialized."

`lib/supabase/rpc.ts`***:*** add `leaveWorkspace(supabase, { workspaceId })` → `supabase.rpc('bunkai*leave*workspace', { p*workspace*id: workspaceId })`, alongside `bootstrapWorkspace` (same {{{ data, error }}} passthrough).

`DELETE /api/v1/workspaces/{id}/membership` (new sub-resource, distinct from the existing `[id]/route.ts` so it doesn't collide with future admin member-management surface):

- Reject `principal.via === 'bearer'` (`forbidden`) — mirrors `tokens/[id]/route.ts`'s exact precedent.
- Zod-validate {{{ id }}} as UUID.
- Call `leaveWorkspace`; map errors: `not*authenticated}}→401, {{not*a*member}}→404, {{last*membership}}→409, {{sole_owner}}→409 (matches {{app/api/v1/modules/[id]/route.ts`'s `error.code === '<sqlstate>'` branching convention).
- On success: if the current `ACTIVE*WORKSPACE*COOKIE` value equalled the just-left `id`, re-run `resolveActiveWorkspaceId(null, remainingWorkspaceIds)` (fresh query, `joined_at`-ordered per BR-1) and set the new cookie on the response. Return `200` with {{{ newActiveWorkspaceId, newActiveWorkspaceName }}} (both `null` if the left workspace wasn't active) so the client's live-region announcement needs no second round trip.

---

## Frontend Design

Per Critical Rule #14 (Live-UI-First), the LIVE `WorkspacesList.tsx` (BK-89's 4-column grid) is the fidelity baseline, not the mockup's 5-column table (which also has a "Since" column [https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89](https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89) never built — pre-existing gap, out of this story's scope). This story adds a 5th "Actions" grid column matching the mockup's action semantics only.

***Reused as-is:*** `lib/hooks/use-modal-dismiss.ts` ([https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88), no changes needed — content-agnostic); `components/settings/RevokeTokenModal.tsx`'s structural convention (overlay, `role="alertdialog"`, `aria-labelledby`/`aria-describedby`, submitting-state disables everything, toast-on-error); `lib/account/role-label.ts`; `lib/workspaces/active.ts` (`resolveActiveWorkspaceId`, unchanged signature); `lib/api/workspace-cookie.ts` (`bk*active*ws`).

***New:*** `components/settings/LeaveWorkspaceModal.tsx` — props {{{ workspace: { id, name, isActive } | null, onClose, onLeft }}}, mirrors `RevokeTokenModal` plus a controlled `typedValue` input. Confirm button `disabled` until `typedValue.trim() === workspace.name` (exact match). Copy verbatim from mockup (`#leave-overlay`):

- Title: "Leave workspace"
- Body: `You are about to leave {name} ({id}). You lose access to its test cases and runs immediately. To come back, an admin must invite you again.`
- Conditional (only if `workspace.isActive`): "This is your active workspace — after leaving, the next one on your list becomes active."
- Label: "Type the workspace's exact name to confirm:" · Cancel: "Cancel" · Confirm (danger, disabled-until-match): `Leave {name`}

On success (200): read {{{ newActiveWorkspaceId, newActiveWorkspaceName }}}, build the live-region message (`You left {name}.` + conditional `{newActiveWorkspaceName} is now your active workspace.`, mirrors mockup's `msg` logic), call `onLeft(message)`, `router.refresh()`.

***New:*** `lib/account/leave-workspace.ts` — pure `isLeaveConfirmEnabled(typed, workspaceName)` extracted so the match-gate is unit-testable without mounting the modal.

`WorkspacesList.tsx` ***extension:*** new `enableLeaveAction?: boolean` prop (default `false`); when `true`, a 5th grid cell per row: `workspaces.length === 1` → nothing renders (Decision 2); `row.isSoleOwner` → `locked-note` "Can't leave" + `locked-why` "You're its only owner. Ownership transfer isn't available yet." (verbatim, mockup lines 761-764); else → ghost "Leave" button opening the modal. One shared `<div aria-live="polite">` at the list level (not per-modal) receives the success message. When `enableLeaveAction` is `false`, rendering is byte-identical to today.

`lib/account/workspaces.ts`***:*** new `countActiveOwnersByWorkspace` (sibling of existing `countActiveMembersByWorkspace`); `WorkspaceRow` gains `isSoleOwner: boolean`; `buildWorkspaceRows` takes a new `ownerCounts` param.

`settings/workspaces/page.tsx`***:*** add the owner-count query to the existing `Promise.all`; pass `enableLeaveAction={true`}. `settings/account/page.tsx` is NOT touched (Decision 6).

---

## Implementation Steps

1. ***Owner-count aggregate + pure-function tests*** (`lib/account/workspaces.ts`) — `countActiveOwnersByWorkspace`, `buildWorkspaceRows` extended with `isSoleOwner`. ~1h.
2. ***Migration**** `0042*leave*workspace.sql` — RPC per Backend Design. No SQL unit-test harness exists in this repo (confirmed: no pgTAP); verified via Step 4's route test + staging smoke, matching every other `bunkai_**` RPC's precedent. ~2h.
3. `lib/supabase/rpc.ts` ***wrapper*** — `leaveWorkspace`. ~15min.
4. `DELETE /api/v1/workspaces/{id}/membership` ***route + OpenAPI sibling*** — per Backend Design; route test covers bearer-rejection, 404, both 409s, happy path (active + non-active workspace). ~2h30min.
5. ***List data-fetching wiring*** (`settings/workspaces/page.tsx` only) — owner-count query, `enableLeaveAction={true`}. ~45min.
6. `LeaveWorkspaceModal` ***+*** `isLeaveConfirmEnabled` per Frontend Design, table-driven unit test (exact match/partial/case-mismatch/whitespace-trim/empty). ~2h.
7. `WorkspacesList.tsx` ***Actions column + modal wiring*** — per Frontend Design. ~1h30min.
8. ***DoD regression note for New Scenario B*** — no code; adds an explicit checklist item so PAT-revocation and no-cascade-on-content are verified as two DISTINCT assertions, not conflated. 0h.

---

## Dependencies

- [x] [https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89](https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89) merged (`Ready For QA`) — the shared `WorkspacesList.tsx` / `settings/workspaces/page.tsx` already exists on `staging`.
- [x] BK-88's `access*tokens.revoked*at` mechanism (migration `0008`).
- [x] BK-52's `resolveActiveWorkspaceId` / `bk*active*ws` (`lib/workspaces/active.ts`, `lib/api/workspace-cookie.ts`).
- [ ] Re-confirm the next two free custom `45xxx` codes at implementation time (tentatively `45212`/`45213`).

---

## Risks & Mitigations

***Risk 1 — concurrent co-owner leave race:*** Low impact (narrow timing window; documented, accepted, not blocking — see Backend Design edge case).

***Risk 2 — shared**** `WorkspacesList` ****leaking the Leave action onto**** `/settings/account`****:*** Medium impact (scope violation, unreviewed UX change). Mitigation: Step 5 explicitly excludes that page; DoD includes an explicit "unchanged" smoke check.

***Risk 3 — stale**** `acceptance*criteria` ****field text:*** Medium impact — the field's stored "New Scenario A" still says "routes to `/onboarding`," diverging from the ratified, mockup-backed correction (Decision 2). Mitigation: this plan documents the correction with full citation (not this plan's job to edit the Jira field); recommend the team update `acceptance*criteria` before QA authors the final ATP so the drift doesn't propagate.

---

## Estimated Effort

| ***Step**** | ****Time*** |
| --- | --- |
| 1. Owner-count aggregate + tests | 1h |
| 2. Migration — RPC | 2h |
| 3. `rpc.ts` wrapper | 15min |
| 4. Route + tests | 2h30min |
| 5. List data-fetching wiring | 45min |
| 6. Modal + match-gate test | 2h |
| 7. Actions column + wiring | 1h30min |
| 8. DoD note (docs only) | 0 |
| ***Total**** | ****~10h*** |

***Story points:*** 5 (matches `story.md`).

---

## Review Workload Forecast

Estimated: 686 additions + 40 deletions = 726 total lines
400-line budget risk: High
Chain strategy: pending
Decision trace: (empty — risk is High; this plan must not guess a strategy or fabricate a trace)
Decided by: n/a
Decision needed before apply: Yes

***Basis*** (production files only — test files covered by the 20% buffer, not enumerated separately, per the reference doc's own worked examples):

| ***File**** | ****Op**** | ****Base**** | ****Mult.**** | ****Subtotal*** |
| --- | --- | --- | --- | --- |
| `supabase/migrations/0042*leave*workspace.sql` | new | 70 | ×1.5 | 105 |
| `app/api/v1/workspaces/[id]/membership/route.ts` | new | 90 | ×1.5 | 135 |
| `.../route.openapi.ts` | new | 35 | ×1.5 | 52.5 |
| `components/settings/LeaveWorkspaceModal.tsx` | new | 120 | ×1.5 | 180 |
| `lib/account/leave-workspace.ts` | new | 15 | ×1.5 | 22.5 |
| `components/settings/WorkspacesList.tsx` | modify | 50 | ×1.0 | 50 |
| `lib/account/workspaces.ts` | modify | 30 | ×1.0 | 30 |
| `lib/supabase/rpc.ts` | modify | 10 | ×1.0 | 10 |
| `app/(app)/settings/workspaces/page.tsx` | modify | 20 | ×1.0 | 20 |
| Sum ×1.2 |  |  |  | ***605 → 726*** |

Crosses the 400-line budget (new migration + new RPC + new REST route + new OpenAPI registration + a genuinely new modal + list-wiring across two files). Per the gate rule, a High-risk plan emits `pending` + an EMPTY trace rather than a guessed label — left for `/git-flow-master`'s chained-PR decision tree at the Stage 1→2 boundary.

---

## Unit Test Authoring Gate

1. `countActiveOwnersByWorkspace` (`lib/account/workspaces.ts`) — pure, table-driven; sibling of the already-tested `countActiveMembersByWorkspace`.
2. `buildWorkspaceRows` (extended) — add cases to existing `lib/account/workspaces.test.ts`: sole-owner caller → `isSoleOwner: true`; co-owner with another active owner → `false`; non-owner role → `false` regardless of owner-count map.
3. `isLeaveConfirmEnabled` (new `lib/account/leave-workspace.ts`) — table-driven: exact match → enabled; partial/prefix → disabled; case mismatch → disabled; whitespace-trimmed exact match → enabled; empty → disabled.
4. ***Backend guard logic (count-based checks)**** — NOT a standalone TS function; lives inside the PL/pgSQL body. No SQL-unit-test harness exists in this repo (no pgTAP, and no other `bunkai_**` RPC has one) — verified via Step 4's route test (409/404/200 branch coverage) plus staging smoke, matching this codebase's established precedent rather than introducing new test tooling for one function.

---

## Definition of Done Checklist

- [ ] Implemented per this plan.
- [ ] All 5 corrected ACs passing (New Scenario A verified against the CORRECTED block-not-redirect behavior, not the stale field text).
- [ ] New Scenario B regression check executed as TWO distinct assertions: left workspace's content unchanged/inaccessible, AND leaving user's workspace-scoped PATs show `revoked_at` set.
- [ ] `Database['public']['Functions']` regenerated (`bun run types:gen`) after the migration.
- [ ] `/settings/account` confirmed UNCHANGED (Decision 6 / Risk 2).
- [ ] Unit tests written for all items in Unit Test Authoring Gate.
- [ ] Route test covers: bearer-rejection, not-a-member (404), sole-owner (409), last-membership (409), happy path active workspace (200 + cookie mutation), happy path non-active workspace (200, no cookie mutation).
- [ ] Code review approved.
- [ ] `bun run types:check`, `bun run lint:check` clean.
- [ ] Chain-strategy decision resolved (High risk) BEFORE Stage 2 starts.
- [ ] Deployed to staging; manual smoke test: sole-owner lock renders; only-membership row hides the action; co-owner leave succeeds without affecting the other owner; active-workspace re-resolution reflects immediately in global chrome without a manual refresh.

---
_Synced from Jira by sync-jira-issues_
