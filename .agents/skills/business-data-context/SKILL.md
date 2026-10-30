---
name: business-data-context
description: "What the product under development IS at the data level: business entities and why they exist, their relationships, RLS policies and who can see which rows, the migrations that shaped them, state machines, automatic processes (Postgres triggers, cron jobs, webhooks) and the external integrations that read or write data. Load it whenever a task writes a migration, changes RLS, seeds data, reasons about an entity's lifecycle or status transitions, touches a trigger or a background job, or asks how the product works under the hood, even when nobody says 'data map'. Reads its map through `bun run context:map business-data-context`. Pure knowledge plus a self-update proposal path: NOT for running a story (that is /sprint-development), NOT for route contracts (business-api-context) or the feature and UI inventory (business-feature-context)."
license: MIT
compatibility: [claude-code, codex, opencode]
compact_rules: |
  - DO: read the map through `bun run context:map business-data-context` (or `--section <id>` for one entity or flow). NEVER read `references/business-data-map.html` raw: its SVG is most of the bytes and none of the facts.
  - DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `data`; never plan a migration as if the schema were empty.
  - DO: cite a fact with its section id and `data-updated` date. A section older than the migration it describes is a hypothesis to check with `[DB_TOOL]`, not an answer.
  - WHEN a session observes something that contradicts a section (a column, a policy, a trigger): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
  - DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no migration, no product code.
  - DO NOT: copy map content into this SKILL.md. Judgment (a rule for READING the data) goes in `## Rules` or `references/gotchas.md`, dated and measured.
  - Before a step that uses `db` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams, db]
---

# business-data-context

> Kind `context` with a declared write scope (`agentic-dev-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-dev-core/references/business-context-maps.md`.

## Compact Rules

- DO: read the map through `bun run context:map business-data-context` (or `--section <id>` for one entity or flow). NEVER read `references/business-data-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `data`; never plan a migration as if the schema were empty.
- DO: cite a fact with its section id and `data-updated` date. A section older than the migration it describes is a hypothesis to check with `[DB_TOOL]`, not an answer.
- WHEN a session observes something that contradicts a section (a column, a policy, a trigger): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no migration, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment (a rule for READING the data) goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `db` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.

**Read full SKILL.md when**: building a briefing for a migration, RLS or seed dispatch, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the product: **its data**. Which business entities exist and why, how they relate, which RLS policies decide who sees which rows, which migrations shaped the schema, which states each entity moves through and what fires the transitions, what runs automatically, which external services read or write it, and the end-to-end flows (`User -> Route -> Logic -> DB -> Response`) that move it. Loading it changes what the agent KNOWS; the only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-data-map.html` | the synthesis, one `<section>` per entity, flow, state machine, process and integration, plus `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the live Supabase database of the active environment (`[DB_TOOL]`, capability `db`) | schema, constraints, enums, RLS policies, triggers, real rows | wins over the map on any conflict |
| the migrations folder and the generated Supabase types | the schema's history and its typed shape | wins over the map for shape |
| `project-context` mode `data` | the generator that CREATEs the map and UPDATEs its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Column lists and raw DDL → the database itself, on demand through `[DB_TOOL]`.
- Route handlers, auth levels, payloads → `business-api-context`.
- Screens, CRUD actions and the feature catalog → `business-feature-context`.
- Domain vocabulary → the domain glossary `/project-foundation` seeds under `.context/business/` (hand-kept, append-only; `.agents/instructions/agent-context-map.md` §4 Key paths).
- Jira stories and their ACs → `.context/PBI/` (synced cache).

## References

- `references/business-data-map.html`: the map (generated; read through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's data map.
