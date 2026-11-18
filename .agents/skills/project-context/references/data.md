# Business Data Map

Generates or updates the map of `business-data-context`: `.agents/skills/business-data-context/references/business-data-map.html`, a visual and narrative map of the system under development. It explains how the domain works (entities, RLS, migrations, flows, state machines, automatic processes, external integrations) so developers plan against real context instead of guessing. The file anatomy, the section contract and the incremental update are in `../../agentic-dev-core/references/business-context-maps.md` §2 and §4; this reference says what goes in the sections.

**Target**: `$ARGUMENTS` forwarded by the alias or given in the invocation (project path, module name to scope discovery, or blank for the full system).

---

## When to use

| Use this command for | Use a different tool for |
|---|---|
| Mapping or refreshing the domain model and business flows | API endpoint inventory: `/project-context api` |
| Documenting state machines and automatic processes | Feature inventory: `/project-context features` |
| Synthesizing DB + backend + frontend into one map | Implementation roadmap: `/project-context master-plan` |
| Producing the canonical reference for downstream planning | QA test planning (out of scope, see the sister repo) |

The map feeds `/project-context master-plan` and informs every `/sprint-development` cycle, read through `bun run context:map business-data-context`. It is the most valuable context map in the repo for developers.

---

## What this produces

One HTML map inside `business-data-context` that contains:

- an executive summary with one overview figure
- the entity map (entities, relationships, business role), plus the RLS policies that decide who sees which rows and the migrations that shaped the schema
- business flows (end-to-end user journeys with the code paths involved)
- state machines (lifecycle entities and their transitions)
- automatic processes (DB triggers, cron jobs, async workers)
- external integrations (third-party APIs and webhooks)
- discovery gaps: what could not be verified

The audience is developers planning features against this domain. Optimize for "I need to implement X: where does X live and what touches it?"

---

## Soft-gate notice

This command runs standalone; `/project-foundation` does not have to come first. The map is much richer when `.context/PRD/` or `.context/SRS/` exist. When they are missing:

- continue anyway
- note the missing inputs in the `discovery-gaps` section of the output
- suggest the user run `/project-foundation` for a fuller picture

On an existing app (`.template/installer.lock.json` → `adopted: true`) a missing PRD or SRS is not a gap and is not reported: this map, the other two maps, the dev guide and the glossary are that app's product docs. The follow-up there is `/project-foundation` Discovery-only (dev guide and glossary), never a PRD or SRS.

---

## Input

`$ARGUMENTS` accepts:

| Value | Behavior |
|---|---|
| Empty | Map the entire system |
| `module=<name>` | Scope discovery to a single module or epic (e.g. `module=billing`) and produce a narrower map |
| `<absolute-path>` | Treat the path as the project root (for adapting another repo) |

---

## Sources

Use every source available before writing, and cite paths or files for every claim. App paths resolve under `{{stack.app_root}}` (SKILL.md § Stack parameters).

| Source | What to extract | How to access |
|---|---|---|
| Database schema | Tables, columns, relationships, constraints, enums, RLS policies, triggers | Per `{{stack.database.schema_source}}` (SKILL.md § Stack parameters). `live`: `[DB_TOOL]` (capability `db`: any tool ending in `list_tables` / `execute_sql`, whatever the server prefix) against the project identified by `{{DB_PROJECT_REF}}` (active env). `migrations`: the migration files under `{{stack.database.migrations_dir}}`, read offline. Use it to understand the schema, not to dump `information_schema`. |
| Backend codebase | Services, controllers, models, validation rules, business logic, schemas | Files under the backend tree (e.g. `api/`, `src/server/`, `app/api/`). Focus on services and controllers, not boilerplate. |
| Frontend codebase | Pages, routes, forms, user flows, state management, client schemas | Files under the frontend tree (e.g. `src/app/`, `src/pages/`, `src/routes/`). Focus on user-facing flows. |
| API surface | Routes, methods, payloads, auth levels | `api/openapi.json` if it exists, otherwise the route files. Cross-check with `bun run api:sync` output. |
| Existing context | PRD, SRS, domain glossary | `.context/PRD/`, `.context/SRS/`, `.context/business/` (incl. `.context/business/domain-glossary.md`): entity and flow names use the glossary's words |
| Legacy map (input only) | A project's old markdown data map | `.context/business/business-data-map.md` when present: read it as input and cite it in `data-migrated-from` on the sections it seeded; leave the file in place, unedited |
| Migrations | How the schema got its shape, RLS policies, triggers | `[DB_TOOL]` `list_migrations` (the ledger when `{{stack.database.migrations_dir}}` is null) plus the migration files under `{{stack.database.migrations_dir}}` when it is set |
| Package dependencies | External integrations (Stripe, SendGrid, Auth0, Resend, etc.) | `package.json`, `requirements.txt`, `Gemfile`, etc.; match names against known SaaS services |
| Library docs (when needed) | How an external SDK shapes data flow | `[DOCS_TOOL]` (`library-docs`) for library docs; `[WEB_SEARCH_TOOL]` (`web-search`) for community patterns |
| Workflow automation | n8n flows that touch the domain | n8n MCP, only if relevant (most projects will not have it) |

