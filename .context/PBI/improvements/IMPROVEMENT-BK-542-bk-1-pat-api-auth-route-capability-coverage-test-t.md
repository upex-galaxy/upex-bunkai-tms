# IMPROVEMENT: BK-1: PAT/API Auth: route-capability-coverage.test.ts crashes ungracefully when auth options are fully omitted

**Jira Key:** [BK-542](https://jira.upexgalaxy.com/browse/BK-542)
**Priority:** Low
**Status:** Open
**Components:** Bunkai API Tokens

---

## Description

**SUMMARY**
`lib/api/route-capability-coverage.test.ts` — the coverage check added by BK-497 that walks every `app/api/**/route.ts` handler and asserts each one declares an `auth` posture — crashes the whole test file with an unhandled error instead of a graceful, per-handler assertion failure when a route file calls `withApiHandler(handler)` with the `auth` options argument fully omitted. Discovered while executing BK-497's structural/compile-time test outline TC-08 (Story testing, not a standalone bug report).

---

**STEPS TO REPRODUCE**

#### 1. In the `upex-bunkai-tms` backend repo, create a throwaway route file with a handler that omits the `auth` options argument entirely, e.g. `app/api/v1/_scratch/route.ts` exporting `export const POST = withApiHandler(handler)` (no second argument).
#### 2. Run `bun test lib/api/route-capability-coverage.test.ts`.
#### 3. Observe the run result.

---

**TECHNICAL ANALYSIS**

- **File****:** `lib/api/route-posture-scan.ts:146` (`postureAt`)
- **Function****:** `postureAt` throws when its regex finds no `auth:` match in the scanned source, with an inline comment asserting the path is "only reachable if the union were widened or bypassed with a cast." In practice it is reachable any time a route file skips `types:check` before `bun test` runs (a differently-ordered CI, a bypassed pre-commit hook) — `bun test` does not type-check on its own.
- **Console****:** the whole file crashes — 0 pass / 0 fail / 1 error — taking down all 6 `it()` blocks in the file, instead of the single named, actionable failure the test's own design implies (`it('leaves no handler without a posture', ...)`, which assumes a gracefully-returned "undeclared" row that is never actually produced).

---

**IMPACT**

- Test-suite robustness / developer-experience gap only. In the current repo this is fully defended in depth — `types:check` runs before `bun test` in the Husky pre-commit chain — so a route missing its `auth` argument cannot reach `bun test` undetected today. Not a live production risk.
- If that ordering ever changes (CI reorder, a skipped hook), a developer would see an opaque crash instead of a clear "route X has no declared posture" failure, slowing diagnosis.

---

**SUGGESTED FIX**

`postureAt` should return a gracefully-handled "undeclared" row (matching what the existing `it('leaves no handler without a posture', ...)` assertion already expects) instead of throwing, or the coverage-check test should catch the scan error and convert it into a named failing `it()` per offending file.

---

**RELATED STORIES**

- Related: [BK-497] — surfaced during BK-497 Stage 2 (Execution) manual QA, structural/compile-time outline TC-08. Story itself ships PASSED WITH ISSUES; this finding is non-blocking.

---

## Related Issues

- is caused by: [BK-497](https://jira.upexgalaxy.com/browse/BK-497) - PAT | Require every API route to declare its capability posture

---

## Metadata

- **Created:** 8/19/2026
- **Updated:** 8/20/2026
- **Reporter:** Luis Eduardo Flores Villarroel
- **Assignee:** Unassigned
- **Labels:** api, dx, pat, testing

---

## Comments

_No comments_

---

_Synced from Jira by sync-jira-issues_
