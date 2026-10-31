# Workload Forecast — Stage 1 size indicator and commit plan

> Reference for sprint-development Stage 1 (Planning).
> Cited from: `SKILL.md` end-of-Stage-1, Stage 2, Stage 3.

## Purpose

Make the size of the change visible at planning time, when restructuring the work is cheap, and turn that size into a **commit plan** the implementer follows and the reviewer reads.

The delivery unit is fixed: **one pull request per user story** (bug, tech story). Size NEVER splits a story into several PRs. Granularity lives in **atomic commits** inside that single PR, and a big PR is reviewed commit by commit (`review-pr.md` § Reviewing a large PR).

The forecast is **informational, not a gate**. It never blocks Stage 2.

Background: a reviewer doing focused, defect-finding work loses effectiveness past roughly 400 lines read in one sitting (SmartBear, Cisco code-review studies). The remedy is not more PRs: it is a PR whose history is cut into commits small enough to read one at a time, with a guide telling the reviewer where to look first.

---

## Forecast block format (verbatim)

The planner subagent emits this block as the final artifact of Stage 1, at the bottom of the plan body (it lands in the Jira `spec_implementation_plan` field and the synced `implementation-plan.md`) and in the orchestrator turn-summary.

```
## Review Workload Forecast

Estimated: <X> additions + <Y> deletions = <Z> total lines
Size: Small | Medium | Large
Delivery: single-pr
Commit plan:
  1. <type>(<KEY>): <what this commit contains> — serves AC-<n>
  2. ...
Review guide: <for Medium/Large: reading order of the commits + the riskiest commits to scrutinise>
Notes: <optional: size-counting overrides, backlog-split recommendation>
```

Field rules:

- `<X>`, `<Y>`, `<Z>` are integers. `<Z> = <X> + <Y>`.
- `Size` is exactly one of `Small`, `Medium`, `Large` (indicator thresholds below).
- `Delivery` is always `single-pr`. There is no other value the planner may emit.
- `Commit plan` is an ordered list of the planned commits: what each contains and which acceptance criterion it serves. **REQUIRED when `Size` is `Medium` or `Large`**; optional (one line is enough) when `Small`. Commits are ordered so dependencies come first: schema/types, domain logic, API, UI, docs. Tests travel in the same commit as the behaviour they verify. Each commit must leave lint, types and tests green, so the history is bisectable and reviewable commit by commit.
- `Review guide` is REQUIRED for `Medium` and `Large`: the order a reviewer should read the commits and the riskiest commits to scrutinise (security, migrations, data integrity, shared contracts). Omit for `Small`.
- `Notes` records size-counting overrides (see "Size-counting notes") and, when applicable, the backlog-split recommendation (see "When a story is too large").

### Example (Large)

```
## Review Workload Forecast

Estimated: 1900 additions + 300 deletions = 2200 total lines
Size: Large
Delivery: single-pr
Commit plan:
  1. feat(BK-123): add reports table, RLS policies and generated types — serves AC-1, AC-4
  2. feat(BK-123): add report aggregation domain logic with unit tests — serves AC-2
  3. feat(BK-123): add GET /api/reports route with schema validation — serves AC-2, AC-3
  4. feat(BK-123): add reports page, filters and empty/error states — serves AC-1, AC-5
  5. docs(BK-123): update status report and release notes
Review guide: read 1 first (schema + RLS, highest risk: apply per the Bunkai rule MVP-ONE-DATABASE (`.agents/instructions/agent-project.md`) only after approval),
              then 2 (aggregation correctness), then 3 and 4 (thin wiring), 5 last.
Notes: types in commit 1 are generated; not counted toward Size.
```

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
- Size: `Small`. One or two commits; no review guide needed.

**Medium change** — 1 new file (~100 lines) + 5 modified files (~40 lines each):

- New: `100 × 1.5 = 150`
- Modified: `5 × 40 × 1.0 = 200`
- Sum: `350` × 1.2 = `420` total
- Size: `Medium`. Commit plan with 3-5 commits + a short review guide. Still ONE PR.

