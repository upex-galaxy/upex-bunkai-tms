# Dependency Linking

> **Purpose**: Reflect story-to-story dependencies as real Jira issue links — not just local declarations inside `story.md`. Local declarations document author intent; Jira links are the operational source of truth that sprint-sequencing reads to compute execution order. Without this phase, the dependency graph exists only in the methodology docs and the topological sort runs over an empty graph.
> **Use when**: After all stories in an epic exist, before invoking sprint-sequencing, or any time the link graph changes mid-flight.
> **Companion references**:
>
> - `jira-operations.md` — tool routing for the link-creation operation.
> - `sprint-sequencing.md` — the consumer of the link graph (topological sort).
> - `epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, `story-refinement.md` — workflows that invoke this phase.

---

## When to invoke

- After all stories in an epic exist (Phase 2 of `add-feature.md`, terminal step of `epic-creation.md`, ready-for-dev gate of `story-refinement.md`).
- Before invoking sprint-sequencing — `sprint-sequencing.md` depends on the link graph being complete in Jira, not just declared locally.
- Re-run whenever new stories are added to an existing epic, when an existing story is re-scoped, or when explicit `**Blocked By:**` / `**Blocks:**` declarations change in any `story.md`.
- Skip only when the epic contains a single story (no graph to build) — but still record `no_dependencies: true` in the workflow output so the consumer knows the phase ran.

---

## Link-type semantics

Workspace link-type names are resolved per slug from `.agents/jira-required.yaml` (catalog) and `.agents/jira-link-types.json` (workspace state). Always read the table below by slug, never by literal name.

| Slug             | Workspace name (via slug)                           | Outward                                  | Inward                                   | Contributes to sprint-sequencing? | When to use                                                              |
| ---------------- | --------------------------------------------------- | ---------------------------------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `dependencies`   | `{{jira.link_types.dependencies.name}}`             | `{{jira.link_types.dependencies.outward}}` | `{{jira.link_types.dependencies.inward}}` | Yes                               | Canonical hard sequencing — outward issue cannot start until inward issue is Done. |
| `blocks`         | `{{jira.link_types.blocks.name}}`                   | `{{jira.link_types.blocks.outward}}`     | `{{jira.link_types.blocks.inward}}`      | Yes (synonym of `dependencies`)   | Jira built-in equivalent of `dependencies`. Treated identically by sprint-sequencing. |
| `relates`        | `{{jira.link_types.relates.name}}`                  | `{{jira.link_types.relates.outward}}`    | `{{jira.link_types.relates.inward}}`     | No — informational only           | Symmetric reference. Fallback target only for `dependencies` (direction lost — see degradation rules). |
| `causes`         | `{{jira.link_types.causes.name}}`                   | `{{jira.link_types.causes.outward}}`     | `{{jira.link_types.causes.inward}}`      | No                                | Causal chain — bug triage links a defect to the root-cause story or earlier defect. |
| `tested_by`      | `{{jira.link_types.tested_by.name}}`                | `{{jira.link_types.tested_by.outward}}`  | `{{jira.link_types.tested_by.inward}}`   | No                                | Story-to-test binding — owned by the QA-side methodology, surfaced here for cross-skill awareness. |

---

## Source rules

Dependencies derive ONLY from observable evidence. Never invent — if no source supports the link, ask the user or skip.

- **PRD/SRS sequencing** — `.context/PRD/user-journeys.md` and `.context/SRS/functional-specs.md` ordering. Functional Requirement `FR-X.2` typically depends on `FR-X.1` when both share a journey and the spec orders them sequentially.
- **Master Sprint ordering** — `.context/master-implementation-plan.md` declares Master Sprint groupings. A story whose `**Source spec:**` lives in Master Sprint N depends on the foundational stories of Master Sprint N-1 when the data or auth model requires it.
- **Data-model dependencies** — `.context/business/business-data-map.md` declares entity relationships. If entity B has a foreign-key dependency on entity A, the story that creates entity B depends on the story that creates entity A.
- **Explicit author intent** — `**Blocked By:**` / `**Blocks:**` lines inside the story's local `story.md`. These are the strongest signal because a human author committed them.

If two or more sources disagree (e.g. PRD orders A → B but data-map orders B → A), surface the conflict to the user and ask for resolution before creating any link. Do not silently pick one.

---

## Directionality reference

Jira link types are asymmetric — each has an outward phrase (read from the source issue) and an inward phrase (read from the target issue). The link is a single edge in the API, but renders bidirectionally with the matching phrase on each side.

| Perspective                         | Phrasing                                       | Issue role     |
| ----------------------------------- | ---------------------------------------------- | -------------- |
| From the dependent story            | `{{jira.link_types.dependencies.outward}}` (e.g. "depends on")     | `outwardIssue` |
| From the prerequisite story         | `{{jira.link_types.dependencies.inward}}` (e.g. "is dependency for") | `inwardIssue`  |

**Worked example.** Story `A` cannot start until story `B` is Done.

- API arguments: `outwardIssue = A`, `inwardIssue = B`.
- Render on issue `A`: `A {{jira.link_types.dependencies.outward}} B` → "A depends on B".
- Render on issue `B`: `B {{jira.link_types.dependencies.inward}} A` → "B is dependency for A".

Single edge, asymmetric phrasing. The API never duplicates the link — both perspectives are projections of the same edge.

---

## Fallback degradation

When the workspace lacks the canonical `dependencies` link type, the catalog declares `{{jira.link_types.dependencies.fallback}}` (`relates`) as the degradation target. `relates` is symmetric — both sides read the same outward/inward phrase, so **direction is lost**.

When degrading:

1. Create the link using the fallback slug.
2. Surface the degradation to the user verbatim — name the affected stories and the lost direction.
3. Record `link_degraded: dependencies → relates` in the workflow output so `sprint-sequencing.md` can either skip these edges (recommended) or treat them as soft dependencies behind a warning.
4. Recommend the user creates the canonical `Dependencies` link type in the workspace and re-runs the phase.

Never silently use `relates` for ordering-sensitive dependencies. Sprint-sequencing reads only `dependencies` + `blocks` for the topological sort; degrading to `relates` removes the edge from the sort and produces wrong execution sprints.

---

## Procedure

1. **Identify each dependency** from the four source-rule categories above. Build an in-memory list of `(from, to, link_type_slug, source_of_decision)` tuples.
2. **Resolve the link type** via `{{jira.link_types.<slug>}}`. Default slug is `dependencies`; use `blocks` only when the existing story already declares "Blocks" explicitly and the user wants the built-in synonym.
3. **Determine direction** per the directionality table. The story that needs the other one done first is the `outwardIssue` ("depends on" perspective). The prerequisite is the `inwardIssue` ("is dependency for" perspective).
4. **Verify the link type resolves** in the workspace. If absent, apply the fallback rules above before continuing.
5. **Use `[ISSUE_TRACKER_TOOL]` to create the link** — one call per edge, never batch into a single multi-link operation. The tool layer owns the flag syntax; some implementations (notably `acli`'s `--out` / `--in` flags) are EMPIRICALLY INVERTED relative to Jira's outward/inward semantics — see the owning tool skill's gotcha catalog before calling.
6. **Verify direction (MANDATORY).** Immediately after each `create`, query the dependent's link list via `[ISSUE_TRACKER_TOOL]` and confirm the outward partner matches the intended prerequisite. The methodology rule:
   - For every edge declared as "A depends on B" in the local matrix → list A's links → confirm the outward partner is B.
   - Mismatch → flag, delete the link, recreate with arguments adjusted per the tool's gotcha catalog (e.g. swap `--out` / `--in` for `acli`). Re-verify before moving on.
   - Symmetric link types (`relates`) cannot be verified for direction — note this in the matrix and rely on sprint-sequencing's `dependencies` / `blocks`-only filter.
7. **Build the dependency matrix** and surface it to the user using the output template below. Include a "verified direction" column so the user can audit at a glance.
8. **Hand off** to `sprint-sequencing.md`.

---

## Hard rules — NEVER do these

- NEVER invent dependencies. The four source rules are exhaustive — if no source supports the edge, ask the user or skip.
- NEVER hardcode link-type names (`"Dependencies"`, `"Blocks"`, `"Relates"`). Always resolve via `{{jira.link_types.<slug>}}`.
- NEVER use `relates` for ordering-sensitive dependencies. Direction is lost; sprint-sequencing ignores it.
- NEVER skip the dependency-linking phase after creating multiple stories in an epic. Local declarations alone do not feed sprint-sequencing.
- NEVER batch create links in a single tool call without verifying each direction afterward. The single-edge / dual-phrasing model is easy to get wrong; round-trip verification is the only safe check.
- NEVER trust the tool layer's flag naming without consulting the owning tool skill's gotcha catalog first. At least one production tool (`acli`) silently swaps the meaning of `--out` / `--in` relative to Jira's outward/inward semantics; the methodology has no way to detect this without the post-create direction verification step.

---

## Output template

After all links exist, surface the dependency matrix to the user. The matrix is the audit trail — every edge is traceable back to its source rule.

```markdown
## Dependency matrix — {{epic_key}}

| From         | To           | Link type                                       | Source of decision                                  |
| ------------ | ------------ | ----------------------------------------------- | --------------------------------------------------- |
| {{story_a}}  | {{story_b}}  | `{{jira.link_types.dependencies.name}}`         | business-data-map.md — entity B foreign-keys to A   |
| ...          | ...          | ...                                             | ...                                                 |

### Degradations (if any)
- {{none | story_x → story_y degraded from `dependencies` to `relates` — direction lost}}
```

---

## Hand-off to sprint-sequencing

Dependency-linking is the prerequisite for `references/sprint-sequencing.md`, which runs Kahn's topological sort over the link graph to produce Execution Sprints (parallel-safe batches of stories). Sprint-sequencing reads only `dependencies` + `blocks` edges from Jira — `relates`, `causes`, and `tested_by` are ignored for the sort even when present. Once every observable dependency is reflected as a Jira link and the matrix is surfaced to the user, hand off.
