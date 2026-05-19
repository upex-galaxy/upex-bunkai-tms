# Business Data Map — pointer

> **This reference is a thin pointer.** The full generation logic lives in the standalone command `/business-data-map`.

During Phase 4 (Discovery), `project-foundation` does NOT embed business-data-map generation logic — it **invokes the command** so the same playbook is reusable from any session (sprint-development planning, mid-project rediscovery, brownfield audits, etc.).

---

## How `project-foundation` uses this

- Skill orchestrator hands off to the `/business-data-map` command (see `.claude/commands/business-data-map.md`).
- Command output: `.context/business/business-data-map.md` (entities, business flows, state machines, automatic processes, external integrations).
- The command auto-detects CREATE vs UPDATE mode based on whether the output file already exists.

## Inputs the command expects (provided by Phase 4 context)

- `.context/PRD/*` and `.context/SRS/*` if present (used as business context).
- DB schema (via Supabase MCP or equivalent `[DB_TOOL]`).
- Source code (backend + frontend) for flow tracing.

## When to invoke

- Phase 4 Step 1 of `project-foundation`.
- Anytime the domain model changes substantially mid-project (re-invoke the command directly, no need to re-run the whole foundation).

## Why this is a pointer, not the playbook

Keeping the playbook in one place (`.claude/commands/business-data-map.md`) means:

- `/sprint-development`, `/sync-ai-memory`, and ad-hoc discovery all share the same generator.
- Changes to entity-mapping heuristics happen in one file.
- Phase 4 of `project-foundation` stays an orchestrator, not a duplicate of the command.

---

**Full playbook**: `.claude/commands/business-data-map.md`
