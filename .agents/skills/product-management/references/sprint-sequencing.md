# Sprint Sequencing

> **Purpose**: Once all epics, stories and dependency links exist in Jira, compute a topologically sorted execution plan: Execution Sprint 1 holds the stories with no inbound dependency link, and Execution Sprint N+1 holds the stories whose dependencies all sit in Sprint N or earlier. It answers "what unblocks the team next?". This file is the single source of truth for the algorithm. The sort result is persisted by `/project-context dev-roadmap`, which writes it as §4 of `.context/dev-roadmap.md` and preserves the hand-authored §2/§3/§5/§6. That command reuses this reference and does not redefine it.
> **Use when**: A backlog seed or feature add just finished, dependency links just changed, or a PM asks for execution order.
> **Companion references**: `dependency-linking.md` (creates the links this sort consumes), `jira-operations.md` (issue and link fetch patterns), `product-backlog-seed.md`, `add-feature.md`, `epic-creation.md`.

---

## Sprint terminology recap

Two layers share the word "sprint", and they are different things.

| Layer | Term | Source | Update cadence |
|---|---|---|---|
| Strategic | Master Sprint (1–7 typical) | `.context/master-implementation-plan.md` §5 | Almost never, locked at PRD time |
| Operational | Execution Sprint (1, 2, 3 …) | Topological sort of the link graph | Recomputed when stories or links change |

A Master Sprint is a thematic chunk of the roadmap ("Master Sprint 3: Reporting & Exports"). An Execution Sprint is the next ordered batch the team can start in parallel without waiting on anything else. One Master Sprint typically contains several Execution Sprints.

---

## Pre-conditions

- All in-scope epics and their child stories exist in Jira.
- All hard dependencies are linked via `{{jira.link_types.dependencies}}`, or via the fallback `{{jira.link_types.blocks}}` or `{{jira.link_types.relates}}` when the project's Jira instance lacks that link type (see `references/dependency-linking.md`).
- `.agents/jira-link-types.json` is current. Refresh it by hand with `bun run jira:sync-link-types`. Nothing runs it automatically, and a stale catalog silently misclassifies link types.

---

## Algorithm: Kahn's topological sort

This is the method, not code.

1. Use `[ISSUE_TRACKER_TOOL]` to fetch every Story in scope (e.g. all children of every epic inside a Master Sprint) including the full `issuelinks` array per story.
2. Build a directed graph in memory. Nodes = story keys. Edges = outward `dependencies` link, oriented as "A depends on B" → edge `A → B` meaning "A needs B first". Treat `blocks` as the inverse direction of `dependencies` and normalize to the same orientation.
3. Compute the in-degree of each node: the count of edges pointing into it, which is the number of stories it waits on.
4. The initial frontier is every node with in-degree 0. These form **Execution Sprint 1**, because nothing blocks them.
5. Remove the frontier nodes from the graph. For each removed node, decrement the in-degree of every node that depended on it.
6. New frontier = nodes that now have in-degree 0. These form **Execution Sprint 2**.
7. Repeat until the graph is empty.
8. If the graph is not empty and no remaining node has in-degree 0, there is a **cycle**. Halt the sort and report it.

---

## Sequencing rules

- Only `{{jira.link_types.dependencies}}` and `{{jira.link_types.blocks}}` contribute to the sort.
- `{{jira.link_types.relates}}` is informational. A `relates` link never delays a story; it is a soft reference, not an ordering constraint.
- A story without any inbound dependency edge lands in Execution Sprint 1.
- A story with multiple inbound dependency edges lands in `1 + max(predecessor sprints)`.
- Ties within a sprint are not ordered. Every story in the same Execution Sprint is parallel-safe by definition.

---

## Cycle handling

A cycle in the `dependencies` graph is always a bug: either a story was mis-linked during seeding, or the author declared a contradictory order (A depends on B and B depends on A). Halt the sort and report:

- that a cycle exists;
- the participating story keys (every node still in the graph after the sort stalled);
- a request to resolve it by removing or re-orienting at least one link, then re-run sprint sequencing.

Which link to drop is a product decision, so the sort never breaks a cycle on its own. The halt is already the unattended path: with nobody at the keyboard, report the cycle, write no §4, and finish the rest of the run.

---

## Output: the §4 section `/project-context dev-roadmap` emits

The algorithm produces the schema below. This skill writes no standalone file. Invoke `/project-context dev-roadmap` instead: it regenerates this content as §4 ("Execution sprints") of `.context/dev-roadmap.md` and preserves the hand-authored §2/§3/§5/§6 (epic backbone, edge reasons, mockup-gates, local blockers). §4 is overwritten on every re-run, because the only state that matters there is the latest snapshot of the link graph. Exact schema:

```markdown
# Execution Sprint Sequence — {{master_sprint_name}}

| Execution Sprint | Parallel-safe count | Story keys | Notes |
|---|---|---|---|
| 1 | 4 | PROJ-2, PROJ-3, PROJ-18, PROJ-29 | No dependencies, start here |
| 2 | 3 | PROJ-4 (deps PROJ-2), PROJ-19 (deps PROJ-18), PROJ-30 (deps PROJ-29) | Single-step deps |
| … | … | … | … |

## Cycle warnings
- {{none | list of cycles with participating keys}}

## Soft dependencies (Relates To)
- {{listed for review; not enforced in the sort}}
```

The "Soft dependencies" section is informational. It lists `relates` links so the PM can spot stories that are conceptually adjacent even though the algorithm did not delay them.

---

## Invocation triggers

- Automatic: final phase of `add-feature.md` Phase 2B, once the full epic, stories and links exist.
- Automatic: final step of `product-backlog-seed.md`, after the initial seed completes.
- On-demand: top-level workflow `H` in `SKILL.md`. Trigger phrases include "what do we work on first?", "execution order", "sprint plan", "topological order", "what unblocks the team".
- Re-run whenever the dependency graph changes (a story added, a link added, a link removed). The re-run invokes `/project-context dev-roadmap` to regenerate §4 of `.context/dev-roadmap.md`. A stale §4 is worse than none, because it lies with authority.

---

## Hard rules

- Count only links that exist in Jira. If a story "feels like" it depends on another, that is a refinement signal: add the link via `dependency-linking.md`, then re-run the sort.
- Run cycle detection every time. Halting on a cycle is the point of the sort, and ignoring one produces a wrong execution plan.
- Keep Master Sprint and Execution Sprint apart. They live at different layers with different update cadences, and the same story can sit in "Master Sprint 3, Execution Sprint 2" with both labels valid.
- Treat `.context/dev-roadmap.md` §4 as an input to the human sprint-planning meeting, never as the team's sprint commitment. Capacity, priorities, holidays and dependencies on other teams belong to people.

---

## Output framing

`.context/dev-roadmap.md` §4 is read by humans (PMs, dev leads) during sprint planning and by `/sprint-development` when it picks up the next ticket. It answers "what can the team start without waiting on anything?". It does not decide what the team should work on next, since priorities, capacity and external commitments live elsewhere, but it bounds the stories the team can take next without violating a dependency.
