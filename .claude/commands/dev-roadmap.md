---
name: dev-roadmap
description: Generate or update .context/dev-roadmap.md — the ticket-level dependency execution roadmap (which Jira story unblocks which, in what execution sprint, gated by which mockup). The sequence layer that sits BELOW the strategy layer (master-implementation-plan.md) and ABOVE per-story plans. Subsumes the topological execution-sprint sort formerly written to .context/PBI/sprint-sequence.md. Triggers on 'dev roadmap', 'dev-roadmap', 'roadmap de desarrollo', 'ticket-level roadmap', 'execution order', 'qué historia sigue', 'what unblocks the team', 'dependency roadmap', 'sprint sequence', 'orden de ejecución'. Hard gate: at least one epic with child stories in the issue tracker. Soft gates: business-data-map.md (epic backbone), master-design-plan.md (mockup-gates), master-implementation-plan.md (Master Sprint grouping). Do NOT use for: epic-level strategy (use /master-implementation-plan), per-story file plans (use /sprint-development), entity/flow mapping (use /business-data-map), feature inventory (use /business-feature-map).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Dev Roadmap Generator

Generate or update `.context/dev-roadmap.md` — the **ticket-level dependency execution roadmap**. It answers one question: **which Jira ticket do we work next, and what is blocking it?**

**Target**: $ARGUMENTS (Master Sprint name, epic key, or leave blank for the full active backlog)

---

## What this produces

A hand-curated-yet-regenerable document that converts the **Jira dependency-link graph + local design context** into an execution sequence the team can act on. It is the **sequence layer** in the 3-doc roadmap stack:

```
.context/master-implementation-plan.md   EPIC / strategy   "what to build & why that order"   (owner: /master-implementation-plan)
.context/dev-roadmap.md   ◄── THIS DOC    TICKET / sequence "what unblocks what, in what execution sprint"  (owner: /dev-roadmap)
.context/PBI/.../implementation-plan.md   STORY / files     "how to build one ticket"           (owner: /sprint-development)
```

The output contains:

