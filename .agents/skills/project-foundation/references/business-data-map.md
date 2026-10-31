# Business Data Map — pointer

> **This reference is a thin pointer.** The full generation logic lives in skill `project-context` mode `data`.

During Phase 4 (Discovery), `project-foundation` does NOT embed data map generation logic — it **invokes the command** so the same playbook is reusable from any session (sprint-development planning, mid-project rediscovery, brownfield audits, etc.).

---

## How `project-foundation` uses this

- Skill orchestrator hands off to skill `project-context` mode `data` (see `.agents/skills/project-context/references/data.md`).
- Command output: the data map inside `business-data-context` (`references/business-data-map.html`: entities, business flows, state machines, automatic processes, external integrations).
- The command auto-detects CREATE vs UPDATE mode from the map's state: an absent or placeholder map gets CREATE, a generated map gets UPDATE (stale sections only).

## Inputs the command expects (provided by Phase 4 context)

- `.context/PRD/*` and `.context/SRS/*` if present (used as business context).
- DB schema, per `{{stack.database.schema_source}}`: live through `[DB_TOOL]` (capability `db`), or the migration files under `{{stack.database.migrations_dir}}` read offline (capability `db` then optional).
- Source code (backend + frontend) for flow tracing.

## When to invoke

- Phase 4 Step 1 of `project-foundation`.
- Anytime the domain model changes substantially mid-project (re-invoke the command directly, no need to re-run the whole foundation).

## Why this is a pointer, not the playbook

Keeping the playbook in one place (`.agents/skills/project-context/references/data.md`) means:

- `/sprint-development`, `/project-foundation` and ad-hoc discovery all share the same generator.
- Changes to entity-mapping heuristics happen in one file.
- Phase 4 of `project-foundation` stays an orchestrator, not a duplicate of the command.

---

**Full playbook**: `.agents/skills/project-context/references/data.md`
