# Review size forecast: the Stage 1 review-budget gate

Reference for sprint-development Stage 1 (planning). `SKILL.md` cites it at the end of Stage 1 and the start of Stage 2.

## Purpose

A reviewer doing focused, defect-finding work has a hard ceiling around **400 lines** of diff per PR (an industry rule of thumb from SmartBear and Cisco). Past it, review quality collapses and comments drift from "is this correct?" to "LGTM" out of fatigue. Restructuring the work is cheap at planning time and expensive once the diff exists, so the forecast makes the size visible before any code is written.

Two gates follow: every Stage 1 plan ends with a forecast block, and Stage 2 (implementation) does not start while `Review Size = High` and `chain_strategy = pending`. The orchestrator hands off to `/git-flow-master` (Step 4, the chained-PR decision tree) to resolve it, then returns.

## Forecast block format

The planner subagent emits this block as the last artifact of Stage 1, right after `implementation-plan.md` is written. It goes at the bottom of the plan file and into the orchestrator's turn summary.

```
## Review Size Forecast

Estimated: <X> additions + <Y> deletions = <Z> total lines
Review Size (400-line budget): Low | Medium | High
Chain strategy: stacked-to-main | feature-branch-chain | size-exception | pending
Decision trace: <verbatim tree answers + resolved leaf, or "n/a (Review Size not High)">
Decided by: </git-flow-master §Chained-PR decision tree | n/a>
Decision needed before apply: Yes | No
```

Field rules:

- `<X>`, `<Y>` and `<Z>` are integers, and `<Z> = <X> + <Y>`.
- `Review Size` is exactly one of `Low`, `Medium`, `High` (thresholds below).
- `chain_strategy` is one of `stacked-to-main`, `feature-branch-chain`, `size-exception`, `pending`.
- `Decision trace` is required whenever `Review Size = High` and `chain_strategy` is not `pending`. It records the actual walk of the chained-PR decision tree: each question, the answer, the reason for the answer, and the leaf reached. It is `n/a (Review Size not High)` only when `Review Size` is `Low` or `Medium`.
- `Decided by` names the authority that produced the trace. When Review Size is High, that is always the `/git-flow-master` chained-PR decision tree.
- `Decision needed before apply` is `Yes` when `Review Size = High` and the decision is unresolved (see "Gate behavior"), otherwise `No`.

### A well-formed trace

```
Chain strategy: feature-branch-chain
Decision trace: Q1=No (not mechanical, new domain logic and not a rename/formatter run) ·
                Q2=No (slice 2 cannot compile without the types introduced in slice 1) ·
                Q3=Yes (shared schema + base client consumed by slices 2-4) → feature-branch-chain
Decided by: /git-flow-master §Chained-PR decision tree (branching-strategies.md)
```

A trace that restates the conclusion ("chose feature-branch-chain because the change is large") is malformed, because it does not show a walk of the tree. So is a trace whose answers do not lead to the stated leaf. Both count as no trace at all.

## Estimation algorithm

Estimate each file, sum the estimates, then pad for tests and docs.

### Per-file multipliers

| Operation     | Multiplier | Rationale                                                       |
| ------------- | ---------- | --------------------------------------------------------------- |
| New file      | × 1.5      | Full content, plus imports, types and scaffolding               |
| Modified file | × 1.0      | Lines changed are roughly the lines in the diff                 |
| Deleted file  | × 0.5      | Counts as deletions only; reviewer cost is half a modified file |

For each affected file the planner eyeballs a base line count (function bodies, types, imports) and applies the multiplier for the operation.

### Tests and docs buffer

After summing, add **20%** for:

- unit tests added with the code (Stage 2 verification expects tests with the code);
- inline doc updates (JSDoc, READMEs, CHANGELOG entries shipped with the PR);
- snapshot updates and fixture data.

`<Z> = ceil(sum_of_per_file_estimates × 1.2)`.

Split `<Z>` into `<X>` and `<Y>` by default as follows:

- New files contribute 100% to `<X>`.
- Modified files split 70/30 (additions/deletions), overridable for refactor-heavy work.
- Deleted files contribute 100% to `<Y>`.

### Worked examples

**Small change**: 3 modified files, about 50 lines each.

- `3 × 50 × 1.0 = 150`, then `× 1.2 = 180` total.
- Review Size is `Low` (under 200).

**Medium change**: 1 new file (about 100 lines) and 5 modified files (about 40 lines each).

- New: `100 × 1.5 = 150`. Modified: `5 × 40 × 1.0 = 200`.
- Sum `350`, `× 1.2 = 420` total.
- Review Size is `High` (over 400), so a chain decision is required.

**Large change**: 10 new files (about 80 lines each) and 8 modified files (about 60 lines each).

- New: `10 × 80 × 1.5 = 1200`. Modified: `8 × 60 × 1.0 = 480`.
- Sum `1680`, `× 1.2 = 2016` total.
- Review Size is `High`, and `feature-branch-chain` is almost certainly the right strategy.

## Review Size thresholds

| Total lines (`<Z>`) | Review Size | Action                                                                                          |
| ------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `< 200`             | Low    | Proceed to Stage 2. No chain decision needed.                                                   |
| `200 – 400`         | Medium | Proceed, and warn that the PR is approaching the budget. Chain optional.                        |
| `> 400`             | High   | Gate: `chain_strategy` must not be `pending`. If it is, hand off to `/git-flow-master` (Step 4). |

## Chain strategy options

Each `chain_strategy` value maps to a PR layout. The full patterns live in `/git-flow-master` (`references/branching-strategies.md`, § Chained-PR decision tree).

