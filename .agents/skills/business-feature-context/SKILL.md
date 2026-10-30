---
name: business-feature-context
description: "What the product under development DOES for its users, feature by feature: the feature catalog grouped by module, the CRUD matrix (which role can create, read, update or delete which entity, from which screen), the UI inventory (pages, forms, navigation, guards) and the flows that cross several features. Load it whenever a task builds or changes a screen, a form, a CRUD action, navigation or a role gate, scopes where a story fits in the product, or asks what a user can do in the app, even when nobody says 'feature map'. Reads its map through `bun run context:map business-feature-context`. Pure knowledge plus a self-update proposal path: NOT the per-screen design spec (that is the master design plan), NOT for entities (business-data-context) or route contracts (business-api-context)."
license: MIT
compatibility: [claude-code, codex, opencode]
compact_rules: |
  - DO: read the map through `bun run context:map business-feature-context` (or `--section <id>` for one feature or module). NEVER read `references/business-feature-map.html` raw: its SVG is most of the bytes and none of the facts.
  - DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `features`; never place a story as if the product had no features.
  - DO: take how a screen LOOKS from the live UI and the master design plan (`AGENTS.md` Rule 14), and what a feature DOES from the map. On a conflict the running app wins for behaviour.
  - WHEN a session observes something that contradicts a section (a CRUD action, a role gate, a page the inventory lacks): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
  - DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no design file, no product code.
  - DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
  - Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams]
---

# business-feature-context

> Kind `context` with a declared write scope (`agentic-dev-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-dev-core/references/business-context-maps.md`.

## Compact Rules

- DO: read the map through `bun run context:map business-feature-context` (or `--section <id>` for one feature or module). NEVER read `references/business-feature-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `features`; never place a story as if the product had no features.
- DO: take how a screen LOOKS from the live UI and the master design plan (`AGENTS.md` Rule 14), and what a feature DOES from the map. On a conflict the running app wins for behaviour.
- WHEN a session observes something that contradicts a section (a CRUD action, a role gate, a page the inventory lacks): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no design file, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.

**Read full SKILL.md when**: building a briefing for a UI, CRUD or navigation dispatch, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the product: **its features as a user meets them**. Which features exist and in which module, which role can perform which CRUD action from which screen, which pages, forms and guards make up the UI, and the flows that only make sense across several features. Loading it changes what the agent KNOWS; the only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-feature-map.html` | the synthesis: a `<section>` per module or feature, the CRUD matrix, the UI inventory, plus `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the frontend tree (routes, pages, forms, guards) | what is built | wins over the map on any conflict |
| the running app of the active environment | what a user really sees | wins for behaviour |
| the master design plan (`/design-system`, `AGENTS.md` Rule 14) | per-screen specs and the US→Screen map | owns how a screen should look; cited, never restated |
| `business-data-context`, `business-api-context` | the data and routes behind each feature | cited per feature, never restated |
| `project-context` mode `features` | the generator that CREATEs the map and UPDATEs its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Entities, RLS, triggers and state machines → `business-data-context`.
- Route groups, auth model and OpenAPI surface → `business-api-context`.
- Per-screen visual specs and design tokens → the master design plan and `DESIGN.md` (`/design-system`).
- Product intent and user personas → the PRD under `.context/PRD/` (authored by `/project-foundation`).
- Jira stories and their ACs → `.context/PBI/` (synced cache).

## References

- `references/business-feature-map.html`: the map (generated; read through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's feature map.
