# BK-90 — Code Review (Dev-authored, non-Jira)

> Scope: PR1/2 (Slice A — backend RPC + route). PR2 (frontend) gets its own review entry appended here once opened.

## PR1 — Slice A (backend: `bunkai_leave_workspace` RPC + `DELETE /api/v1/workspaces/{id}/membership`)

Independent adversarial review dispatched against `git diff origin/staging..feat/BK-90-leave-backend`.

| # | Severity | Finding | Verdict | Action |
|---|---|---|---|---|
| 1 | MAJOR | `public/openapi.json` (the live, publicly-served spec at `/api/openapi`) was never regenerated despite the new `route.openapi.ts` + its `scripts/openapi-gen.ts` registration — breaks an established convention (prior route additions regenerate + commit this file in the same commit). | legitimate — verified the diff was empty, confirmed the served route reads this file straight off disk. | **Fixed**: ran `bun run openapi:gen`, verified the diff only adds the new endpoint + one legitimate pre-existing gap (BK-89's already-merged `role` field, never regenerated until now) — no leakage from any unmerged concurrent work. Committed `274f8c3`. |
| 2 | MINOR | The route's cookie-mutation branch (`route.ts:45-54`) has no direct test — the 12 tests only exercise the pure helpers (`response.ts`), not the actual `Set-Cookie` decision. | legitimate, but matches a pre-existing repo-wide gap (no `NextRequest`/ctx test harness anywhere, e.g. `me/active-workspace/route.test.ts` has the same limitation) — not a regression introduced by this PR. | **Dismissed as-is** — out of scope to build new test infrastructure for one route; the underlying decision logic (`resolveNewActiveWorkspace`) IS unit-tested. |

**Overall**: `request-changes` → the one blocking item fixed and verified → merged (`6d77b32`).

**Verified clean by the reviewer** (no findings): guard order (last-membership before sole-owner, matches the plan), count-based sole-owner guard (excludes caller, counts others), PAT cascade scope (only the left workspace's tokens), transaction atomicity, `SECURITY DEFINER`/`search_path`/grants, defense-in-depth membership check on an arbitrary `workspace_id`, route error-mapping (exact SQLSTATE match, not fragile string matching), bearer-token rejection ordering, active-workspace re-resolution (correct short-circuit + correct re-query + defensive zero-remaining handling), migration numbering (`0044`, genuinely next-free after discovering `0042`/`0043` were taken by a concurrent worker's unmerged branch), errcode uniqueness (`45212`/`45213`, confirmed unused elsewhere), hand-patched Supabase type shape (matches the established `Returns: undefined` pattern for other void RPCs), test quality (24 real assertions, not tautological).

## PR2 — Slice B (frontend: leave-confirm modal + list wiring)

Independent adversarial review dispatched against `git diff origin/staging..feat/BK-90-leave-frontend` (post-rebase onto PR1's merged tip — diff shows only Slice B's 5 commits).

| # | Severity | Finding | Verdict | Action |
|---|---|---|---|---|
| 1 | MAJOR | `LeaveWorkspaceModal` never moved focus into the dialog on open (missing the mockup's `lvInput.focus()`), which also meant `useModalDismiss`'s Tab-trap never engaged (it only wraps focus already inside the container) — a keyboard user could Tab straight out of the "modal" into the page/other rows' Leave buttons while it was visually open, and activating another row's Leave button from there would swap the mounted modal's target out from under any in-flight request. | legitimate — verified: no `ref`/`autoFocus`/focus-effect existed on the input. | **Fixed**: added `inputRef` + a `useEffect` focusing it on open (keyed on `open`/`workspace?.id`), matching the mockup exactly. Verified `Input` forwards refs. Re-verified lint/types clean. |
| 2 | NIT | The row's grid-column-count ternary was gated only on `enableLeaveAction`, not also on `workspaces.length > 1` (which gates the actual 5th cell) — left a trailing empty grid track + gap on the single-workspace state. | legitimate, cosmetic. | **Fixed**: added the same `workspaces.length > 1` condition to the className ternary. |

**Overall**: `request-changes` → both items fixed, re-verified green → ready to merge.

**Verified clean by the reviewer** (no findings): Decision 2 (block-not-redirect) renders nothing at all for a single-workspace list, not just a disabled control; sole-owner lock UI exact mockup copy with correct precedence vs. the length-gate; `isSoleOwner` computed from a query matching the RPC's own "active owner" definition exactly; type-to-confirm is case-sensitive exact match, correctly wired to the Confirm button; request/response contract matches Slice A's actual shipped route (not just the plan's assumption); live-region message construction mirrors the mockup; error handling keeps the modal open + toasts verbatim on failure with no unhandled rejection; double-submit guard on the primary click path; `/settings/account` confirmed byte-identical (empty diff); test quality (table-driven, real assertions); zero backend/migration/rpc.ts diffs.

### Spec Compliance Matrix — combined (both slices)

| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| Scenario 1 (confirm + fallback) | `test:route.test.ts` (backend) + `review-approved:orchestrator` (frontend copy/wiring, both reviews) | Backend re-resolution logic tested; frontend modal copy + live-region message verified in review | covered |
| Scenario 2 (sole-owner block, server + UI) | `test:route.test.ts` (`sole_owner`→409) + `review-approved:orchestrator` (locked-note UI, exact copy) | Both layers verified independently | covered |
| New Scenario A (corrected: block, not redirect) | `test:route.test.ts` (`last_membership`→409, backstop) + `review-approved:orchestrator` (action doesn't render for the only-workspace case) | Verified in both reviews; ratified via Jira comments citing the shipped mockup over the earlier draft answer | covered |
| New Scenario B (no cascade + PAT revoke) | `manual:migration-review` (PAT scope) + no code needed for content (FK-scoped) | PAT cascade scope verified scoped correctly; content non-cascade requires zero implementation | covered |
| New Scenario C (co-owner leave) | `test:route.test.ts` (happy path) + `review-approved:orchestrator` (owner-count query correctness) | Count-based guard + frontend owner-count aggregate both verified independently | covered |

All 5 AC scenarios `covered` across the two stacked PRs — no row remains `exempt`/`uncovered` once both merge.
