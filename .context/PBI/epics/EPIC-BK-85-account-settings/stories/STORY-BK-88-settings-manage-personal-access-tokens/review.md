# BK-88 — Code Review (Dev-authored, non-Jira)

> Scope: PR1/2 (Slice A — list + revoke), PR #68. PR2 (issue-token flow) gets its own review entry appended here once opened.

## PR #68 — Slice A (list + revoke)

Independent adversarial review dispatched (fresh-context subagent, no stake in the implementation). Findings adjudicated against the actual diff by the orchestrator before any fix was applied.

| # | Severity | Finding | Verdict | Action |
|---|---|---|---|---|
| 1 | BLOCKER-equivalent (MAJOR) | `lib/hooks/use-modal-dismiss.ts` implemented Escape-to-close + return-focus but no Tab focus-trap — a keyboard user could Tab through the open `alertdialog` into page content behind the overlay, despite the hook's own comment claiming parity with the mockup's `trapFocus()`. | **legitimate** — verified directly: the hook's original code had zero `Tab`/`shiftKey` handling. | Fixed: added Tab/Shift+Tab wrap-focus trap, direct port of the mockup's `trapFocus()` logic (`use-modal-dismiss.ts`, commit `b99102c`). |
| 2 | MINOR | Token identifier rendered as bare `token.prefix`, not prefixed with the `bk_pat_` family marker used everywhere else in the codebase (`route.ts:16`, `route.openapi.ts:34-35`) — recognizability gap against a user's stored CI secret. | **legitimate** — verified via grep. | Fixed: `bk_pat_{prefix}` in `TokensList.tsx` row sub-line + Revoke button aria-label, and `RevokeTokenModal.tsx` confirm-dialog body (commit `b99102c`). |
| 3 | NIT | Revoked-row note used `text-xs` (11px); mockup's `.revoked-note` specifies `--text-sm` (12px). | **legitimate**, trivial. | Fixed: `text-sm` (commit `b99102c`). Confirmed via `tailwind.config.ts` that this repo's scale is fully custom (not stock Tailwind), so `text-sm` maps correctly to the mockup's 12px token. |
| 4 | MINOR | `TokensSection`'s single try/catch in `page.tsx` wraps both the token fetch and the workspace-label enrichment fetch — a transient failure in the secondary lookup blanks the whole list, not just the label. | **legitimate but dismissed-as-is** — inherited from `account/page.tsx`'s own `WorkspacesSection` convention (not novel to this PR); the common real case (caller left the workspace) is already handled gracefully by RLS + `formatWorkspaceCell`'s fallback, not this catch. Fixing the coarse-grained catch would be a repo-wide convention change, out of scope for BK-88. | No action — documented, not blocking. |

**Overall**: `request-changes` → all blocking items fixed → re-verified green (lint/types/tests, `bun test`: 590/592, same pre-existing unrelated `lib/atcs/search-isolation.test.ts` flake, zero new failures) → ready to merge.

## Spec Compliance Matrix — Slice A scope

Full story has 8 AC scenarios; Slice A (PR1) intentionally covers only the list+revoke surface per the stacked-PR split. AC1-4 (issuance) are explicitly deferred to PR2 — not a merge-gate violation for PR1, since the chain-strategy decision (`/git-flow-master`, recorded in `progress.md`) treats each stacked PR as independently reviewable against its own slice, not the full story.

| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| AC1 — Issuing a token reveals the secret once | `exempt:deferred-to-PR2` | Issue flow is Slice B's scope (stacked-PR split, `/git-flow-master` decision) | exempt (this PR) |
| AC2 — Issuing with no scopes is rejected | `exempt:deferred-to-PR2` | same | exempt (this PR) |
| AC3 — Invalid scope enum rejected server-side | `exempt:deferred-to-PR2` | Already true server-side (BK-135/167, shipped); UI surfacing is PR2's `IssueTokenModal` | exempt (this PR) |
| AC4 — workspace:admin requires admin/owner role | `exempt:deferred-to-PR2` | Already enforced server-side (`lib/api/pat.ts`, tested); UI surfacing is PR2's | exempt (this PR) |
| AC5 — Listing never exposes secret; revoked visually distinct | `test:lib/tokens/format.test.ts` + `review-approved:orchestrator` | Select list excludes `hash`/secret (verified in review); revoked-row treatment matches mockup exactly (verified in review) | covered |
| AC6 — Cross-user deletion rejected (404) | `manual:existing-backend-coverage` | Already covered by BK-131 (backend test), RLS-enforced; this PR's UI never exposes another user's token id to attempt against | covered |
| AC7 — Revoke requires confirmation, updates immediately, no full reload | `review-approved:orchestrator` | Verified in review: only `router.refresh()` used, no `window.location.reload()`/native form submit; `RevokeTokenModal` exact mockup copy | covered |
| AC8 — Empty state guides first issuance | `exempt:partial-deferred-to-PR2` | Explanatory copy ships in this PR; the "Issue your first token" CTA (which opens a modal that doesn't exist yet) is PR2's addition to this same empty-state block | exempt (CTA only, this PR) |

No row is `uncovered` — every AC1-4/8-CTA exemption has a concrete, non-vague reason tied to the approved stacked-PR plan, not an unresolved gap.
