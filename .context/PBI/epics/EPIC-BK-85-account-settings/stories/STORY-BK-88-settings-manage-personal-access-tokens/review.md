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

## PR2 — Slice B (issue-token flow)

Independent adversarial review dispatched against `git diff feat/BK-88-tokens-list..feat/BK-88-tokens-issue` (Slice B's own changes only). No BLOCKER/MAJOR found.

| # | Severity | Finding | Verdict | Action |
|---|---|---|---|---|
| 1 | MINOR | AC2's literal Gherkin error text ("At least one scope is required.") never rendered — button disable works correctly, but no screen-reader-facing feedback on why. | legitimate, but matches the mockup's own approach (no such text there either — only the static fieldset legend + disabled button). | **Dismissed as-is** — not a new divergence from the design source of truth; a QA tester reading AC2 literally may still flag it, noted here for that reason. |
| 2 | MINOR | Name field missing the mockup's hint text + submit-time normalization (`.toLowerCase().replace(/\s+/g, '-')`). | legitimate — undocumented content/behavior gap vs the mockup. | **Fixed**: hint paragraph + normalization added, commit `e5d9249`. |
| 3 | MINOR | "Copied" button label never reverts to "Copy" (mockup reverts after 2s). | legitimate — cosmetic fidelity gap. | **Fixed**: 2s revert timeout added, with cleanup on unmount/modal-close, commit `e5d9249`. |
| 4 | MINOR/observation | Escape/click-outside closes the modal during Step 2 (secret visible) without requiring "Done — I stored it". | legitimate observation, but is the mockup's own exact behavior (`settings-tokens.html:1311-1320`) — the plan's Decision 7 rationale overclaims protection here, but no data leak occurs (state is wiped either way). | **Dismissed as-is** — accepted parity with the design source of truth; the secret itself is never left exposed on disk/network, only convenience is affected. Decision 7's rationale text could be corrected in a future pass, not a merge blocker. |
| 5 | NIT | Header "New token" button + empty-state CTA both visible simultaneously in the empty state (2 ways to do the same thing). | legitimate, cosmetic. | **Dismissed as-is** — the mockup's states-strip doesn't settle this either way; not a defect. |

**Overall**: `approve-with-nits` → both fixable items fixed, re-verified green → ready to stack as PR2, pending PR1 (#68) merge.

### Spec Compliance Matrix — Slice B scope (completes the story)

| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| AC1 — Issuing a token reveals the secret once | `test:lib/tokens/issue-form.test.ts` + `review-approved:orchestrator` | Server's own `warning` field rendered verbatim (traced in review); secret never logged/persisted beyond local Step-2 state (traced in review) | covered |
| AC2 — Issuing with no scopes is rejected (client-side) | `test:lib/tokens/issue-form.test.ts` | `canSubmitIssueForm` unit-tested (6 cases) + wired to the Create button's `disabled` prop (verified in review — button genuinely inert, no request fires) | covered |
| AC3 — Invalid scope enum rejected server-side (422) | `manual:existing-backend-coverage` + `review-approved:orchestrator` | Already covered by BK-126 (backend test); this PR's error-surfacing path (`toast.error(body.error.message)`, stays on Step 1) verified in review | covered |
| AC4 — workspace:admin requires admin/owner role (403) | `manual:existing-backend-coverage` + `review-approved:orchestrator` | Already enforced + tested (`lib/api/pat.test.ts`, BK-135/ADR-0005); this PR's error-surfacing path verified identical to AC3's | covered |
| AC8 — Empty state guides first issuance (CTA half) | `review-approved:orchestrator` | "Issue your first token" button now opens `IssueTokenModal` (copy shipped in Slice A, button wired in Slice B) | covered |

Combined with Slice A's matrix, all 8 story AC scenarios are now `covered` across the two stacked PRs — no row remains `exempt`/`uncovered` once both merge.
