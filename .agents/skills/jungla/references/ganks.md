# The ganks

A gank is showing up the moment the QA needs you. Four come from the owner's decision D7 (the "ganks" note), plus the student blocker the tutor relays (D1). The watcher wakes you on the first three and on the blocker; the fourth you sweep yourself.

The gank JQL (`JUNGLA_GANK_JQL` in `jungla.conf`), measured 2026-10-30 at 34 items: 8 `BLOCKED`, 18 Defects `Open`, 6 `QA Approved`, 2 `Ready For Dev`:

```
project = BK AND ((issuetype = Story AND status in ("Ready For Dev", "QA Approved", "BLOCKED")) OR (issuetype in (Bug, Defect) AND status = Open))
```

The watcher fires only on a key that **entered** one of those statuses since its last pass (`jira-seen.json`). The standing stock is your startup audit's (routine Phase 0 step 6). In this project the defect type is `Defect` (a few old `Bug`), and `BLOCKED` is a story status: a story goes there through `defect reported` when the QA files a defect against it.

## Priority

When several are waiting, in this order. One heavy worker at a time; the rest wait in `state.json` `ganks` as `{key, gank, since, note}`.

1. **G0 student blocker** (a student cannot test at all)
2. **G2 defect** (a student's story is BLOCKED behind it)
3. **G3 QA Approved sign-off** (cheap, unblocks the student's review)
4. **G1 Ready For Dev story**
5. **G4 own shift-left**

## G0 · Student blocker (bridge inbox)

A `student-blocker` file from the tutor: the app under test fails (403/5xx, a missing fault injection or staging data, a story that cannot be tested).

1. Reproduce it against staging (`.agents/project.yaml` -> `environments.staging`) or in the DB. Read-only first.
2. Fix it the fastest correct way. Data or config: do it yourself (SQL on `JUNGLA_SUPABASE_REF`, logged in the journal with the exact statement). Code with no ticket, urgent: straight to `staging` (D5 B), tests -> types -> lint first. Code that belongs to a ticket: G2 path.
3. Answer the tutor: `scripts/bridge.sh write answer <KEY|nokey> <body> <edition> <slack_channel> <slack_thread_ts>`, the body starting with `re: <original file name>`, then what you fixed, in which commit or deploy, and what the student has to test again. Plain words: the tutor turns it into her reply.
4. `scripts/bridge.sh done <file> done "<one line>"` (or `failed "<reason>"`), same turn.

## G1 · Story in Ready For Dev

It passed shift-left and is ready. Take it and implement it.

1. Audit first (`/autonomous-delivery` Phase 1): no open PR or branch for the key, not already on `origin/staging`, dependencies in `.context/dev-roadmap.md` satisfied. A dependency that is not met is a real blocker: note it in `ganks` and on the ticket, move on.
2. Dispatch a worker in its own worktree from `origin/staging` with `/sprint-development <KEY>`. Brief: one PR per story (Critical Rule #21), merge commit into `staging` when green and reviewed, migrations per `project.yaml`, design gate per `master-design-plan.md`, report the PR and merge SHA.
3. On `worker_done`: verify the merge commit is an ancestor of `origin/staging` (after `git fetch`) and that Jira moved it to `Ready For QA`. Journal line.

## G2 · New defect

A Defect `Open` (usually traced to a story that is now `BLOCKED`). Fix it as soon as possible.

1. **Status lag check first.** `git fetch` and `git log origin/staging --oneline --grep '<KEY>'`: if a merged fix already exists, the defect is not open in reality (measured 2026-10-30: BK-1282 and BK-1220 sat in `Open` after their PRs merged). Comment that on the defect, leave the transition to the QA's retest, and stop.
2. Read the defect and its linked story (`bun run jira:sync-issues get <KEY> --include-comments`): repro steps, AC, environment.
3. Dispatch a worker with `/sprint-development <KEY>` (bug entry point), fast lane: one PR, merge into `staging` as soon as it is green. A data-only cause you fix yourself, then comment on the defect.
4. After the merge: comment on the defect and on the story with the merge SHA and what to retest. The story leaves `BLOCKED` through the QA's retest flow (`Fix defect` / their transitions), not through you.
5. If the defect came with a student thread (a G0 or a tutor note), send the tutor an `answer`.

## G3 · Story in QA Approved: Definition-of-Done sign-off

The QA signed the story off. You check that the QA work meets the Definition of Done and, if it does, move it to `Ready For Release` (transition `include in release`).

The DoD is the QA boilerplate's: `/Users/ely/Desktop/projects/boilerplates/agentic-qa-boilerplate/.claude/skills/agentic-qa-core/references/stage-gates.md` § Per-stage DoD checklists (Planning, Execution, Reporting), as applied by its `sprint-testing` and `test-documentation` skills. There are two modalities and you detect which one the story used:

| | Jira native | Jira + Xray |
| --- | --- | --- |
| Test plan | `acceptance_test_plan` field (or `## Acceptance Test Plan` comment) | a Test Plan item `ATP: <KEY>: …` linked to the story |
| Results | `acceptance_test_results` field (or `## Acceptance Test Results` comment) | a Test Execution `ATR: <KEY>: Story Testing` with run statuses and a Test Environment |
| Coverage | outlines in the ATP | an `ATS: <KEY>: …` test set linked with the `test` slug |

**The minimum** (owner's words): test results exist, and there are substantive QA comments (what was tested, on which environment, what was found; not "done" or "ok").

1. **Code gate first** (conductor ruling 2026-10-31): `git fetch`, then the story's code must be an ancestor of `origin/staging` (`git log origin/staging --grep '<KEY>'` shows the merged feature commits, not only docs or cache syncs). If it is not, do not move it: post in the channel that you stopped it and why, and keep it in `ganks` as `qa-approved-no-code`.
2. Read the story with `bun run jira:sync-issues get <KEY> --include-comments` (fields and comments), plus the linked Xray items if any.
3. Score it against the minimum and the Reporting checklist. Record the verdict as a Jira comment headed `## AI Tech Lead — Decision: DoD sign-off <KEY>` with what you checked and what passed.
4. **Meets it**: transition `include in release` (`/acli`), read the status back. **Does not**: leave it in `QA Approved`, and the gaps go into the review request (next step) so the tutor tells the student; never a Jira comment addressed to the student.
5. Either way: `scripts/bridge.sh write review-request <KEY> <body> [edition] [slack_channel] [slack_thread_ts]` so the tutor reviews the student's work on that story with her rubric (she applies her own eligibility rule). Body: the story, the modality, your DoD verdict and the gaps.
6. The tutor's outcome arrives in her `done/` (`scripts/bridge.sh sent`). Note it in the journal.

## G4 · Own shift-left

Only on stories **no student took in 7 days** (D7 note 4). This overrides, for those stories only, Critical Rule #18's "missing shift-left is not yours to invent".

```
project = BK AND issuetype = Story AND status in (Backlog, Estimation, "Shift-Left QA") AND assignee is EMPTY AND updated <= -7d ORDER BY rank
```

(`JUNGLA_SHIFTLEFT_JQL`; 0 results on 2026-10-30.) Swept once per day in a proactive block. Run the QA boilerplate's `/shift-left-testing` on one story per block, with its Shift-Left DoD (refined Given/When/Then ACs, gaps as questions, test design applied, no TMS test entities), publish to the ticket, transition it to `Ready For Dev`, and it becomes a G1.

## Blocked stories (`blocked` events)

`BLOCKED` is a consequence, not a job: find the defect linked to it and make sure it is in the queue as G2. A story blocked with no defect linked: read its comments, decide (AI PO) and comment.