**Golden rule**: synthesize, don't extract. The DB tool serves schema on demand at any time. Your job is the layer that connects schema, code and business intent into a story a developer can act on.

---

## Workflow

### Step 1: identify scope

Resolve `$ARGUMENTS`:

- empty: full-system map
- `module=<name>`: scoped map, only the entities and flows that belong to that module
- `<path>`: run discovery against that path instead of the current repo

State the resolved scope before doing any work.

### Step 2: detect mode

```
bun run context:map business-data-context --list
  → skill folder missing:   STOP. The skill is delivered by `bun sync`
                            (or ships with the boilerplate); do not create it here.
  → placeholder notice:     CREATE mode: build every section from the sources.
  → a list of sections:     UPDATE mode: staleness check per section
                            (business-context-maps.md §5), regenerate only the
                            stale ones, show a section-level diff, wait for
                            explicit approval. Never regenerate the whole map.
```

A section edited through the skill's own refresh path (`business-data-context/references/refresh.md`) is a normal section: the staleness check decides whether it is regenerated, not the fact that a human touched it.

UPDATE approval comes from the person who invoked the mode. When nobody is present (a supervised worker or a routine), follow `../../agentic-dev-core/references/decision-protocol.md`: the delegating brief is the approval when it covers the write, and without one you prepare the diff, write nothing and report it.

### Step 3: read sources

Read in this order, and delegate heavy reads to a subagent when context is tight:

1. Existing context: `.context/PRD/`, `.context/SRS/`, `.context/business/` (glossary, and any legacy markdown map as input).
2. Package manifests, to spot external services.
3. DB schema, RLS policies and the migration ledger, from the source `{{stack.database.schema_source}}` names: the live database via `[DB_TOOL]`, or the migration files read in order (then `[DB_TOOL]` only as an optional cross-check; a file-vs-database difference goes to `discovery-gaps`).
4. Backend code (services, controllers, models).
5. Frontend code (routes, pages, forms).
6. The OpenAPI spec, if present.

When a required source is missing or unreadable, log it for `discovery-gaps` and leave the claim out.

### Step 4: map entities and relationships

For every entity found through the DB and the code, answer what real-world concept it represents, why it exists, and how and why it relates to other entities.

Document the business meaning and skip the column dump; the DB tool (or the migration files) serves columns on demand.

Produce an ER figure (diagram-design), a table (`Entity | Business Role | Why it exists`) and a short narrative on the key relationships. For each table with RLS, state in plain words who can read and write which rows and why. For the migrations, name the ones that changed the meaning of an entity (a soft delete, a status enum, a tenancy column), not every file.

### Step 5: document flows and state machines

**Flows.** For each major feature, trace the complete journey:

```
User → API → Service / business logic → DB → Response (+ side effects)
```

For each flow document:

- a flowchart or sequence figure (diagram-design)
- a numbered narrative
- the business rules, with the why
- the code paths involved (cite real files)
- the side effects (emails, webhooks, downstream state changes)

Document every important flow; there is no cap of 3.

**State machines.** For entities with lifecycle states (e.g. `pending → active → completed → cancelled`):

- a state machine figure (diagram-design)
- a transitions table (`From | To | Event | Effects`)
- the business rules that constrain transitions

### Step 6: identify automatic processes and integrations

**Automatic processes**, as three tables:

- DB triggers (when, what, why)
- cron jobs and scheduled tasks (frequency, what, why)
- async workers, background jobs and incoming webhooks (source, event, system effects)

**External integrations.** For each third-party service:

- a data flow figure when it clarifies direction (your system ↔ the service)
- the data impact (which entities and tables change)
- the dependent flows
- the failure behavior: what breaks if the service is down

### Step 7: write the output

Before drawing the first figure, run the point-of-use check for capability `diagrams` (`../../agentic-dev-core/references/business-context-maps.md` §7). Write `.agents/skills/business-data-context/references/business-data-map.html` using the section structure below, with line 1 `<!-- generated by project-context mode data; edited in place by business-data-context refresh; do not hand-edit -->` (anatomy: `business-context-maps.md` §2).

### Step 8: report gaps and changes

After writing:

