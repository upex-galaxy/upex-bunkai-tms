# Dependency Linking

> **Purpose**: Turn story-to-story dependencies into real Jira issue links. A declaration inside `story.md` records what the author meant, but sprint-sequencing reads the Jira links to compute execution order, so without this phase the topological sort runs over an empty graph.
> **Use when**: All stories in an epic exist and sprint-sequencing has not run yet, or the link graph changes mid-flight.
> **Companion references**:
>
> - `jira-operations.md`: tool routing for the link-creation operation.
> - `sprint-sequencing.md`: the consumer of the link graph (topological sort).
> - `epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, `story-refinement.md`: the workflows that invoke this phase.

---

## When to invoke

- After all stories in an epic exist (Phase 2 of `add-feature.md`, terminal step of `epic-creation.md`, ready-for-dev gate of `story-refinement.md`).
- Before sprint-sequencing, which needs the link graph complete in Jira and not only declared locally.
- Again whenever stories are added to an existing epic, a story is re-scoped, or the explicit `**Blocked By:**` / `**Blocks:**` declarations change in any `story.md`.
- Skip it only when the epic has a single story (there is no graph to build), and still record `no_dependencies: true` in the workflow output so the consumer knows the phase ran.

---

## Link-type semantics

Workspace link-type names are resolved per slug from `.agents/jira-required.yaml` (catalog) and `.agents/jira-link-types.json` (workspace state). Read the table below by slug, never by literal name.

| Slug             | Workspace name (via slug)                           | Outward                                  | Inward                                   | Contributes to sprint-sequencing? | When to use                                                              |
| ---------------- | --------------------------------------------------- | ---------------------------------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `dependencies`   | `{{jira.link_types.dependencies.name}}`             | `{{jira.link_types.dependencies.outward}}` | `{{jira.link_types.dependencies.inward}}` | Yes                               | Canonical hard sequencing: the outward issue cannot start until the inward issue is Done. |
| `blocks`         | `{{jira.link_types.blocks.name}}`                   | `{{jira.link_types.blocks.outward}}`     | `{{jira.link_types.blocks.inward}}`      | Yes (synonym of `dependencies`)   | Jira built-in equivalent of `dependencies`; sprint-sequencing treats the two the same. |
| `relates`        | `{{jira.link_types.relates.name}}`                  | `{{jira.link_types.relates.outward}}`    | `{{jira.link_types.relates.inward}}`     | No, informational only            | Symmetric reference. Fallback target for `dependencies` only (direction is lost, see Fallback degradation). |
| `causes`         | `{{jira.link_types.causes.name}}`                   | `{{jira.link_types.causes.outward}}`     | `{{jira.link_types.causes.inward}}`      | No                                | Causal chain: bug triage links a defect to its root-cause story or an earlier defect. |
| `tested_by`      | `{{jira.link_types.tested_by.name}}`                | `{{jira.link_types.tested_by.outward}}`  | `{{jira.link_types.tested_by.inward}}`   | No                                | Story-to-test binding. The QA-side methodology owns it; it is listed here so you recognise it. |

---

## Source rules

A dependency needs observable evidence. When no source below supports an edge, skip it (or ask, when a person is present).

- PRD/SRS sequencing: the ordering in `.context/PRD/user-journeys.md` and `.context/SRS/functional-specs.md`. Functional Requirement `FR-X.2` typically depends on `FR-X.1` when both share a journey and the spec orders them sequentially.
- Master Sprint ordering: `.context/master-implementation-plan.md` declares the Master Sprint groupings. A story whose `**Source spec:**` lives in Master Sprint N depends on the foundational stories of Master Sprint N-1 when the data or auth model requires it.
- Data-model dependencies: the data map (`bun run context:map business-data-context`) declares entity relationships. If entity B has a foreign-key dependency on entity A, the story that creates B depends on the story that creates A.
- Explicit author intent: `Blocked By` / `Blocks` dependencies the author states in the session or wrote into the Jira description (`author-intent` in the matrix). A hand-edited local `story.md` does not count, because it is a read-only cache per `.agents/instructions/agent-local-context-pbi.md` §9. A human committed these, so they are the strongest signal.

When two or more sources disagree (say the PRD orders A → B but the data map orders B → A), create no link for that edge until the conflict is resolved, and put it in front of the person who can resolve it. Picking one silently would bury a real product question.

---

## Directionality reference

Jira link types are asymmetric: each has an outward phrase (read from the source issue) and an inward phrase (read from the target issue). The API stores one edge, and Jira renders it on both issues with the matching phrase.

| Perspective                         | Phrasing                                       | Issue role     |
| ----------------------------------- | ---------------------------------------------- | -------------- |
| From the dependent story            | `{{jira.link_types.dependencies.outward}}` (e.g. "depends on")     | `outwardIssue` |
| From the prerequisite story         | `{{jira.link_types.dependencies.inward}}` (e.g. "is dependency for") | `inwardIssue`  |

**Worked example.** Story `A` cannot start until story `B` is Done.

- API arguments: `outwardIssue = A`, `inwardIssue = B`.
- Render on issue `A`: `A {{jira.link_types.dependencies.outward}} B` → "A depends on B".
- Render on issue `B`: `B {{jira.link_types.dependencies.inward}} A` → "B is dependency for A".

One edge, two phrasings. The API never duplicates the link; both perspectives project the same edge.

---

## Fallback degradation

When the workspace lacks the canonical `dependencies` link type, the catalog declares `{{jira.link_types.dependencies.fallback}}` (`relates`) as the degradation target. `relates` is symmetric, so both sides read the same phrase and **direction is lost**.

When degrading:

1. Create the link using the fallback slug.
2. Tell the user verbatim which stories are affected and that direction was lost.
3. Record `link_degraded: dependencies → relates` in the workflow output so `sprint-sequencing.md` can skip these edges (recommended) or treat them as soft dependencies behind a warning.
4. Recommend creating the canonical `Dependencies` link type in the workspace and re-running the phase.

Ordering-sensitive dependencies on `relates` produce wrong execution sprints. Sprint-sequencing reads only `dependencies` and `blocks` for the topological sort, so a degraded edge drops out of it.

---

## Procedure

1. Identify each dependency from the four source rules above, and build an in-memory list of `(from, to, link_type_slug, source_of_decision)` tuples.
2. Resolve the link type via `{{jira.link_types.<slug>}}`. The default slug is `dependencies`; use `blocks` only when the existing story already declares "Blocks" explicitly and the user wants the built-in synonym.
3. Set the direction from the directionality table. The story that needs the other one done first is the `outwardIssue` ("depends on" perspective); the prerequisite is the `inwardIssue` ("is dependency for" perspective).
4. Check that the link type resolves in the workspace. If it does not, apply the fallback rules above before continuing.
5. Use `[ISSUE_TRACKER_TOOL]` to create the link, one call per edge. The tool layer owns the flag syntax, and some implementations are inverted relative to Jira's outward/inward semantics (measured: `acli`'s `--out` / `--in` flags), so read the owning tool skill's gotcha catalog before calling.
6. Verify direction after every `create`, before the next edge. Query the dependent's link list via `[ISSUE_TRACKER_TOOL]` and confirm the outward partner is the intended prerequisite:
   - For every edge declared as "A depends on B" in the confirmed matrix, list A's links and confirm the outward partner is B.
   - On a mismatch, flag it, delete the link, and recreate it with the arguments adjusted per the tool's gotcha catalog (for `acli`, swap `--out` / `--in`). Verify again before moving on.
   - Symmetric link types (`relates`) cannot be checked for direction. Note that in the matrix and rely on sprint-sequencing's `dependencies` / `blocks`-only filter.
7. Build the dependency matrix and show it to the user with the output template below, including a "verified direction" column so the user can audit at a glance.
8. Hand off to `sprint-sequencing.md`.

---

## Hard rules

- Create only the dependencies the four source rules support. An edge nobody can source is a guess, and a wrong edge reorders the whole sprint plan.
- Resolve link-type names via `{{jira.link_types.<slug>}}`. Literal names (`"Dependencies"`, `"Blocks"`, `"Relates"`) break in a workspace that renamed them.
- Keep `relates` out of ordering-sensitive dependencies: direction is lost and sprint-sequencing ignores it.
- Run this phase after creating multiple stories in an epic. Local declarations alone do not feed sprint-sequencing.
- Create links one call per edge and verify each direction afterward. The one-edge, two-phrasings model is easy to get backwards, and a round-trip read is the only reliable check.
- Read the owning tool skill's gotcha catalog before trusting its flag names. `acli` silently swaps the meaning of `--out` / `--in` relative to Jira's outward/inward semantics, and only the post-create direction check catches that.

---

## With nobody at the keyboard

Two steps here would otherwise wait for a person. Apply the decision protocol (`agentic-dev-core/references/decision-protocol.md`) and, when it does not settle the point, take the reversible path:

- Source conflict: create no link for the disputed edge, finish the rest, and list the conflict in the report.
- Missing link type: the fallback degradation above already continues without waiting; the report carries the `link_degraded` line.

---

## Output template

After all links exist, show the dependency matrix to the user. It is the audit trail: every edge traces back to its source rule.

```markdown
## Dependency matrix — {{epic_key}}

| From         | To           | Link type                                       | Source of decision                                  |
| ------------ | ------------ | ----------------------------------------------- | --------------------------------------------------- |
| {{story_a}}  | {{story_b}}  | `{{jira.link_types.dependencies.name}}`         | `business-data-context`: entity B FK to A           |
| ...          | ...          | ...                                             | ...                                                 |

### Degradations (if any)
- {{none | story_x → story_y degraded from `dependencies` to `relates`, direction lost}}
```

---

## Hand-off to sprint-sequencing

Dependency-linking is the prerequisite for `references/sprint-sequencing.md`, which runs Kahn's topological sort over the link graph to produce Execution Sprints (parallel-safe batches of stories). That sort reads only `dependencies` and `blocks` edges from Jira; `relates`, `causes` and `tested_by` are ignored even when present. Once every observable dependency is a Jira link and the matrix has been shown, hand off.
