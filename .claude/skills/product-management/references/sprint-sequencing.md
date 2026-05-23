# Sprint Sequencing

> **Purpose**: After all epics, stories, and dependency links exist in Jira, compute a topologically-sorted execution plan. Execution Sprint 1 contains stories with no inbound dependency links; Execution Sprint N+1 contains stories whose dependencies all sit in Sprint ≤ N. This is the operational layer between "backlog seeded" and "team picks up first sprint" — it answers the question "what unblocks the team today?".
> **Use when**: A backlog seed or feature add just finished, dependency links just changed, or a PM asks for execution order.
> **Companion references**: `dependency-linking.md` (creates the links this sort consumes), `jira-operations.md` (issue + link fetch patterns), `product-backlog-seed.md`, `add-feature.md`, `epic-creation.md`.

---

## Sprint terminology recap

Two distinct layers share the word "sprint". Do not confuse them.

| Layer | Term | Source | Update cadence |
|---|---|---|---|
| Strategic | Master Sprint (1–7 typical) | `.context/master-implementation-plan.md` §5 | Almost never — locked at PRD time |
| Operational | Execution Sprint (1, 2, 3 …) | Topological sort of the link graph | Recomputed when stories or links change |

A Master Sprint is a thematic chunk of the roadmap ("Master Sprint 3: Reporting & Exports"). An Execution Sprint is the next ordered batch the team can start in parallel without waiting on anything else. One Master Sprint typically contains several Execution Sprints.

---

## Pre-conditions

- All in-scope epics and their child stories exist in Jira.
- All hard dependencies linked via `{{jira.link_types.dependencies}}` — or, when the project's Jira instance lacks that link type, the fallback `{{jira.link_types.blocks}}` or `{{jira.link_types.relates}}` per `references/dependency-linking.md`.
- `.agents/jira-link-types.json` is current. Refresh manually with `bun run jira:sync-link-types` (not auto-invoked — stale catalogs cause silent misclassification of link types).

---

## Algorithm — Kahn's topological sort

Methodology level. No code syntax.

1. Use `[ISSUE_TRACKER_TOOL]` to fetch every Story in scope (e.g. all children of every epic inside a Master Sprint) including the full `issuelinks` array per story.
2. Build a directed graph in memory. Nodes = story keys. Edges = outward `dependencies` link, oriented as "A depends on B" → edge `A → B` meaning "A needs B first". Treat `blocks` as the inverse direction of `dependencies` and normalize to the same orientation.
3. Compute in-degree per node — the count of edges pointing INTO that node, i.e. the number of stories this story is waiting on.
4. Initial frontier = nodes with in-degree 0. These form **Execution Sprint 1** — nothing blocks them.
5. Remove the frontier nodes from the graph. For each removed node, decrement the in-degree of every node that depended on it.
6. New frontier = nodes that now have in-degree 0. These form **Execution Sprint 2**.
7. Repeat until the graph is empty.
8. If the graph is non-empty AND no remaining node has in-degree 0 → **cycle detected**. Halt the sort and report.

---

## Sequencing rules

- Only `{{jira.link_types.dependencies}}` and `{{jira.link_types.blocks}}` contribute to the sort.
- `{{jira.link_types.relates}}` is informational. NEVER delay a story because of a `relates` link — these are soft references, not ordering constraints.
- A story without any inbound dependency edge lands in Execution Sprint 1.
- A story with multiple inbound dependency edges lands in `1 + max(predecessor sprints)`.
- Ties within a sprint are not ordered — every story in the same Execution Sprint is by definition parallel-safe.

---

## Cycle handling

A cycle in the `dependencies` graph is ALWAYS a bug. Either the AI mis-linked two stories during seeding, or the user declared a contradictory order (A depends on B AND B depends on A). Halt the sort immediately. Report:

- The fact that a cycle exists.
- The participating story keys (every node still in the graph after the sort stalled).
- A request to the user: resolve by removing or re-orienting at least one link, then re-run sprint sequencing.

NEVER attempt to break cycles automatically. The choice of which link to drop is a product decision, not an AI decision.

---

## Output — ALWAYS persist to `.context/PBI/sprint-sequence.md`

Overwrite on every re-run. No timestamped versioning, no archive folder — the only state that matters is the current snapshot of the link graph. Exact template:

```markdown
# Execution Sprint Sequence — {{master_sprint_name}}

| Execution Sprint | Parallel-safe count | Story keys | Notes |
|---|---|---|---|
| 1 | 4 | BK-2, BK-3, BK-18, BK-29 | No dependencies — start here |
| 2 | 3 | BK-4 (deps BK-2), BK-19 (deps BK-18), BK-30 (deps BK-29) | Single-step deps |
| … | … | … | … |

## Cycle warnings
- {{none | list of cycles with participating keys}}

## Soft dependencies (Relates To)
- {{listed for review; not enforced in the sort}}
```

The "Soft dependencies" section is informational — it lists `relates` links so the PM can spot stories that are conceptually adjacent even though the algorithm did not delay them.

---

## Invocation triggers

- **Automatic**: final phase of `add-feature.md` Phase 2B, once the full epic + stories + links exist.
- **Automatic**: final step of `product-backlog-seed.md`, after the initial seed completes.
- **On-demand**: top-level workflow `H` in `SKILL.md`. Trigger phrases include "qué historias trabajamos primero", "execution order", "sprint plan", "topological order", "what unblocks the team".
- **Re-run** whenever the dependency graph changes — a story added, a link added, a link removed. Stale `sprint-sequence.md` is worse than no file at all because it lies authoritatively.

---

## Hard rules — NEVER do these

- NEVER guess dependencies. Only links that actually exist in Jira count toward the sort. If a story "feels like" it depends on another, that is a refinement signal — go add the link via `dependency-linking.md`, then re-run the sort.
- NEVER skip cycle detection. Halting on a cycle is the whole point; silently ignoring one produces a wrong execution plan.
- NEVER conflate Master Sprint with Execution Sprint. They live at different layers and have different update cadences. The same story can sit in "Master Sprint 3, Execution Sprint 2" — both labels are valid simultaneously.
- NEVER treat `sprint-sequence.md` as the team's final sprint commitment. It is an INPUT to the human sprint-planning meeting (capacity, priorities, holidays, dependencies on other teams) — not an output of one.

---

## Output framing

`sprint-sequence.md` is consumed by humans (PMs, dev leads) during sprint planning AND by `/sprint-development` when picking up the next ticket. The file is the canonical answer to "what can the team start today without waiting on anything?". It does not decide what the team SHOULD work on next — priorities, capacity, and external commitments live elsewhere — but it bounds the set of stories the team CAN work on next without violating a dependency.
