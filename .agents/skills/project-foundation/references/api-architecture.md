# API Architecture — pointer

> **This reference is a thin pointer.** The full generation logic lives in skill `project-context` mode `api`.

During Phase 4 (Discovery), `project-foundation` does NOT embed API-architecture generation logic — it **invokes the command** so the same playbook is reusable from any session.

---

## How `project-foundation` uses this

- Skill orchestrator hands off to skill `project-context` mode `api` (see `.agents/skills/project-context/references/api.md`).
- Command output: the API map inside `business-api-context` (`references/business-api-map.html`: auth model, critical journeys, architecture-behind-the-API, external integrations).
- The command auto-detects CREATE vs UPDATE mode from the map's state: an absent or placeholder map gets CREATE, a generated map gets UPDATE (stale sections only).

## Inputs the command expects (provided by Phase 4 context)

- OpenAPI spec (`api/openapi.json` or equivalent).
- Auth middleware + controllers in the backend.
- The data map, read with `bun run context:map business-data-context` (soft gate — referenced for entity flows).
- The feature map, read with `bun run context:map business-feature-context` (soft gate — referenced for feature → endpoint mapping).

## When to invoke

- Phase 4 Step 3 of `project-foundation` (after data-map and feature-map are generated).
- Anytime auth model or major API topology changes.

---

**Full playbook**: `.agents/skills/project-context/references/api.md`
