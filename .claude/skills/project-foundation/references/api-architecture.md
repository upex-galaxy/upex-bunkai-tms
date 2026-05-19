# API Architecture — pointer

> **This reference is a thin pointer.** The full generation logic lives in the standalone command `/business-api-map`.

During Phase 4 (Discovery), `project-foundation` does NOT embed API-architecture generation logic — it **invokes the command** so the same playbook is reusable from any session.

---

## How `project-foundation` uses this

- Skill orchestrator hands off to the `/business-api-map` command (see `.claude/commands/business-api-map.md`).
- Command output: `.context/business/business-api-map.md` (auth model, critical journeys, architecture-behind-the-API, external integrations).
- The command auto-detects CREATE vs UPDATE mode based on whether the output file already exists.

## Inputs the command expects (provided by Phase 4 context)

- OpenAPI spec (`api/openapi.json` or equivalent).
- Auth middleware + controllers in the backend.
- `.context/business/business-data-map.md` (soft gate — referenced for entity flows).
- `.context/business/business-feature-map.md` (soft gate — referenced for feature → endpoint mapping).

## When to invoke

- Phase 4 Step 3 of `project-foundation` (after data-map and feature-map are generated).
- Anytime auth model or major API topology changes.

---

**Full playbook**: `.claude/commands/business-api-map.md`