**Large change** — 10 new files (~80 lines each) + 8 modified files (~60 lines each):

- New: `10 × 80 × 1.5 = 1200`
- Modified: `8 × 60 × 1.0 = 480`
- Sum: `1680` × 1.2 = `2016` total
- Size: `Large`. Commit plan cut by layer (schema/types, domain, API, UI, docs) + review guide. Still ONE PR.

---

## Size indicators

| Total lines (`<Z>`) | Size   | What it changes                                                                                      |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `< 400`             | Small  | Proceed. Commit plan optional.                                                                       |
| `400 – 1500`        | Medium | Proceed. Commit plan + review guide required in the forecast block.                                   |
| `> 1500`            | Large  | Proceed. Commit plan + review guide required; check whether the story should be split in the backlog. |

These thresholds are **indicators**, not limits. No size blocks Stage 2 and no size produces more than one PR.

---

## One PR per story

The delivery is always `single-pr`: one branch, one PR, merged to the integration branch with a merge commit (`--no-ff`) so the per-commit history survives. How to cut commits, how to open a big PR and how Stage 3 reviews it: `/git-flow-master` § "Large changes: one PR, many commits" and `review-pr.md`.

Stacked or chained PRs are not an option the planner offers. They are a legacy pattern, allowed only when the user explicitly asks for them in that run. The planner never proposes them and never writes them into the forecast block.

---

## When a story is too large

If `Size` is `Large` AND the commit plan shows increments that each deliver value on their own, OR the story carries more than ~13 story points of real work, the remedy is at the **backlog level**, not the PR level:

- Add a `Notes:` line to the forecast block recommending that the STORY be split in the tracker through `/product-management`. Each resulting story gets its own plan, its own PR.
- This is a RECOMMENDATION recorded in the plan. It does not block implementation by default; absent a decision to split, the story proceeds as one PR with the commit plan above (Bunkai rule AI-LED-DECISIONS in `.agents/instructions/agent-project.md`: the AI decides, nobody waits).

---

## Size-counting notes

The 20% buffer and per-file multipliers are heuristics, not laws. Adjust the size count (and record the adjustment in `Notes:`) when:

- **Mechanical bulk change**: mass rename, formatter run, ESLint auto-fix sweep. Real cognitive load is far below the line count. Isolate it in its own commit, say so in the Review guide ("skim, mechanical"), and count it at a fraction.
- **Generated code**: OpenAPI types, Supabase types, GraphQL codegen output. Do not count generated files toward the size; mark them in the plan as `// generated, do not review`.
- **Vendor / dependency updates**: lockfile updates and `node_modules` are excluded by definition; don't even count them.
- **Test-heavy changes**: if the test:code ratio is much higher than 1:1 (e.g. table-driven test for a parser), the buffer can be reduced from 20% to 10% — tests are read with different cognitive load than production code.
- **Refactor-heavy changes**: when modifications are mostly deletions (extract function, kill dead code), the 70/30 add/delete split inverts. Override the split per file.

---

## Implementation pointers (for the planner subagent)

When emitting the forecast block:

1. Walk the impl-plan task list. For each task, identify the files it touches and the operation (`new`, `modify`, `delete`).
2. Eyeball the size of each file's change. Order-of-magnitude accuracy is the goal, not line-perfect prediction.
3. Apply the multipliers, sum, multiply by 1.2. Apply any size-counting notes.
4. Pick `Size` from the indicator table. Always write `Delivery: single-pr`.
5. For `Medium` / `Large`: write the commit plan (dependencies first, tests with their behaviour, each commit green) and the review guide. Map every commit to the AC it serves.
6. If the story is `Large` with independently valuable increments (or > ~13 points), add the backlog-split recommendation to `Notes:`.
7. Append the block at the bottom of the plan and to the orchestrator turn-summary.

The planner emits; nothing downstream is gated on it. Stage 2 implements the commit plan, one atomic commit per entry, adjusting the plan (and the Jira field) if reality diverges.
