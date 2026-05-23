# Spec Compliance Matrix — Stage 3 AC↔evidence traceability gate

> Reference for sprint-development Stage 3 (Code Review).
> Cited from: `SKILL.md` end-of-Stage-3, before merge to staging.

## Purpose

Formalize the link between **every Acceptance Criterion (AC) scenario in the story** and **the evidence that proves it works**. The matrix is the reviewer's checklist for "does this PR really implement what was specified?" — at the row level, not just the diff level.

Permissive by design: not every AC is tractable as a unit test or even an automated test at all. A working development loop must accept multiple evidence types — automated test, manual verification, exempt with justified reason, or covered-by-review. The matrix names the four shapes explicitly so reviewers stop pretending unit-test coverage means AC coverage, and so reviewers stop blocking PRs on ACs that genuinely cannot be tested in dev.

The gate is simple: **no row may sit at `uncovered` when the PR merges**. Anything else (covered / manual / exempt / review-approved) is a valid mitigation as long as the evidence is real.

---

## When the matrix is generated

At the **end of Stage 3 (Code Review)**, after the static review checklist passes and before the PR is merged to `staging`. The reviewer subagent (or orchestrator, when reviewing inline) produces it. It lands in the PR description or as a comment on the PR; a copy persists at `.context/PBI/{ticket}/compliance-matrix.md` with topic_key `pbi/{ticket}/compliance-matrix`.

If the matrix exposes any `uncovered` row, the PR loops back to Stage 2 with a TODO list (add test, add manual evidence, or reclassify with a real reason). The matrix is never green-lit by hand-waving; the reviewer either edits one of the cells with a real evidence pointer or writes a concrete `exempt:<reason>`.

---

## Matrix format (verbatim)

One row per AC scenario. Scenarios come from the story's Gherkin AC (Jira `acceptance_criteria` field, or `.context/PBI/{ticket}/spec.md` fallback). The row count of the matrix MUST equal the scenario count of the story; missing rows are themselves a defect.

```
| AC scenario (Gherkin)                          | covered_by                          | evidence                              | status           |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------- | ---------------- |
| <Scenario one-liner from Given/When/Then>      | <type:id>                           | <link or path>                        | <status>         |
```

Column rules:

- **AC scenario (Gherkin)**: a one-line summary of the Gherkin scenario. Keep it short and recognizable — e.g. `Scenario: User logs in with valid email + password`. Do NOT paraphrase; quote the scenario header verbatim where possible.
- **covered_by**: one of the four `type:id` shapes below. Exactly one type per row; never combine.
- **evidence**: a concrete, navigable pointer (file path + line, URL, doc path, reviewer handle). Reviewers MUST be able to click/follow this without guessing.
- **status**: one of the five status values below, mechanically derived from `covered_by`.

---

## `covered_by` valid values

Four shapes, four prefixes. Every row picks exactly one.

### `test:<id>`

Automated test (unit / integration / E2E) covers the scenario. The id is a navigable test pointer — file path + test name or line, or a test framework id.

Examples:

```
test:tests/auth/login.spec.ts:42
test:tests/integration/payment.test.ts::"refunds within 30 days"
test:e2e/checkout.spec.ts:cart-empty
```

The reviewer checks: does this test actually exercise the scenario, or is it a different code path that happens to pass? If the test name and assertions don't map back to the Gherkin Given/When/Then, the row is NOT `test:` — it's `uncovered`.

### `manual:<evidence-path>`

Manual verification was performed and recorded. The path points to a markdown file, screenshot, video, or session log captured during exploratory testing or smoke check. Plain "I tried it" is not enough — there must be a persisted artifact.

Examples:

```
manual:.context/PBI/UPEX-123/manual-evidence.md#scenario-3
manual:.context/PBI/UPEX-123/evidence/login-flow.mp4
manual:https://staging.example.com/_test-runs/2026-05-06-login.html
```

The reviewer checks: does the evidence actually show the Given/When/Then playing out? A screenshot of the login form is not evidence that 2FA challenges fire — the screenshot must show the 2FA challenge.

### `exempt:<reason>`

The AC scenario cannot or should not be tested in dev. The reason MUST be specific. Vague reasons ("not testable", "out of scope", "low priority") are rejected at review and the row falls back to `uncovered`.

Acceptable shapes:

