---
name: business-api-context
description: "What the API of the product under development MEANS to the business: the auth model (Supabase Auth, sessions, roles), every route group (Next.js route handlers and server actions) with who calls it and why, what it changes, which role it needs, the OpenAPI surface it publishes, the journeys that cross several routes, error semantics and the external integrations behind them. Load it whenever a task adds or changes a route handler, a server action, the OpenAPI contract, an auth or permission rule, a status code that looks wrong, or asks which route does what, even when nobody says 'API map'. Reads its map through `bun run context:map business-api-context`. Pure knowledge plus a self-update proposal path: NOT the OpenAPI contract itself (that is the spec and its generated types), NOT for entities (business-data-context) or the feature and UI inventory (business-feature-context)."
license: MIT
compatibility: [claude-code, codex, opencode]
compact_rules: |
  - DO: read the map through `bun run context:map business-api-context` (or `--section <id>` for one route group or journey). NEVER read `references/business-api-map.html` raw: its SVG is most of the bytes and none of the facts.
  - DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `api`; never add a route as if the API were empty.
  - DO: take field names, types and required flags from the OpenAPI types (`bun run api:sync`, `@schemas/{domain}.types`), and the MEANING from the map. On a conflict the spec wins for shape, the running API wins for behaviour.
  - WHEN a session observes something that contradicts a section (a status, a field, an auth rule): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
  - DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no generated types, no product code.
  - DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
  - Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams]
---

# business-api-context

> Kind `context` with a declared write scope (`agentic-dev-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-dev-core/references/business-context-maps.md`.

## Compact Rules

- DO: read the map through `bun run context:map business-api-context` (or `--section <id>` for one route group or journey). NEVER read `references/business-api-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `api`; never add a route as if the API were empty.
- DO: take field names, types and required flags from the OpenAPI types (`bun run api:sync`, `@schemas/{domain}.types`), and the MEANING from the map. On a conflict the spec wins for shape, the running API wins for behaviour.
- WHEN a session observes something that contradicts a section (a status, a field, an auth rule): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no generated types, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.

**Read full SKILL.md when**: building a briefing for a route, OpenAPI or auth dispatch, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the product: **its API as a business surface**. How a caller authenticates and which roles exist, which route groups exist and what each one is for, who is allowed to call them, what they change, how a multi-call journey chains them, what each error means to a user, and which third parties sit behind them. Loading it changes what the agent KNOWS; the only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-api-map.html` | the synthesis, one `<section>` per route group or cross-route journey, plus the auth model and `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the OpenAPI spec and its generated types (`bun run api:sync`) | paths, methods, payload shapes | wins for shape |
| the route handlers and server actions in the repo | what each route really does | wins over the map on any conflict |
| the running API of the active environment | real statuses and bodies | wins for behaviour |
| `project-context` mode `api` | the generator that CREATEs the map and UPDATEs its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Payload schemas and types → the OpenAPI spec and `@schemas/{domain}.types`.
- Entities, RLS, triggers and state machines → `business-data-context`.
- Screens, CRUD actions and the feature catalog → `business-feature-context`.
- Tokens and credentials → `.env`, never a map.

## References

- `references/business-api-map.html`: the map (generated; read through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's API map.
