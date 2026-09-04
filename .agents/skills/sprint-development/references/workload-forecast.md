# Workload Forecast — Stage 1 review-budget gate

> Reference for sprint-development Stage 1 (Planning).
> Cited from: `SKILL.md` end-of-Stage-1, beginning-of-Stage-2.

## Purpose

Protect the reviewer from oversized PRs and force the chain-strategy decision **before** any code is written. A reviewer doing focused, defect-finding work has a hard cognitive ceiling around **400 lines** of diff per PR (industry rule of thumb: SmartBear, Cisco). Past that point review quality collapses — comments shift from "is this correct?" to "LGTM" out of fatigue.

The forecast block makes the size cost visible at planning time, when restructuring the work is cheap. Once the diff exists, restructuring is expensive.

Two gates fall out of this:

1. **Size visibility** — every Stage 1 plan ends with a forecast block.
2. **Chain decision** — Stage 2 (Implementation) does NOT start while `risk = High` AND `chain_strategy = pending`. The orchestrator hands off to the `/git-flow-master` skill (Step 4 — chained-PR decision tree) to resolve, then returns.

---

## Forecast block format (verbatim)

The planner subagent emits this block as the final artifact of Stage 1, immediately after the `implementation-plan.md` is written. The block goes into the plan file (bottom of file) and into the orchestrator turn-summary.

```
## Review Workload Forecast

Estimated: <X> additions + <Y> deletions = <Z> total lines
400-line budget risk: Low | Medium | High
Chain strategy: stacked-to-main | feature-branch-chain | size-exception | pending
Decision trace: <verbatim tree answers + resolved leaf, or "n/a (risk not High)">
Decided by: </git-flow-master §Chained-PR decision tree | n/a>
Decision needed before apply: Yes | No
```

Field rules:

- `<X>`, `<Y>`, `<Z>` are integers. `<Z> = <X> + <Y>`.
- `risk` is exactly one of `Low`, `Medium`, `High` (see thresholds below).
- `chain_strategy` is one of: `stacked-to-main`, `feature-branch-chain`, `size-exception`, `pending`.
- `Decision trace` is REQUIRED whenever `risk = High` and `chain_strategy` is not `pending`. It records the actual walk of the chained-PR decision tree: each question, the answer given, the reason for that answer, and the leaf reached. It is `n/a (risk not High)` only when `risk` is `Low` or `Medium`.
- `Decided by` names the authority that produced the trace. For a High-risk decision that is always the `/git-flow-master` chained-PR decision tree.
- `Decision needed before apply`: `Yes` if `risk = High` AND the decision is unresolved (see "Gate behavior"). Otherwise `No`.

### Well-formed trace (example)

```
Chain strategy: feature-branch-chain
Decision trace: Q1=No (not mechanical — new domain logic, not a rename/formatter run) ·
                Q2=No (slice 2 cannot compile without the types introduced in slice 1) ·
                Q3=Yes (shared schema + base client consumed by slices 2-4) → feature-branch-chain
Decided by: /git-flow-master §Chained-PR decision tree (branching-strategies.md)
```

A trace that merely restates the conclusion ("chose feature-branch-chain because the change is large") is **malformed**: it does not evidence a walk of the tree. So is a trace whose answers do not lead to the stated leaf. Both are treated as no trace at all.

---

## Estimation algorithm

Per-file estimate, summed across all touched files, then padded for tests + docs.

### Per-file multipliers

| Operation     | Multiplier | Rationale                                                       |
| ------------- | ---------- | --------------------------------------------------------------- |
| New file      | × 1.5      | Full content, plus imports, types, scaffolding                  |
| Modified file | × 1.0      | Lines changed are roughly the lines reported in diff            |
| Deleted file  | × 0.5      | Counts as deletions only; reviewer cost is half a modified file |

For each affected file the planner estimates a base line count (eyeball: function bodies + types + imports). Multiply by the operation multiplier.

### Tests + docs buffer

After summing per-file estimates, add **20%** to cover:

- Unit tests added alongside the code (Stage 2 verification expects tests-with-code).
- Inline doc updates (JSDoc, READMEs, CHANGELOG entries shipped with the PR).
- Snapshot updates and fixture data.

`<Z> = ceil(sum_of_per_file_estimates × 1.2)`.

`<X>` (additions) and `<Y>` (deletions) are split heuristically from `<Z>`:

- New files contribute 100% to `<X>`.
- Modified files split 70/30 (additions / deletions) by default; overrideable for refactor-heavy work.
- Deleted files contribute 100% to `<Y>`.

### Worked examples

**Small change** — 3 modified files, ~50 lines each:

- `3 × 50 × 1.0 = 150`
- `× 1.2 = 180` total
- Risk: `Low` (under 200)

**Medium change** — 1 new file (~100 lines) + 5 modified files (~40 lines each):

- New: `100 × 1.5 = 150`
- Modified: `5 × 40 × 1.0 = 200`
- Sum: `350` × 1.2 = `420` total
- Risk: `High` (over 400) — chain decision required

**Large change** — 10 new files (~80 lines each) + 8 modified files (~60 lines each):

- New: `10 × 80 × 1.5 = 1200`
- Modified: `8 × 60 × 1.0 = 480`
- Sum: `1680` × 1.2 = `2016` total
- Risk: `High` — `feature-branch-chain` almost certainly the right strategy

---

## Risk thresholds

| Total lines (`<Z>`) | Risk   | Action                                                                                          |
| ------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `< 200`             | Low    | Proceed to Stage 2. No chain decision needed.                                                   |
| `200 – 400`         | Medium | Proceed; warn the user that the PR is approaching the budget. Chain optional.                   |
| `> 400`             | High   | GATE: `chain_strategy` must NOT be `pending`. Hand off to `/git-flow-master` (Step 4) if it is. |