- Verify that `bun run context:map business-data-context --list` prints every section, the run's date on the ones written, and no placeholder notice.
- Print the discovery gaps. Write the `discovery-gaps` section even when the list is empty.
- In UPDATE mode, print a section-level diff (sections regenerated vs untouched, entities, flows and integrations added or changed) and get confirmation before writing (Step 2 covers the unattended case).
- The map just changed, so review the rules section and `references/gotchas.md` of `business-data-context` against it. A rule the new map contradicts is proposed for the gotchas' "No longer true" section, never deleted.
- Suggest follow-ups: `/project-context api`, `/project-context features`, `/project-context master-plan`, or `/project-foundation` when PRD/SRS were missing (on an existing app, `/project-foundation` Discovery-only for the dev guide and the glossary).

---

## Output structure

Write the map as flat `<section>`s, in this order, each with a stable `id`, its `data-sources` and its `data-updated` date (anatomy: `business-context-maps.md` §2). The `<h1>` carries the project name and a one-line tagline; state the scope (`full-system`, `module=<name>` or `path=<...>`) in the `overview` section.

| Section id | Content | Figure (diagram-design type) |
|---|---|---|
| `overview` | executive summary: what the system does, main actors (table `Actor \| Description`), value proposition, scope, and where the schema was read (the env for `live`, the migrations folder and its newest file for `migrations`) | one overview figure for the whole map (architecture or ER) |
| `entities` | table `Entity \| Business role \| Why it exists` + the key relationships in prose (why they exist, not only that they do) | ER / data model (split above the type's budget) |
| `entity-<slug>` | one per entity whose meaning is not obvious from the table: soft deletes, derived fields, ownership, tenancy | only when a picture carries the mechanism |
| `access-control` | RLS per table in plain words (`Table \| Who reads \| Who writes \| Why`), the roles they rely on, and the tables with RLS off | none by default |
| `migrations` | the migrations that changed the meaning of an entity, oldest first, each with what changed and why (cited `migration:<file>` when the files are the source) | none |
| `flow-<slug>` | one per business flow (no cap): numbered narrative, business rules with their why, code paths involved, side effects | flowchart or sequence |
| `state-<entity>` | one per stateful entity: transitions table `From \| To \| Triggering event \| Effects`, the rules that constrain them | state machine |
| `automatic-processes` | three tables (DB triggers, cron jobs / scheduled tasks, async workers / incoming webhooks), each with a "why it exists" column | none by default |
| `integration-<service>` | one per external service: what it does, which entities it changes, dependent flows, failure behaviour | data flow when it clarifies direction |
| `discovery-gaps` | always written: everything you could not verify, missing PRD / SRS inputs (recommend `/project-foundation`; not on an existing app, see the soft-gate notice), tables you could not place in a flow. "I could not verify X" beats an invented answer | none |

Every fact a figure shows is also written in the section text, because the AI reads the text only (`bun run context:map`). Ids are slugs of the source name and never change after CREATE. Code paths are cited as `<code>` with real file paths.

---

## Rules

1. Cite sources. Every entity, flow, trigger and integration claim references a file path or DB object; behavior is never invented.
2. Synthesize, don't dump. Skip the column list; the schema source (the DB tool, or the migration files) serves it on demand.
3. Update at section level. In UPDATE mode, regenerate only the stale sections, and keep every section id unchanged.
4. Always write `discovery-gaps`, even when it is empty. An empty list still shows you looked.
5. Visual first, text complete. Use a diagram-design figure wherever the structure allows it, and put every fact it shows in the section text too.
6. Do not overwrite on your own. In UPDATE mode, show the section-level diff and wait for explicit confirmation.
7. Scope honestly. When `$ARGUMENTS` scopes to a module, do not pretend to cover the full system, and state the scope at the top.
8. Write the document in English (project convention). Mirror the user's language only in conversational replies, not in the output file.
9. Keep it developer-facing. Leave out test cases, TMS, ATCs and master test plans; QA workflows live in the sister repo.

---

## Final report

After generation, print a short report:

```markdown
# Business Data Map — <CREATE | UPDATE>

**File**: `.agents/skills/business-data-context/references/business-data-map.html`
**Scope**: <full-system | module=<name>>
**Schema source**: <live: env read | migrations: folder, newest file>

## Documented

- Sections: <N regenerated> / <N untouched>
- Entities: <N>
- Business flows: <N>
- State machines: <N>
- Automatic processes: <N triggers, N cron jobs, N workers/webhooks>
- External integrations: <N>

## Discovery Gaps

- <list, or "None">

## Suggested next steps

- <e.g. `/project-context master-plan` to schedule the work>
- <e.g. `/project-foundation` if PRD/SRS were missing>
```
