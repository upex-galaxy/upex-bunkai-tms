# Business Data Map: pointer

> This reference is a thin pointer. The full generation logic lives in skill `project-context` mode `data`.

During Phase 4 (Discovery), `project-foundation` does not embed data-map generation logic. It invokes the mode, so the same playbook is reusable from any session (sprint-development planning, mid-project rediscovery, brownfield audits).

---

## How `project-foundation` uses this

- The skill orchestrator hands off to skill `project-context` mode `data` (see `.agents/skills/project-context/references/data.md`).
- The mode writes the data map inside `business-data-context` (`references/business-data-map.html`): entities, business flows, state machines, automatic processes and external integrations.
- The mode detects CREATE or UPDATE from the map's state. An absent or placeholder map gets CREATE, and a generated map gets UPDATE (stale sections only).

## Inputs the mode expects (provided by Phase 4 context)

- `.context/PRD/*` and `.context/SRS/*` when present, used as business context.
- The DB schema, per `{{stack.database.schema_source}}`: live through `[DB_TOOL]` (capability `db`), or the migration files under `{{stack.database.migrations_dir}}` read offline (capability `db` is then optional).
- The source code (backend and frontend), for flow tracing.

## When to invoke

- Phase 4 Step 1 of `project-foundation`.
- Any time the domain model changes substantially mid-project. Re-invoke the mode directly, with no need to re-run the whole foundation.

## Why this is a pointer, not the playbook

One playbook in `.agents/skills/project-context/references/data.md` means:

- `/sprint-development`, `/project-foundation` and ad-hoc discovery share the same generator.
- Changes to the entity-mapping heuristics happen in one file.
- Phase 4 of `project-foundation` stays an orchestrator, not a copy of the mode.

---

**Full playbook**: `.agents/skills/project-context/references/data.md`