- Production-only behavior the dev environment cannot reproduce (real payment provider, real SMS gateway, real geo-IP lookup).
- Hardware or third-party dependency unavailable to dev (camera capture, GPS, paywall partner sandbox).
- Performance/load assertion that requires production-scale traffic.
- Compliance/audit scenarios that ride on infrastructure (CDN signing, edge cache TTL).

Examples:

```
exempt:not feasible to test in dev — Stripe live-mode webhooks unavailable
exempt:requires production traffic to validate — covered by post-deploy synthetic monitor
exempt:depends on third-party SMS provider — verified in staging smoke after deploy
```

The reviewer checks: is the reason genuinely outside dev's reach, or is it just "I didn't want to write the test"? If the latter, the row is NOT exempt — fix it.

### `review-approved:<reviewer>`

A human reviewer confirmed correctness through code reading without test or manual evidence. Reserved for: trivial changes (rename, comment fix, config tweak), wiring-only diffs that are obvious by inspection, or scenarios where adding a test costs more than the AC is worth.

Examples:

```
review-approved:@alice
review-approved:@bob (confirmed config wiring + env var name)
```

The reviewer checks: did a real human actually read the code path and certify it, or did someone tag themselves to skip the work? Self-approval is suspicious; cross-team review-approved entries are stronger.

---

## Status legend

Five values. Mechanically derived from `covered_by`:

| Status            | Derived from prefix     | Meaning                                                              |
| ----------------- | ----------------------- | -------------------------------------------------------------------- |
| `covered`         | `test:`                 | Automated test asserts the scenario; CI proves it on every run.      |
| `manual`          | `manual:`               | Manual verification done with persisted evidence; not in CI.         |
| `exempt`          | `exempt:`               | Scenario cannot/should not be tested in dev; reason is specific.     |
| `review-approved` | `review-approved:`      | Code review confirmed correctness; no test/manual evidence.          |
| `uncovered`       | (no prefix / blank row) | No evidence at all. **Blocks merge.** Must be reclassified or fixed. |

`uncovered` is the only blocking state. The other four are valid mitigations and the PR can merge with any mix of them — including 100% `exempt` if every reason is real (rare, but possible for, say, an infrastructure-only story).

---

## Algorithm

The reviewer subagent walks each AC scenario in order and applies these steps:

1. **Read all AC scenarios** for the story. Source-of-truth order: (1) Jira `acceptance_criteria` custom field, (2) `.context/PBI/{ticket}/spec.md`, (3) story description fallback. Every Given/When/Then block is one row.
2. **For each scenario, ask: is there an automated test that exercises it?** Walk the diff + the existing test suite. If yes, mark `covered_by: test:<id>`, `status: covered`. The test must assert the scenario's outcome, not just the same code path.
3. **If no test exists, ask: is there manual evidence on file?** Look in `.context/PBI/{ticket}/evidence/` and PR comments. If a markdown / screenshot / video shows the scenario passing, mark `covered_by: manual:<evidence-path>`, `status: manual`.
4. **If no evidence and the scenario is impractical to test in dev**, write a specific `exempt:<reason>`. Vague reasons are rejected. Mark `status: exempt`. The PR comment should also state how the scenario will be verified post-deploy (synthetic monitor, staging smoke, prod observability, etc.).
5. **If a human reviewer has read the code and certifies correctness**, mark `covered_by: review-approved:<@reviewer>`, `status: review-approved`. The reviewer handle must be a real person who actually read the diff — not the author.
6. **Else** mark `status: uncovered`. This is a blocker. Generate a TODO and loop back to Stage 2 to add a test, add manual evidence, or reclassify with a real reason.

The matrix is complete when (a) every AC scenario has a row, and (b) no row is `uncovered`.

---

## Concrete example (2FA login story)

Story `UPEX-512: User can log in with email + 2FA challenge`, with four Gherkin scenarios in the Jira AC field. Stage 3 reviewer produces:

```
| AC scenario (Gherkin)                                 | covered_by                                                             | evidence                                                            | status            |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------- |
| User logs in with valid email + password              | test:tests/auth/login.spec.ts::"valid-credentials-yields-2fa-prompt"   | tests/auth/login.spec.ts:42                                         | covered           |
| Email validation prompts user when format is invalid  | manual:.context/PBI/UPEX-512/manual-evidence.md#email-validation       | screenshot + DOM dump in manual-evidence.md, captured 2026-05-06    | manual            |
| Concurrent login attempts are rate-limited (5/min)    | exempt:requires production traffic — verified by post-deploy synthetic monitor `auth-rate-limit-probe` | https://monitors.example.com/auth-rate-limit-probe                  | exempt            |
| Logout clears session and redirects to /login         | review-approved:@alice (confirmed `clearSession()` wiring + redirect)  | PR #347 comment thread, alice's review block                        | review-approved   |
```

