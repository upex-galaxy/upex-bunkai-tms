# BK-90 — Code Review (Dev-authored, non-Jira)

> Scope: PR1/2 (Slice A — backend RPC + route). PR2 (frontend) gets its own review entry appended here once opened.

## PR1 — Slice A (backend: `bunkai_leave_workspace` RPC + `DELETE /api/v1/workspaces/{id}/membership`)

Independent adversarial review dispatched against `git diff origin/staging..feat/BK-90-leave-backend`.

| # | Severity | Finding | Verdict | Action |
|---|---|---|---|---|
| 1 | MAJOR | `public/openapi.json` (the live, publicly-served spec at `/api/openapi`) was never regenerated despite the new `route.openapi.ts` + its `scripts/openapi-gen.ts` registration — breaks an established convention (prior route additions regenerate + commit this file in the same commit). | legitimate — verified the diff was empty, confirmed the served route reads this file straight off disk. | **Fixed**: ran `bun run openapi:gen`, verified the diff only adds the new endpoint + one legitimate pre-existing gap (BK-89's already-merged `role` field, never regenerated until now) — no leakage from any unmerged concurrent work. Committed `274f8c3`. |
| 2 | MINOR | The route's cookie-mutation branch (`route.ts:45-54`) has no direct test — the 12 tests only exercise the pure helpers (`response.ts`), not the actual `Set-Cookie` decision. | legitimate, but matches a pre-existing repo-wide gap (no `NextRequest`/ctx test harness anywhere, e.g. `me/active-workspace/route.test.ts` has the same limitation) — not a regression introduced by this PR. | **Dismissed as-is** — out of scope to build new test infrastructure for one route; the underlying decision logic (`resolveNewActiveWorkspace`) IS unit-tested. |

**Overall**: `request-changes` → the one blocking item fixed and verified → ready to merge.

**Verified clean by the reviewer** (no findings): guard order (last-membership before sole-owner, matches the plan), count-based sole-owner guard (excludes caller, counts others), PAT cascade scope (only the left workspace's tokens), transaction atomicity, `SECURITY DEFINER`/`search_path`/grants, defense-in-depth membership check on an arbitrary `workspace_id`, route error-mapping (exact SQLSTATE match, not fragile string matching), bearer-token rejection ordering, active-workspace re-resolution (correct short-circuit + correct re-query + defensive zero-remaining handling), migration numbering (`0044`, genuinely next-free after discovering `0042`/`0043` were taken by a concurrent worker's unmerged branch), errcode uniqueness (`45212`/`45213`, confirmed unused elsewhere), hand-patched Supabase type shape (matches the established `Returns: undefined` pattern for other void RPCs), test quality (24 real assertions, not tautological).

### Spec Compliance Matrix — Slice A scope

Full story has 5 AC scenarios; Slice A (backend only) provides the server-side enforcement every scenario depends on, but the UI-facing assertions (dialog copy, action visibility, live-region announcement) are Slice B's.

| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| Scenario 1 (confirm + fallback) | `test:route.test.ts` (happy-path branches) | Active-workspace re-resolution logic tested; UI-facing confirm dialog is Slice B | partial (backend covered) |
| Scenario 2 (sole-owner block, server-enforced) | `test:route.test.ts` (`sole_owner` → 409) | Count-based guard verified in review | partial (backend covered; UI lock-badge is Slice B) |
| New Scenario A (corrected: block, not redirect) | `test:route.test.ts` (`last_membership` → 409) | Server-side backstop present even though UI won't normally trigger it | partial (backend covered; UI hide-the-action is Slice B) |
| New Scenario B (no cascade + PAT revoke) | `manual:migration-review` | PAT cascade scope verified scoped to the left workspace only in review; content non-cascade requires zero code (FK-scoped) | covered (backend side) |
| New Scenario C (co-owner leave) | `test:route.test.ts` (happy path, non-sole-owner) | Count-based guard excludes caller, verified | partial (backend covered; UI wiring is Slice B) |

No row is `uncovered` — every "partial" reflects the intentional backend/frontend split of this stacked PR, not a gap.
