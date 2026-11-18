# Dev Roadmap Generator

Generate or update `.context/dev-roadmap.md`, the **ticket-level dependency execution roadmap**. It answers one question: **which Jira ticket do we work next, and what is blocking it?**

**Target**: `$ARGUMENTS` forwarded by the alias or given in the invocation (Master Sprint name, epic key, or blank for the full active backlog)

---

## What this produces

A document that is hand-curated yet regenerable. It converts the **Jira dependency-link graph plus the local design context** into an execution sequence the team can act on, and it is the sequence layer of the 3-doc roadmap stack:

```
.context/master-implementation-plan.md   EPIC / strategy   "what to build & why that order"   (owner: /project-context master-plan)
.context/dev-roadmap.md   ◄── THIS DOC    TICKET / sequence "what unblocks what, in what execution sprint"  (owner: /project-context dev-roadmap)
.context/PBI/.../implementation-plan.md   STORY / files     "how to build one ticket"           (owner: /sprint-development)
```

The output has seven sections (see "Output structure"): the authority split (§1), the epic backbone (§2), the story dependency graph with a reason for every edge (§3), the execution sprints from the Kahn sort (§4), the mockup-gate registry (§5), the live-status query recipe (§6, a recipe and never a status table) and the maintenance protocol (§7). Nothing else holds the §3 reasons, because Jira issue-links are sparse and carry none.

The epic strategy belongs to `/project-context master-plan`, the per-story file plan to `/sprint-development`, flow maps to the data map in `business-data-context`, and the feature catalog to the feature map in `business-feature-context`.

---

## Subsumption note: this retires `sprint-sequence.md`

Earlier boilerplate versions persisted the Kahn topological sort to `.context/PBI/sprint-sequence.md`, owned by `/product-management`. That machine-derived table is a strict subset of §4 here. The execution-sprint sort now lives in **`.context/dev-roadmap.md` §4**, and `/product-management` delegates to `/project-context dev-roadmap` instead of writing `sprint-sequence.md`.

- The **sort algorithm** (Kahn) stays in `.agents/skills/product-management/references/sprint-sequencing.md`, its single source of truth. This command reuses it for §4 and does not redefine it.
- The two files merged because `sprint-sequence.md` was overwrite-on-rerun (machine-only) and could not hold the hand-authored durable layers (§2 backbone, §3 edge reasons, §5 mockup gates, §6 local blockers). One doc with a split mutation model solves that: regenerate §4, preserve §2, §3, §5 and §6.

---

## Sources

Use every source that is available.

