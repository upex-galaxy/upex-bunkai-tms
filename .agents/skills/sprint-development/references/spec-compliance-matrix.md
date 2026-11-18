# Spec compliance matrix: the Stage 3 gate from acceptance criteria to evidence

Reference for sprint-development Stage 3 (code review). `SKILL.md` cites it at the end of Stage 3, before the merge to the integration branch.

## Purpose

The matrix links every acceptance criterion (AC) scenario in the story to the evidence that proves it works. It is the reviewer's checklist for "does this PR implement what was specified?" at the row level, not only the diff level.

It is permissive on purpose. Not every AC can be a unit test, or an automated test at all, so a working loop accepts four shapes of evidence: an automated test, manual verification, an exemption with a justified reason, or approval by a human reviewer. Naming the four stops reviewers from treating unit-test coverage as AC coverage, and from blocking PRs on ACs that cannot be tested in dev.

The gate is one rule: no row may sit at `uncovered` when the PR merges. Anything else is a valid mitigation as long as the evidence is real.

## When the matrix is generated

At the end of Stage 3, after the static review checklist passes and before the PR merges into the integration branch (`git_strategy.branches.integration`). The reviewer subagent produces it, or the orchestrator when reviewing inline. It lands in the PR body, which is the durable copy and the one the merge gate reads. A working copy goes to `.session/sprint-development/<KEY>/compliance-matrix.md` (session scratch, beside `progress.md`) with topic_key `pbi/{ticket}/compliance-matrix`.

When any row is `uncovered`, the PR loops back to Stage 2 with a TODO list: add a test, add manual evidence, or reclassify with a real reason. The matrix is never green-lit by hand-waving. The reviewer either fills a cell with a real evidence pointer or writes a concrete `exempt:<reason>`.

## Matrix format

One row per AC scenario. Scenarios come from the story's Gherkin AC: the Jira `acceptance_criteria` field, or the story's delta spec at `.context/specs/changes/<KEY>/spec.md` as the fallback (`product-management/references/delta-specs.md`). The matrix has exactly as many rows as the story has scenarios. A missing row is itself a defect.

```
| AC scenario (Gherkin)                          | covered_by                          | evidence                              | status           |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------- | ---------------- |
| <Scenario one-liner from Given/When/Then>      | <type:id>                           | <link or path>                        | <status>         |
```

- **AC scenario (Gherkin)**: a short, recognizable one-line summary, such as `Scenario: User logs in with valid email + password`. Quote the scenario header verbatim where you can, and do not paraphrase.
- **covered_by**: one of the four `type:id` shapes below, exactly one per row.
- **evidence**: a concrete pointer the reader can follow without guessing (file path and line, URL, doc path, reviewer handle).
- **status**: one of the five values below, derived mechanically from `covered_by`.

## Valid `covered_by` values

Four prefixes. Every row picks exactly one.

### `test:<id>`

An automated test (unit, integration or E2E) covers the scenario. The id is a navigable pointer: file path plus test name or line, or a test-framework id.

```
test:tests/auth/login.spec.ts:42
test:tests/integration/payment.test.ts::"refunds within 30 days"
test:e2e/checkout.spec.ts:cart-empty
```

The reviewer checks that the test exercises the scenario, and is not a different code path that happens to pass. When the test name and assertions do not map back to the Given/When/Then, the row is `uncovered`, not `test:`.

### `manual:<evidence-path>`

Manual verification was performed and recorded. The path points to a markdown file, screenshot, video or session log captured during exploratory testing or a smoke check. "I tried it" is not enough: the artifact must persist.

```
manual:https://github.com/<org>/<repo>/pull/<n>#issuecomment-<id>
manual:jira:UPEX-123/attachment/login-flow.mp4
manual:https://staging.example.com/_test-runs/2026-05-06-login.html
```

The reviewer checks that the evidence shows the Given/When/Then playing out. A screenshot of the login form does not show that a 2FA challenge fires. The screenshot must show the challenge.

### `exempt:<reason>`

The scenario cannot or should not be tested in dev, and the reason is specific. Vague reasons ("not testable", "out of scope", "low priority") are rejected at review and the row falls back to `uncovered`.

Acceptable shapes:

- Production-only behavior dev cannot reproduce (real payment provider, real SMS gateway, real geo-IP lookup).
- A hardware or third-party dependency dev does not have (camera capture, GPS, a partner's paywall sandbox).
- A performance or load assertion that needs production-scale traffic.
- Compliance or audit scenarios that ride on infrastructure (CDN signing, edge cache TTL).

```
exempt:not feasible to test in dev, Stripe live-mode webhooks unavailable
exempt:requires production traffic to validate, covered by post-deploy synthetic monitor
exempt:depends on third-party SMS provider, verified in staging smoke after deploy
```

The reviewer asks whether the reason is outside dev's reach or just "I didn't want to write the test". In the second case the row is not exempt, and the fix is to cover it.

### `review-approved:<reviewer>`

A human reviewer confirmed correctness by reading the code, with no test or manual evidence. It is reserved for trivial changes (a rename, a comment fix, a config tweak), wiring-only diffs that are obvious by inspection, and scenarios where a test would cost more than the AC is worth.

```
review-approved:@alice
review-approved:@bob (confirmed config wiring + env var name)
```

The reviewer checks that a real human read the code path and certified it, rather than someone tagging themselves to skip the work. Self-approval is suspicious, and a cross-team approval is stronger. Because it needs a person who is not the author, a run with nobody present cannot produce this value. It uses a test, manual or exempt row, and otherwise leaves the row `uncovered`.

## Status legend

| Status            | Derived from prefix     | Meaning                                                              |
| ----------------- | ----------------------- | -------------------------------------------------------------------- |
| `covered`         | `test:`                 | An automated test asserts the scenario; CI proves it on every run.   |
| `manual`          | `manual:`               | Manual verification done with persisted evidence; not in CI.         |
| `exempt`          | `exempt:`               | The scenario cannot or should not be tested in dev; reason is specific. |
| `review-approved` | `review-approved:`      | Code review confirmed correctness; no test or manual evidence.       |
| `uncovered`       | (no prefix / blank row) | No evidence at all. **Blocks merge.** Reclassify or fix it.          |

`uncovered` is the only blocking state. The other four are valid mitigations, and a PR can merge with any mix of them, including 100% `exempt` when every reason is real (rare, but possible for an infrastructure-only story).

## Algorithm

The reviewer walks each AC scenario in order:

1. **Read all AC scenarios.** Source of truth, in order: the Jira `acceptance_criteria` field; the delta spec at `.context/specs/changes/<KEY>/spec.md` (committed tree, `product-management/references/delta-specs.md`, never under the `.context/PBI/` cache); the story description. Every Given/When/Then block is one row.
2. **Look for an automated test.** Walk the diff and the existing suite. If a test asserts the scenario's outcome (not just the same code path), mark `covered_by: test:<id>`, `status: covered`.
3. **Otherwise look for manual evidence.** Check the PR comments, the Jira attachments and the working folder `.session/sprint-development/<KEY>/evidence/`. If a markdown file, screenshot or video shows the scenario passing, mark `covered_by: manual:<evidence-pointer>`, `status: manual`. The pointer names the durable copy (PR comment or Jira attachment), never only the local working file.
4. **If the scenario is impractical to test in dev**, write a specific `exempt:<reason>` and mark `status: exempt`. The PR comment also says how the scenario will be verified after deploy (synthetic monitor, staging smoke, production observability).
5. **If a human reviewer has read the code and certifies it**, mark `covered_by: review-approved:<@reviewer>`, `status: review-approved`. The handle must be a real person who read the diff, not the author.
6. **Otherwise** mark `status: uncovered`. This is a blocker: write a TODO and loop back to Stage 2.

The matrix is complete when every AC scenario has a row and no row is `uncovered`.

## Example (2FA login story)

Story `UPEX-512: User can log in with email + 2FA challenge`, with four Gherkin scenarios in the Jira AC field. The Stage 3 reviewer produces:

```
| AC scenario (Gherkin)                                 | covered_by                                                             | evidence                                                            | status            |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------- |
| User logs in with valid email + password              | test:tests/auth/login.spec.ts::"valid-credentials-yields-2fa-prompt"   | tests/auth/login.spec.ts:42                                         | covered           |
| Email validation prompts user when format is invalid  | manual:.context/PBI/epics/EPIC-UPEX-100-<epic>/stories/STORY-UPEX-512-<slug>/manual-evidence.md#email-validation       | screenshot + DOM dump in manual-evidence.md, captured 2026-05-06    | manual            |
| Concurrent login attempts are rate-limited (5/min)    | exempt:requires production traffic, verified by post-deploy synthetic monitor `auth-rate-limit-probe` | https://monitors.example.com/auth-rate-limit-probe                  | exempt            |
| Logout clears session and redirects to /login         | review-approved:@alice (confirmed `clearSession()` wiring + redirect)  | PR #347 comment thread, alice's review block                        | review-approved   |
```

Sign-off: 4 of 4 rows have evidence and none is `uncovered`, so the PR can merge. The `exempt` row has a synthetic monitor link, so the gap is closed in production and not ignored. Had row 4 read `review-approved:@author` (the PR author certifying their own work), the reviewer would reject it, the row would fall to `uncovered`, and the merge would be blocked.

## Gate behavior

The PR cannot merge while any row is `uncovered`. Ways to clear one, strongest first:

1. **Add an automated test** that asserts the scenario. The row becomes `covered` and the scenario gets regression protection.
2. **Add manual evidence** (screenshot, video, session log) and persist it on the PR (comment) or the Jira issue (attachment). The working copy sits in `.session/sprint-development/<KEY>/evidence/`. The row becomes `manual`.
3. **Reclassify to `exempt:<specific reason>`** when the scenario cannot be tested in dev. Name the third-party, infrastructure or scale dependency, and pair it with a post-deploy verification plan.
4. **Get a real human review-approval** from someone other than the author. Use it sparingly, for trivial diffs.

If none of these is achievable, the AC itself may be wrong: loop back to Stage 1 and re-spec the story.

## Common pitfalls

- **Vague exempt reasons.** "Not testable" or "out of scope" do not pass. Name the dependency (third-party SMS provider, production-only payment webhook, hardware sensor, production-scale traffic). A reason that is not specific makes the row `uncovered`.
- **Self-approval as `review-approved:@author`.** The handle must belong to someone who read the diff and will put their name on the certification.
- **Claiming review-approved with no real review.** If the row says `review-approved:@alice` but Alice never commented on the PR, the matrix is false, and it loses its value the moment people stop being honest about it. When in doubt, downgrade to `uncovered` and fix it.
- **Missing scenarios.** Six scenarios and four rows is an incomplete matrix even when all four rows are `covered`. Count rows against the Jira AC field, not against the test count.
- **Mapping a test to the wrong scenario.** A test that exercises the same function but a different scenario does not count. Read the assertions against the Given/When/Then before marking `covered`.
- **Manual evidence that shows the form, not the outcome.** The evidence must show the 2FA prompt firing, the validation error rendering, the redirect happening. A screenshot of the empty login page proves nothing.
- **Skipping the matrix on tiny PRs.** Even a one-line fix has an AC behind it, and the matrix takes 30 seconds.

## Hand-off

When rows are still `uncovered` after the four mitigations, loop back to **Stage 2 (Implementation)** with `references/fix-issues.md` and a TODO list naming each uncovered scenario and its remediation (add test, add manual evidence, or reclassify). Re-run the Stage 2 verification (lint, types and tests, capped at 3 attempts) once the new evidence lands, then re-enter Stage 3, regenerate the matrix and re-check the gate.

When nobody can work out how to verify a scenario at all (not by test, not manually, not exempt with a monitor), the AC itself is suspect. Loop back to **Stage 1 (Planning)** and revise the spec, or hand off to `/product-management` to re-refine the AC with the three amigos.

## Persistence

The matrix lives in two places:

- **The PR body**, so reviewers see it without leaving GitHub. This copy is the durable, canonical one and the merge gate reads it there: it survives a fresh clone and is what a future reader on another machine can see.
- **The session folder**, `.session/sprint-development/<KEY>/compliance-matrix.md` (at `<<PRIMARY_ROOT>>`, beside `progress.md`), topic_key `pbi/{ticket}/compliance-matrix`. It is auto-generated, so `capture_prompt: false` (`agentic-dev-core/references/topic-key-conventions.md`). It is working scratch and nothing downstream may depend on it existing. The engram observation and the PR copy are what persist. Never put it under the gitignored `.context/PBI/` cache, whose story folders hold only Jira-synced files and `[LOCAL]` disposables (`.agents/instructions/agent-local-context-pbi.md` §9).

While the session copy exists, both should agree. If they drift, the PR copy wins: regenerate the session copy from it, never the other way around.