- **§1 Authority split** — a plain-language "read me first" that tells an AI/human exactly what this doc owns vs delegates, and that status is queried, never frozen.
- **§2 Epic backbone** — the schema-forced epic spine (which epic must ship before which), derived from `business-data-map.md` entity topology.
- **§3 Story dependency graph** — the hard/soft edge list with the *reason* for each edge. This is the part nothing else holds — Jira issue-links are sparse and carry no reason.
- **§4 Execution sprints** — the topologically-sorted parallel-safe batches (Kahn's sort of the link graph). **This subsumes the former `.context/PBI/sprint-sequence.md`.**
- **§5 Mockup-gate registry** — which stories cannot start until a mockup lands (Critical Rule #15 / `master-design-plan.md` §8).
- **§6 Live status — query recipe** — NOT a status table. A recipe to fetch today's truth, plus the local-only knowledge Jira does not store (per-story pre-dev blockers, edge-mapping TODO).
- **§7 Maintenance protocol** — who owns what, what is durable vs volatile, when to re-run.

This is **NOT** the epic strategy (→ `/master-implementation-plan`), a per-story file plan (→ `/sprint-development`), a flow map (→ `business-data-map.md`), nor a feature catalog (→ `business-feature-map.md`).

---

## Subsumption note — this retires `sprint-sequence.md`

Earlier boilerplate versions persisted the Kahn topological sort to `.context/PBI/sprint-sequence.md` (owned by `/product-management`). That pure machine-derived table is a **strict subset** of this doc's §4. As of this command, the execution-sprint sort lives in **`.context/dev-roadmap.md` §4** and `/product-management` delegates to `/dev-roadmap` instead of writing `sprint-sequence.md`.

- The **sort algorithm** (Kahn) remains the single source of truth in `.claude/skills/product-management/references/sprint-sequencing.md` — this command reuses it for §4, it does not re-define it.
- The reason for the merge: `sprint-sequence.md` was overwrite-on-rerun (clobber-safe, machine-only) and could not hold the hand-authored durable layers (§2 backbone, §3 edge reasons, §5 mockup-gates, §6 local blockers). One doc with a split mutation model (regenerate §4, surgically preserve §2/§3/§5/§6) solves that.

---

## Sources (use ALL available)

| Source | Status | What to extract | Tool |
| ------ | ------ | --------------- | ---- |
| Issue tracker — epics + child stories + **full `issuelinks` array** | **HARD REQUIREMENT** | Story membership, `dependencies` / `blocks` / `relates` links — the edges the §4 sort consumes | `[ISSUE_TRACKER_TOOL]` |
| `.agents/jira-link-types.json` | **must be current** | Link-type slugs. Refresh with `bun run jira:sync-link-types` BEFORE sorting — a stale catalog silently misclassifies edges | Read + `bun run jira:sync-link-types` |
| `.context/business/business-data-map.md` §2 | Soft — warn if missing | Entity topology → the §2 epic backbone (no entity ships before the entities + RLS it depends on) | Read file |
| `.context/design/master-design-plan.md` §8 | Soft — warn if missing | US→Screen map + per-screen mockup status → the §5 mockup-gate registry (Critical Rule #15) | Read file |
| `.context/master-implementation-plan.md` §4–§5 | Soft | Master Sprint grouping — to tag each Execution Sprint with its parent Master Sprint | Read file |
| `.context/PBI/epic-tree.md` + `epics/` | If available | Local story-membership mirror + any hand-authored `context.md` notes (pre-dev blockers, open Qs) | Read files |

**Golden rule**: every §3 edge MUST cite a real source — a Jira `dependencies`/`blocks` link, a `business-data-map.md` entity dependency, or a `master-design-plan.md` mockup-gate. NEVER invent an edge because it "feels like" a dependency — that is a refinement signal: go add the link in the tracker via `product-management/references/dependency-linking.md`, then re-run.

---

## Mode detection

```
Does .context/dev-roadmap.md exist?
  → NO:  CREATE mode — generate the full doc from scratch.
  → YES: UPDATE mode — SURGICAL merge. NEVER clobber the whole file.
```

**UPDATE mode is split by mutation model — this is the #1 rule of this command:**

| Section | Mutation model on UPDATE |
| ------- | ------------------------ |
| §4 Execution sprints | **Regenerate** from the live link graph (clobber-safe — it is pure derived) |
| §2 backbone · §3 edges · §5 mockup-gates · §6 local blockers | **Preserve hand-authored content.** Append new items, flag conflicts, NEVER delete a hand-written edge/gate/blocker. Present a diff and wait for confirmation before writing. |
| §6 status table | There is none. If a prior version froze a status table, REMOVE it and replace with the query recipe. |

When the existing file was hand-authored (e.g. migrated from a project that wrote it manually), **adopt** its edges/gates as the baseline — reconcile against them, do not overwrite them.

---

## Discovery phases

### Phase 1 — Validation gate

#### 1.1 Issue-tracker reachability (HARD)
If no epic with child stories is reachable via `[ISSUE_TRACKER_TOOL]` → **STOP**:

> This command needs at least one epic with child stories (and their dependency links) in the issue tracker to compute an execution sequence. Seed the backlog with `/product-management` first, then re-invoke `/dev-roadmap`.

#### 1.2 Link-catalog freshness (HARD-ish)
Run `bun run jira:sync-link-types` so `.agents/jira-link-types.json` is current before building the graph. A stale catalog misclassifies `dependencies` vs `relates` and corrupts the sort.

#### 1.3 Soft-input checks
For each missing soft input, WARN and proceed, logging the gap in §6 edge-mapping TODO:
- No `business-data-map.md` → §2 epic backbone is built from Jira epic-links only (less reliable); note the limitation.
- No `master-design-plan.md` → §5 mockup-gate registry is empty; note that mockup-gating is unenforced until the design plan exists.

### Phase 2 — Epic backbone (§2)
From `business-data-map.md` §2 entity topology, order epics by forced dependency: no epic ships before the entities + access-control it depends on. Cross-check against Jira epic-level links. Output the schema-forced spine.

### Phase 3 — Story dependency graph (§3)
Fetch every in-scope story including its full `issuelinks`. For each edge, record: blocker → unblocked, hard/soft, and the **reason** (which shared entity, screen, or contract forces it). Hard = `dependencies`/`blocks`; soft = a real coupling that is buildable-but-low-value before the blocker (annotate, do not let it delay the sort).

### Phase 4 — Execution sprints (§4) — Kahn's sort
Apply the topological sort defined in `.claude/skills/product-management/references/sprint-sequencing.md` (Kahn's algorithm, cycle detection, sequencing rules). The output table replaces what used to live in `sprint-sequence.md`. On a detected cycle: HALT, report participating keys, ask the user to re-orient a link. NEVER break cycles automatically.

### Phase 5 — Mockup-gate registry (§5)
From `master-design-plan.md` §8 (US→Screen map) + §4 per-screen specs, list every story whose primary screen has no mockup yet. Each is 🔒-gated until the mockup lands or a spec-only departure is ratified (master-design-plan §5 + ADR) per Critical Rule #15.

### Phase 6 — Local knowledge (§6)
Collect the knowledge Jira does NOT store as queryable fields: per-story pre-dev blockers (gating Qs from shift-left refinement, found in `context.md` / shift-left docs), and the edge-mapping TODO (stories on the board not yet in the §3 graph, suspected supersedes). Preserve any of these already hand-written on UPDATE.

---

## Output structure

Write `.context/dev-roadmap.md` with this structure.

### 0. Header block
```markdown
> **What this is**: the ticket-level dependency execution roadmap. "What unblocks what, in what execution sprint."
> **Generated by**: `/dev-roadmap` — surgical UPDATE (preserves hand-authored edges/gates; regenerates only the §4 sort).
> **Last sync**: YYYY-MM-DD
> **Authority**: dependency edges + execution sprints + mockup-gates are owned HERE. Live story status is owned by the issue tracker (see §6 — never frozen here).
```

### 1. How to read this — authority split
Open with a **plain-language TL;DR** so any reader (especially an AI loading this cold) gets it in one breath:

```markdown
> **TL;DR — what this doc is, in one breath:**
> Answers ONE question: "which ticket do we work next, and what is blocking it?" It is NOT the strategy plan and does NOT store live status.
> - "why this epic order?" → master-implementation-plan.md (strategy). Not here.
> - "what ticket is next + what unblocks what?" → you are in the right doc (§3 graph, §4 sprints, §5 gates).
> - "is BK-X done yet?" → do NOT read it off this page. Query it live (§6).
> One-line rule: §2–§5 are durable truth; live status is always a query, never a paste.
```

Follow with the 3-layer stack diagram and an authority-split table (which doc is source of truth for: dependency edges → here; status/points → tracker; epic→story membership → tracker mirror; per-story file plan → /sprint-development).

### 2. Epic backbone — the schema-forced spine
ASCII spine + a table (Epic | Title | Depends on | Master Sprint). Order forced by entity topology, not preference.

### 3. Story dependency graph
ASCII graph of the active frontier + a **flat edge list** table (Blocker | Unblocks | Type hard/soft | Reason). This is the durable contract. Legend: `A ──> B` hard gate, `A ··> B` soft gate, 🔒 mockup-gated, status glyphs are NOT used here (status lives in §6).

### 4. Execution sprints
The Kahn-sort output (Execution Sprint | parallel-safe count | story keys | notes), each sprint tagged with its parent Master Sprint when `master-implementation-plan.md` is present. Include a "Cycle warnings" line and a "Soft dependencies (relates)" line per the sprint-sequencing schema. State explicitly: this section is regenerated from the live graph on every run.

### 5. Mockup-gate registry (Critical Rule #15)
Table (Mockup needed | Screen ref | Blocks | Status). A story whose primary screen has no mockup cannot start until it lands or a spec-only departure is ratified.

### 6. Live status — query it, never freeze it
NO status table. Instead:
- A short "why there is no table here" note (status is volatile; a pasted table lies within days).
- **Recipe A** — refresh local cache: `bun run jira:sync-issues` then read `.context/PBI/epic-tree.md`.
- **Recipe B** — one-shot live query via `[ISSUE_TRACKER_TOOL]` (the JQL for the active sprint board, ranked).
- A decision rule for "what is next to work" (highest-ranked story whose §3 blocker is dev-done AND §5 gate cleared AND §6 pre-dev blockers resolved).
- **Per-story pre-dev blockers** (local knowledge, NOT a tracker field) — a table.
- **Edge-mapping TODO** — stories seen on the board but not yet in §3.

### 7. Maintenance protocol
- §2–§5 edges/gates: hand-maintained here; add a new edge BEFORE the story goes Ready For Dev.
- §4 sort: regenerated by this command from the live link graph — never hand-edited.
- §6 live status: NEVER hand-maintained (it is a recipe). Only the local-only lists are hand-edited.
- Relation to `/master-implementation-plan`: intentionally separate — different inputs (strategy ← business-maps; this ← tracker links + design). Do not merge generators.
- Triggers to re-run: a gate releases (story dev-done), a new story is refined + linked, a mockup lands (clears a 🔒), or a Master Sprint closes.

---

## After generation

- Update `CLAUDE.md` "Key paths" to reference `.context/dev-roadmap.md` (ticket-level sequence) alongside `.context/master-implementation-plan.md` (strategy), if not already present.
- In UPDATE mode: show a diff summary scoped per section. Loudly flag any §3 edge or §5 gate that the regenerated graph would DROP — those are hand-authored and must be confirmed, never silently removed.
- Report:
  - Epics in backbone: N
  - Story edges (hard / soft): N / N
  - Execution sprints computed: N
  - Mockup-gated stories: N
  - Cycle warnings: N (HALT if > 0)
  - Pre-dev blockers carried forward: N
- If `sprint-sequence.md` still exists from a pre-subsumption run, note it is now superseded by §4 and can be deleted (do not delete it automatically — leave the call to the user).

---

## Rules / constraints

- **NEVER clobber hand-authored content.** UPDATE mode regenerates only §4; §2/§3/§5/§6 are surgically merged with confirmation.
- **NEVER freeze status.** §6 is a query recipe. Do not paste a status snapshot table — it rots in days and then lies.
- **NEVER invent edges.** Only links that exist in the tracker (or a cited data-map/design dependency) count. A "felt" dependency is a refinement signal → add the link, then re-run.
- **NEVER skip cycle detection.** A cycle in the dependency graph is always a bug — HALT and report, never auto-break.
- **NEVER conflate Master Sprint with Execution Sprint** — strategic vs operational layer; one Master Sprint holds several Execution Sprints.
- **NEVER merge this with `master-implementation-plan.md`** — different inputs, different cadence, different mutation model.
- Prose where it helps, tables for the edge list / sprints / gates, ASCII for the spine + frontier graph.