| Source | Status | What to extract | Tool |
| ------ | ------ | --------------- | ---- |
| Issue tracker: epics and child stories | **Hard requirement** | Story membership and tracker rank | `[ISSUE_TRACKER_TOOL]` |
| Issue tracker: the stories' full `issuelinks` array | Soft, warn if empty | `dependencies`, `blocks` and `relates` links, the edges the §4 sort consumes | `[ISSUE_TRACKER_TOOL]` |
| `.agents/jira-link-types.json` | **Must be current** when any story carries a link | Link-type slugs. Refresh with `bun run jira:sync-link-types` before sorting, because a stale catalog silently misclassifies edges | Read + `bun run jira:sync-link-types` |
| The data map (`business-data-context`), `entities` and `access-control` sections | Soft, warn if missing | Entity topology for the §2 epic backbone (no entity ships before the entities and RLS it depends on) | `bun run context:map business-data-context` |
| `.context/design/master-design-plan.md` §8 | Soft, warn if missing | The US-to-Screen map and per-screen mockup status, for the §5 mockup-gate registry (Critical Rule #14, UI fidelity contract) | Read file |
| `.context/master-implementation-plan.md` §4 and §5 | Soft | Master Sprint grouping, to tag each Execution Sprint with its parent Master Sprint | Read file |
| `.context/PBI/epic-tree.md` and `epics/` | If available | The local story-membership mirror and any hand-authored `context.md` notes (pre-dev blockers, open questions) | Read files |

**Golden rule**: every §3 edge cites a real source: a Jira `dependencies` or `blocks` link, a data-map entity dependency, or a `master-design-plan.md` mockup gate. A backlog with no links yields a sparse graph (§1.2b). A dependency that only "feels" real is a refinement signal: add the link in the tracker through `product-management/references/dependency-linking.md`, then re-run.

---

## Mode detection

```
Does .context/dev-roadmap.md exist?
  → NO:  CREATE mode: generate the full doc from scratch.
  → YES: UPDATE mode: SURGICAL merge, the file is never rewritten whole.
```

**UPDATE mode splits by mutation model, and this split is the main rule of the command:**

| Section | Mutation model on UPDATE |
| ------- | ------------------------ |
| §4 Execution sprints | **Regenerate** from the live link graph (safe to overwrite, it is purely derived) |
| §2 backbone, §3 edges, §5 mockup gates, §6 local blockers | **Preserve hand-authored content.** Append new items and flag conflicts. A hand-written edge, gate or blocker is only removed by the owner. Present a diff and wait for confirmation before writing |
| §6 status table | There is none. If a prior version froze a status table, remove it and put the query recipe in its place |

When the existing file was hand-authored (for example, migrated from a project that wrote it manually), adopt its edges and gates as the baseline and reconcile against them.

---

## Discovery phases

### Phase 1: Validation gate

#### 1.1 Issue-tracker reachability (hard)

If no epic with child stories is reachable through `[ISSUE_TRACKER_TOOL]`, stop with:

> This command needs at least one epic with child stories in the issue tracker to compute an execution sequence. Seed the backlog with `/product-management` first, then re-invoke `/project-context dev-roadmap`.

#### 1.2 Link-catalog freshness (hard, only when links exist)

When any in-scope story carries an issue link, run `bun run jira:sync-link-types` so `.agents/jira-link-types.json` is current before building the graph. A stale catalog misclassifies `dependencies` and `relates` and corrupts the sort.

#### 1.2b No dependency links (soft)

A backlog with epics and stories but no dependency links is normal for a team that never used them, and common in an app adopted mid-life. It is not a stop: warn and continue.

- §3 holds only the edges a cited source forces (a data-map entity dependency, a `master-design-plan.md` mockup gate). Every in-scope story with no edge goes to the §6 Edge-mapping TODO.
- §4 is still the Kahn sort, over that sparse graph. Stories with no upstream edges share the first Execution Sprint in tracker rank order, and the section says the sort ran without tracker links.
- The report recommends linking the stories through `product-management/references/dependency-linking.md` before the next run. A link added only to make the graph look complete is a made-up link.

#### 1.3 Soft-input checks

For each missing soft input, warn, continue, and log the gap in the §6 edge-mapping TODO:

- Data map not generated (placeholder notice): build the §2 epic backbone from Jira epic links only, which is less reliable, and note the limitation. With neither a data map nor epic links, §2 lists the epics in tracker rank order and says no dependency forces that order.
- No `master-design-plan.md`: the §5 mockup-gate registry is empty, and the note says mockup gating is unenforced until the design plan exists.

### Phase 2: Epic backbone (§2)

From the data map's entity topology (`bun run context:map business-data-context --section entities`), order the epics by forced dependency: no epic ships before the entities and access control it depends on. Cross-check against Jira epic-level links. The output is the schema-forced spine.

### Phase 3: Story dependency graph (§3)

Fetch every in-scope story with its full `issuelinks`. For each edge, record the blocker, the unblocked story, hard or soft, and the **reason** (which shared entity, screen or contract forces it). Hard means `dependencies` or `blocks`. Soft means a real coupling that is buildable but low-value before the blocker: annotate it and keep it from delaying the sort.

### Phase 4: Execution sprints (§4), Kahn's sort

Apply the topological sort defined in `.agents/skills/product-management/references/sprint-sequencing.md` (Kahn's algorithm, cycle detection, sequencing rules). The output table replaces what used to live in `sprint-sequence.md`. A cycle is always a bug in the graph: halt, report the participating keys, and ask the user to re-orient a link. The command never breaks a cycle on its own.

### Phase 5: Mockup-gate registry (§5)

From `master-design-plan.md` §8 (US-to-Screen map) and §4 (per-screen specs), list every story whose primary screen has no mockup yet. Each one is 🔒-gated until the mockup lands or a spec-only departure is ratified (`master-design-plan.md` §5 plus an ADR), per Critical Rule #14, UI fidelity contract.

### Phase 6: Local knowledge (§6)

Collect what Jira does not store as queryable fields: per-story pre-dev blockers (gating questions from shift-left refinement, found in `context.md` and the shift-left docs) and the edge-mapping TODO (stories on the board that are not yet in the §3 graph, suspected supersedes). On UPDATE, preserve any of these already written by hand.

---

## Output structure

Write `.context/dev-roadmap.md` with this structure.

### 0. Header block

```markdown
> **What this is**: the ticket-level dependency execution roadmap. "What unblocks what, in what execution sprint."
> **Generated by**: `/project-context dev-roadmap` — surgical UPDATE (preserves hand-authored edges/gates; regenerates only the §4 sort).
> **Edges last updated**: YYYY-MM-DD
> **Mockup gates last updated**: YYYY-MM-DD
> **Status snapshot**: none — status is queried per §6, never stored here.
> **Authority**: dependency edges + execution sprints + mockup-gates are owned HERE. Live story status is owned by the issue tracker (see §6 — never frozen here).
```

Use two separate dates plus the explicit "no status snapshot" line. A single "Last sync" date invites the reader to treat everything on the page as fresh, availability included, and the durable layers (edges, gates) move on a different axis from a ticket's live status. A recent edge date says nothing about whether PROJ-39 is still open.

### 1. How to read this: authority split

Open with a **plain-language TL;DR**, so any reader (especially an AI loading the file cold) gets the point at once:

```markdown
> **TL;DR — what this doc is, in one breath:**
> Answers ONE question: "which ticket do we work next, and what is blocking it?" It is NOT the strategy plan and does NOT store live status.
> - "why this epic order?" → master-implementation-plan.md (strategy). Not here.
> - "what ticket is next + what unblocks what?" → you are in the right doc (§3 graph, §4 sprints, §5 gates).
> - "is PROJ-X done yet?" → do NOT read it off this page. Query it live (§6).
> One-line rule: §2–§5 are durable truth; live status is always a query, never a paste.
```

Follow it with the 3-layer stack diagram and an authority-split table: dependency edges are owned here, status and points by the tracker, epic-to-story membership by the tracker mirror, and the per-story file plan by `/sprint-development`.

### 2. Epic backbone: the schema-forced spine

An ASCII spine plus a table (Epic | Title | Depends on | Master Sprint). Entity topology forces the order, not preference.

### 3. Story dependency graph

An ASCII graph of the active frontier plus a **flat edge list** table (Blocker | Unblocks | Type hard/soft | Reason). The edge list is the durable contract. Legend: `A ──> B` hard gate, `A ··> B` soft gate, 🔒 mockup-gated. Status glyphs do not appear here, because status lives in §6.

### 4. Execution sprints

The Kahn-sort output (Execution Sprint | parallel-safe count | story keys | notes), each sprint tagged with its parent Master Sprint when `master-implementation-plan.md` exists. Include a "Cycle warnings" line and a "Soft dependencies (relates)" line per the sprint-sequencing schema. State that this section is regenerated from the live graph on every run.

**Conditional phrasing is required in §3 and §4.** These sections describe order, not availability, and the wording has to make that impossible to misread:

| Reads as status (avoid) | Reads as order (use) |
| ----------------------- | -------------------- |
| "PROJ-39 workable now" | "PROJ-39 workable once PROJ-38 is dev-done" |
| "ready", "unblocked", "available", "next up", "can start now" | "unblocked by PROJ-38", "no upstream edges", "first in Execution Sprint 2" |
| "already done", "shipped" | (say nothing about completion; that is §6) |

The same holds in the user's language: any phrasing that implies a ticket's current state is out of §3 and §4. A story with no upstream edges is described as having no upstream edges, never as "ready to work", because whether it can be picked up depends on its live status, which this page does not know.

### 5. Mockup-gate registry (Critical Rule #14, UI fidelity contract)

A table (Mockup needed | Screen ref | Blocks | Status). A story whose primary screen has no mockup cannot start until the mockup lands or a spec-only departure is ratified.

### 6. Live status: query it, never freeze it

There is no status table. The section holds:

- A short note on why: status is volatile, and a pasted table lies within days.
- **Recipe A**, refresh the local cache: `bun run jira:sync-issues`, then read `.context/PBI/epic-tree.md`.
- **Recipe B**, a one-shot live query through `[ISSUE_TRACKER_TOOL]` (the JQL for the active sprint board, ranked).
- A decision rule for "what is next to work": the highest-ranked story whose §3 blockers are dev-done **per the live query, never per this page**, with its §5 gate cleared and its §6 pre-dev blockers resolved. The query runs on the candidate and on its direct blockers before anyone commits to a ticket, which is what `/sprint-development` Phase 0b enforces.
- **Per-story pre-dev blockers** (local knowledge, not a tracker field), as a table.
- Edge-mapping TODO: list the stories seen on the board that are not yet in §3.

### 7. Maintenance protocol

- §2 to §5 edges and gates are maintained by hand here. Add a new edge before the story goes Ready For Dev.
- The §4 sort is regenerated by this command from the live link graph and is never hand-edited.
- §6 live status is a recipe, so nobody maintains it by hand. Only the local-only lists are hand-edited.
- Header dates: bump `Edges last updated` only when §2 or §3 changed, and `Mockup gates last updated` only when §5 changed. Each date tracks its own layer, and no combined date exists.
- Relation to `/project-context master-plan`: the two are separate on purpose, with different inputs (strategy comes from the business maps, this one from tracker links and design) and different cadence. Keep two generators.
- Re-run when a gate releases (a story is dev-done), a new story is refined and linked, a mockup lands (clearing a 🔒), or a Master Sprint closes.

---

## After generation

- **Key paths pointer.** The shared Key paths in `.agents/instructions/agent-context-map.md` already name `.context/dev-roadmap.md` (ticket-level sequence) next to `.context/master-implementation-plan.md` (strategy). Only when this project's copy lacks it, add it to `.agents/instructions/agent-project.md` (`## Key paths (this project)`). Do not write it into `AGENTS.md`, a shared section or the `CLAUDE.md` shim.
- **UPDATE mode.** Show a diff summary scoped per section. Flag loudly any §3 edge or §5 gate the regenerated graph would drop: those are hand-authored, and the owner confirms each one.
- Report:
  - Epics in backbone: N
  - Story edges (hard / soft): N / N
  - Execution sprints computed: N
  - Mockup-gated stories: N
  - Cycle warnings: N (halt if above 0)
  - Pre-dev blockers carried forward: N
- If `sprint-sequence.md` still exists from a pre-subsumption run, say that §4 supersedes it and it can be deleted. The user decides; the command does not delete it.

---

## With nobody at the keyboard

This command waits for a person at three points: the tracker reachability stop (1.1), the UPDATE confirmation, and the cycle halt (Phase 4). Decision rules live in `agentic-dev-core/references/decision-protocol.md`.

- Tracker unreachable: stop and report, since there is nothing to sort.
- UPDATE mode: write the candidate next to the existing file (never over it), put the diff summary and every dropped-edge flag in the report, and leave the overwrite to the owner. A delegating brief that already approves the overwrite replaces that wait.
- Cycle: write nothing to §4, report the participating keys, and leave the link change to the owner.

---

## Rules / constraints

- Hand-authored content survives: UPDATE regenerates §4 only, and §2, §3, §5 and §6 are merged surgically with confirmation.
- A pasted status table rots within days and then lies, so §6 stays a recipe. For the same reason §3 and §4 use the conditional phrasing of the §4 table.
- One freshness date per layer plus "Status snapshot: none". A single date makes a durable-layer refresh look like a status refresh, which is how a stale recommendation gets made from a page that looks current.
- Edges come from tracker links or a cited data-map or design dependency. A felt dependency means adding the link, then re-running.
- Cycle detection always runs. A cycle is a bug in the graph: halt and report it.
- Master Sprint (strategic) and Execution Sprint (operational) are different layers, and one Master Sprint holds several Execution Sprints.
- This doc stays separate from `master-implementation-plan.md`: different inputs, cadence and mutation model.
- Prose where it helps, tables for the edge list, sprints and gates, ASCII for the spine and the frontier graph.