Reviewer sign-off: 4/4 rows have evidence, 0 `uncovered`. PR can merge. The `exempt` row is followed up by a synthetic monitor link so the gap is closed in prod, not ignored.

If instead row 4 had read `covered_by: review-approved:@author` (the PR author certifying their own work), the reviewer rejects it — self-approval doesn't count — and that row falls to `uncovered`, blocking merge.

---

## Gate behavior

**The PR cannot merge if any row is `uncovered`.** No exceptions. The reviewer either edits the matrix (by adding evidence or reclassifying with a real reason) or hands the PR back to Stage 2 with concrete TODOs.

Acceptable mitigations to clear an `uncovered` row, in priority order:

1. **Add an automated test** that asserts the scenario. This is the strongest mitigation — promotes the row to `covered` and locks in regression protection.
2. **Add manual evidence** (screenshot, video, session log) and persist it under `.context/PBI/{ticket}/evidence/`. Promotes the row to `manual`.
3. **Reclassify to `exempt:<specific reason>`** if the scenario genuinely cannot be tested in dev. Reason MUST be concrete — name the third-party / infra / scale dependency. Should be paired with a post-deploy verification plan (synthetic monitor, staging smoke, prod observability).
4. **Get a real human review-approval** from someone other than the author. Promotes the row to `review-approved`. Use sparingly; reserve for trivial diffs.

If none of these are achievable, the AC itself may be wrong — loop back to Stage 1 and re-spec the story.

---

## Common pitfalls

- **Vague exempt reasons.** "Not testable" or "out of scope" don't pass review. Name the specific dependency (third-party SMS provider, production-only payment webhook, hardware sensor, prod-scale traffic). If the reason isn't specific, the row is `uncovered`, not `exempt`.
- **Self-approval as `review-approved:@author`.** Author tagging themselves doesn't count. The reviewer handle must be someone who actually read the diff and is willing to put their name on the certification.
- **Pretending review-approved when there was no real review.** If the row says `review-approved:@alice` but Alice never commented on the PR, that's fraud. The matrix loses all value the moment people stop being honest about it. When in doubt, downgrade to `uncovered` and fix it.
- **Missing scenarios.** The matrix MUST have one row per AC scenario. If the story has six scenarios and the matrix has four, the matrix is incomplete — even if all four rows are `covered`. Reviewers count rows against the Jira AC field, not against test count.
- **Mapping a test to the wrong scenario.** A test that exercises the same function but a different scenario doesn't count. Read the assertions against the Given/When/Then before marking `covered`.
- **Treating manual evidence as a screenshot of the form.** Evidence must show the scenario's outcome — the 2FA prompt firing, the validation error rendering, the redirect happening. A screenshot of the empty login page proves nothing.
- **Skipping the matrix on "tiny PRs."** Even a one-line fix has an AC behind it. The matrix takes 30 seconds for a one-line fix; skipping it normalizes skipping it on bigger PRs too.

---

## Hand-off

If the matrix exposes one or more `uncovered` rows after the reviewer has tried the four mitigations:

- Loop back to **Stage 2 (Implementation)** with `references/fix-issues.md` and a TODO list naming each uncovered scenario plus the chosen remediation (add-test / add-manual-evidence / reclassify).
- Re-run Stage 2 verification (lint + types + tests cap=3) once the new evidence lands.
- Re-enter Stage 3, re-generate the matrix, and re-check the gate.

If the matrix exposes a scenario that nobody can figure out how to verify at all — not test, not manual, not exempt-with-monitor — the AC itself is suspect. Loop back to **Stage 1 (Planning)** and revise the spec, or hand off to `/product-management` to re-refine the AC with the 3-amigos.

---

## Persistence

The matrix lives in two places:

- **Inline in the PR** (description or top-of-thread comment) so reviewers see it without leaving GitHub.
- **In the project repo** at `.context/PBI/{ticket}/compliance-matrix.md`, topic_key `pbi/{ticket}/compliance-matrix`. Auto-generated, so `capture_prompt: false`. See `agentic-dev-core/references/topic-key-conventions.md`.

Both copies must agree at merge time. If they drift, the in-repo copy is canonical.