### `stacked-to-main`

- 2 to 4 PRs, each under 400 lines.
- Each PR branches off the strategy's base: `git_strategy.branches.integration`, or `git_strategy.branches.production` when integration is null.
- Each PR waits for the previous one to merge before the next opens.
- Best for linear feature work with clear sub-deliverables (foundation, feature slice, docs and tests).

### `feature-branch-chain`

- One long-lived chain branch (`feat/<key>-<slug>`) cut from that same base.
- N child PRs merge into the chain branch, not into the base.
- The chain branch then merges to the base as a single squash or merge commit.
- Best for big architectural changes with shared scaffolding, where partial merges would leave the base broken.

### `size-exception`

- The diff is large but the change is mechanical and cheap to read: mass renames, formatter runs, generated code (OpenAPI types, lockfile updates), vendor library updates.
- It needs an explicit user override and a written rationale in the PR description (a `Why size-exception:` line). When nobody is present, the delegating brief must grant the override (`agentic-dev-core/references/decision-protocol.md`). Without one, the run keeps `pending`, reports, and stops before Stage 2.
- The reviewer is told up front not to read line by line. A spot check plus the CI signal is enough.

### `pending`

- The default until the chain decision is made, and the value the forecast emits whenever the planner is unsure.
- **Stage 2 cannot start while `Review Size = High` and `chain_strategy = pending`.**

## Gate behavior

At the Stage 1 to Stage 2 boundary the orchestrator inspects the forecast block. The gate is fail-closed: it opens on evidence, not on a label.

1. When `Review Size` is `Low` or `Medium`, proceed to Stage 2 whatever `chain_strategy` says.
2. When `Review Size` is `High`, the decision is `resolved` only if `chain_strategy` is one of `stacked-to-main`, `feature-branch-chain` or `size-exception`, and `Decision trace` is present, non-empty, names the tree answers, and those answers lead to the stated leaf.
   - **Not resolved** (`pending`, or a strategy with a missing, empty, conclusion-only or inconsistent trace): stop. Surface the forecast block and hand off to `/git-flow-master` (Step 4, the chained-PR decision tree plus a concrete branch plan). When it returns, write both the strategy and its trace into the forecast block in `implementation-plan.md`, then proceed to Stage 2. A person who is present sees the block. A supervised worker raises it to its conductor, which holds the gate. A run with nobody present lets the tree decide (it needs no human unless the leaf is `size-exception`, see above) and records the trace.
   - **Resolved**: proceed to Stage 2. Stage 3 (code review) and Stage 4 (staging deploy) follow the chosen strategy's PR layout.

This gate is the only mechanism that can block Stage 2, and it is not advisory. A `High` plan without a resolved decision is an incomplete plan.

### Why the trace exists

Without it the gate was fail-open. Its condition read "block while `chain_strategy = pending`", so any agent that wrote a plausible non-`pending` label, without walking the tree, disabled the gate that existed to force that decision. This was observed in production: a planner emitted `Chain strategy: feature-branch-chain` as a guess, the gate never fired, and the branch layout had to be redone by hand.

Requiring a citation, and treating a missing citation as the blocking value, closes the hole. The same rule holds for every gate in every skill: `agentic-dev-core/references/orchestration-doctrine.md`, "Gate design: fail-closed, evidence-bearing".

## When to override the algorithm

The 20% buffer and the per-file multipliers are heuristics. Override them, and note the override in a `Notes:` line under the forecast block so reviewers and auditors see the reasoning, when:

- **The change is a mechanical bulk edit** (mass rename, formatter run, ESLint auto-fix sweep). Real cognitive load is far below the line count, so use `size-exception` with a rationale.
- **The code is generated** (OpenAPI types, Supabase types, GraphQL codegen). Do not count generated files toward the budget, and mark them in the plan as `// generated, do not review`.
- **The change is a vendor or dependency update.** Lockfile updates and `node_modules` are excluded by definition.
- **The PR is test-heavy.** When the test-to-code ratio is well above 1:1 (a table-driven test for a parser), reduce the buffer from 20% to 10%, since tests are read with a different cognitive load.
- **The PR is refactor-heavy.** When modifications are mostly deletions (extract a function, remove dead code), the 70/30 split inverts, so override the split per file.

## Implementation pointers for the planner subagent

When emitting the forecast block:

1. Walk the implementation plan's task list and note, per task, the files it touches and the operation (`new`, `modify`, `delete`). Order-of-magnitude accuracy is the goal, not a line-perfect prediction.
2. Apply the multipliers, sum, and multiply by 1.2.
3. Pick a `chain_strategy`:
   - `Z < 200`: `pending` is fine and no decision is required. `Decision trace: n/a (Review Size not High)`.
   - `Z` of `200 – 400`: suggest `stacked-to-main` if the work decomposes linearly, otherwise `pending`. `Decision trace: n/a (Review Size not High)`.
   - `Z > 400`: emit `Chain strategy: pending`, leave `Decision trace:` empty, and surface the gate. Do not pick a strategy and do not write a trace. That is `/git-flow-master`'s job (Step 4). A plausible label here is the failure this gate exists to prevent, and a label without a trace is rejected anyway, so guessing only costs a round trip.
4. Append the block at the bottom of `implementation-plan.md` and to the orchestrator's turn summary.

The planner emits and never blocks. The orchestrator enforces the gate at the Stage 2 boundary, and only `/git-flow-master` fills `Decision trace:` and `Decided by:`.
