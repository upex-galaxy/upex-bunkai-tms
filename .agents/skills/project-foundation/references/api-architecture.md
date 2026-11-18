# API Architecture: pointer

> This reference is a thin pointer. The full generation logic lives in skill `project-context` mode `api`.

During Phase 4 (Discovery), `project-foundation` does not embed API-architecture generation logic. It invokes the mode, so the same playbook is reusable from any session.

---

## How `project-foundation` uses this

- The skill orchestrator hands off to skill `project-context` mode `api` (see `.agents/skills/project-context/references/api.md`).
- The mode writes the API map inside `business-api-context` (`references/business-api-map.html`): auth model, critical journeys, the architecture behind the API and external integrations.
- The mode detects CREATE or UPDATE from the map's state. An absent or placeholder map gets CREATE, and a generated map gets UPDATE (stale sections only).

## Inputs the mode expects (provided by Phase 4 context)

- The OpenAPI spec (`api/openapi.json` or equivalent).
- The auth middleware and controllers in the backend.
- The data map, read with `bun run context:map business-data-context` (soft gate, used for entity flows).
- The feature map, read with `bun run context:map business-feature-context` (soft gate, used to map features to endpoints).

## When to invoke

- Phase 4 Step 3 of `project-foundation`, after the data map and feature map are generated.
- Any time the auth model or the main API topology changes.

---

**Full playbook**: `.agents/skills/project-context/references/api.md`