---

## Chain strategy options

Each `chain_strategy` value maps to a concrete PR layout. Full patterns live in `/git-flow-master` (`references/branching-strategies.md` § Chained-PR decision tree).

### `stacked-to-main`

- 2 to 4 PRs, each `< 400` lines.
- Each PR is branched off `main` (or `staging`, per project Git Flow).
- PRs depend on previous PRs being merged before opening the next.
- Best for: linear feature work with clear sub-deliverables (foundation → feature slice → docs/tests).

### `feature-branch-chain`

- One long-lived integration branch (`feat/<key>-<slug>`) cut from `main`/`staging`.
- N child PRs each merge INTO the integration branch (not into `main`).
- Final merge to `main` is the integration branch as a single squash or merge commit.
- Best for: big architectural changes with shared scaffolding, where partial merges to `main` would leave it in a broken state.

### `size-exception`

- The diff is large but the change is mechanical and low-cognitive-cost: mass renames, formatter runs, generated code (OpenAPI types, lockfile updates), vendor library updates.
- Requires: explicit user override and a written rationale in the PR description (`Why size-exception:` line).
- Reviewer is told upfront not to read line-by-line; spot-check + CI signal is sufficient.

### `pending`

- The default before the chain decision is made.
- The forecast block emits `pending` whenever the planner is unsure.
- **Stage 2 cannot start while `risk = High` AND `chain_strategy = pending`.**

---

## Gate behavior

At the boundary between Stage 1 and Stage 2 the orchestrator inspects the forecast block. The gate is **fail-closed**: it opens on evidence, not on a label.

1. If `risk` is `Low` or `Medium`: proceed to Stage 2 regardless of `chain_strategy`.
2. If `risk` is `High`, compute `resolved` as: `chain_strategy` is one of `stacked-to-main` / `feature-branch-chain` / `size-exception` **AND** `Decision trace` is present, non-empty, names the tree answers, and those answers lead to the stated leaf.
   - **Not resolved** (either `pending`, or a strategy with a missing / empty / conclusion-only / inconsistent trace): **STOP**. Surface the forecast block to the user and hand off to `/git-flow-master` (Step 4 — chained-PR decision tree + concrete branch plan). When it returns, write BOTH the strategy and its trace into the forecast block in `implementation-plan.md`, then proceed to Stage 2.
   - **Resolved**: proceed to Stage 2. Stage 3 (Code Review) and Stage 4 (Staging Deploy) follow the chosen strategy's PR layout.

The gate is the only mechanism that can block Stage 2; it is not advisory. A `High`-risk plan without a resolved decision is an incomplete plan.

### Why the trace exists

Without it, this gate was fail-open. Its condition read "block while `chain_strategy = pending`", so any agent that wrote a plausible non-`pending` label — without ever walking the tree — disabled the gate that existed to force that decision. **Observed in production**: a planner emitted `Chain strategy: feature-branch-chain` as a guess; the gate never fired; the branch layout had to be redone by hand.

Requiring a citation, and treating a missing citation as the blocking value, closes it. This is the general rule for every gate in every skill: `agentic-dev-core/references/orchestration-doctrine.md` → "Gate design — fail-closed, evidence-bearing".

---

## When to override the algorithm

The 20% buffer and per-file multipliers are heuristics, not laws. Override (and document the override in the forecast block as a footnote) when:

- **Mechanical bulk change**: mass rename, formatter run, ESLint auto-fix sweep. Real cognitive load is far below the line count. Use `size-exception` with rationale.
- **Generated code**: OpenAPI types, Supabase types, GraphQL codegen output. Do not count generated files toward the budget; mark them in the plan as `// generated, do not review`.
- **Vendor / dependency updates**: lockfile updates and `node_modules` are excluded by definition; don't even count them.
- **Test-heavy PRs**: if the test:code ratio is much higher than 1:1 (e.g. table-driven test for a parser), the buffer can be reduced from 20% to 10% — tests are read with different cognitive load than production code.
- **Refactor-heavy PRs**: when modifications are mostly deletions (extract function, kill dead code), the 70/30 add/delete split inverts. Override the split per file.

Any override must be visible in the plan's forecast block (`Notes:` line under the block) so reviewers and auditors can see the reasoning.

---

## Implementation pointers (for the planner subagent)

When emitting the forecast block:

1. Walk the impl-plan task list. For each task, identify the files it touches and the operation (`new`, `modify`, `delete`).
2. Eyeball the size of each file's change. Don't over-engineer this — the goal is order-of-magnitude accuracy, not line-perfect prediction.
3. Apply the multipliers, sum, multiply by 1.2.
4. Pick a `chain_strategy`:
   - If `Z < 200` → `pending` is fine; no decision required. `Decision trace: n/a (risk not High)`.
   - If `Z` is `200 – 400` → suggest `stacked-to-main` if the work decomposes linearly; otherwise `pending`. `Decision trace: n/a (risk not High)`.
   - If `Z > 400` → emit `Chain strategy: pending`, leave `Decision trace:` EMPTY, and surface the gate. **Do NOT pick a strategy yourself and do NOT write a trace** — that is the `/git-flow-master` skill's job (Step 4). Writing a plausible label here is the failure this gate exists to prevent; a label without a trace is rejected anyway, so guessing only costs a round-trip.
5. Append the block at the bottom of `implementation-plan.md` and to the orchestrator turn-summary.

The planner does NOT block; it emits. The **orchestrator** enforces the gate at the Stage 2 boundary, and only `/git-flow-master` may fill `Decision trace:` / `Decided by:`.
