
# Business Data Map

Generate or update the map of `business-data-context`: `.agents/skills/business-data-context/references/business-data-map.html`, a **visual and narrative map** of the system under development. It explains how the domain works (entities, RLS, migrations, flows, state machines, automatic processes, external integrations) so developers can plan implementation against real context instead of guessing. The file anatomy, the section contract and the incremental update are in `../../agentic-dev-core/references/business-context-maps.md` §2 and §4; this reference says WHAT goes in the sections.

**Target**: `$ARGUMENTS` forwarded by the alias or given in the invocation (project path, module name to scope discovery, or blank for the full system)

---

## When to use

| Use this command for                                      | Use a different tool for                               |
| --------------------------------------------------------- | ------------------------------------------------------ |
| Mapping/refreshing the domain model and business flows    | API endpoint inventory → `/project-context api`           |
| Documenting state machines and automatic processes        | Feature inventory → `/project-context features`            |
| Synthesizing DB + backend + frontend into one map         | Implementation roadmap → `/project-context master-plan` |
| Producing the canonical reference for downstream planning | QA test planning (out of scope, see sister repo)       |

The map feeds `/project-context master-plan` and informs every `/sprint-development` cycle, read through `bun run context:map business-data-context`. Treat it as the **most valuable context map in the repo** for developers.

---

## What this produces

One HTML map inside `business-data-context` that contains:

- Executive summary with one overview figure
- Entity map (entities + relationships + business role), plus the RLS policies that decide who sees which rows and the migrations that shaped the schema
- Business flows (end-to-end user journeys with the code paths involved)
- State machines (lifecycle entities and their transitions)
- Automatic processes (DB triggers, cron jobs, async workers)
- External integrations (third-party APIs + webhooks)
- Discovery gaps — what could not be verified

**Audience**: developers planning features against this domain. Optimize for "I need to implement X — where does X live and what touches it?"

---

## Soft-gate notice

This command is **invocable standalone** — you do NOT have to run `/project-foundation` first. However, if `.context/PRD/` or `.context/SRS/` already exist, the map will be much richer. If they are missing:

- Continue anyway (do not block)
- Note the missing inputs in the **Discovery Gaps** section of the output
- Suggest the user run `/project-foundation` for a fuller picture

On an existing app (`.template/installer.lock.json` → `adopted: true`) a missing PRD / SRS is NOT a gap and is not reported: this map, the other two maps, the dev guide and the glossary are that app's product docs. The follow-up is `/project-foundation` Discovery-only (dev guide + glossary), never a PRD or SRS.

---

## Input

`$ARGUMENTS` accepts:

| Value             | Behavior                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Empty             | Map the entire system                                                                    |
| `module=<name>`   | Scope discovery to a single module/epic (e.g. `module=billing`) — produce a narrower map |
| `<absolute-path>` | Treat the path as the project root (for adapting another repo)                           |

---

## Sources (use ALL available)

Exhaust every source before writing. Cite paths/files for every claim. App paths resolve under `{{stack.app_root}}` (SKILL.md § Stack parameters).

| Source                         | What to extract                                                            | How to access                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database schema**            | Tables, columns, relationships, constraints, enums, RLS policies, triggers | per `{{stack.database.schema_source}}` (SKILL.md § Stack parameters). `live`: `[DB_TOOL]` (capability `db`: any tool ending in `list_tables` / `execute_sql`, whatever the server prefix) against the project identified by `{{DB_PROJECT_REF}}` (active env). `migrations`: the migration files under `{{stack.database.migrations_dir}}`, read offline. Use it to **understand**, not to dump `information_schema`. |
| **Backend codebase**           | Services, controllers, models, validation rules, business logic, schemas   | Read files under the backend tree (e.g. `api/`, `src/server/`, `app/api/`). Focus on services and controllers, not boilerplate.                                     |
| **Frontend codebase**          | Pages, routes, forms, user flows, state management, client schemas         | Read files under the frontend tree (e.g. `src/app/`, `src/pages/`, `src/routes/`). Focus on user-facing flows.                                                      |
| **API surface**                | Routes, methods, payloads, auth levels                                     | Read `api/openapi.json` if it exists; otherwise read route files directly. Cross-check with `bun run api:sync` output.                                              |
| **Existing context**           | PRD, SRS, domain glossary                                                  | `.context/PRD/`, `.context/SRS/`, `.context/business/` (incl. `.context/business/domain-glossary.md`): entity and flow names use the glossary's words                |
| **Legacy map (input only)**    | a project's old markdown data map                                          | `.context/business/business-data-map.md` when present: read it as input, cite it in `data-migrated-from` on the sections it seeded; never delete or rewrite it       |
| **Migrations**                 | how the schema got its shape, RLS policies, triggers                       | `[DB_TOOL]` `list_migrations` (the ledger when `{{stack.database.migrations_dir}}` is null) plus the migration files under `{{stack.database.migrations_dir}}` when it is set |
| **Package dependencies**       | External integrations (Stripe, SendGrid, Auth0, Resend, etc.)              | `package.json`, `requirements.txt`, `Gemfile`, etc. — match names against known SaaS services.                                                                      |
| **Library docs (when needed)** | Confirm how an external SDK shapes data flow                               | `[DOCS_TOOL]` (`library-docs`) for library docs; `[WEB_SEARCH_TOOL]` (`web-search`) for community patterns.                                                         |
| **Workflow automation**        | n8n flows that touch the domain                                            | n8n MCP (only if relevant — most projects will not have it).                                                                                                        |

**Golden rule**: synthesize, don't extract. The DB MCP gives you schema on demand at any time — your job here is to write the layer that connects schema + code + business intent into a story a developer can act on.

---

## Workflow

### Step 1 — Identify scope

Resolve `$ARGUMENTS`:

- Empty → full-system map
- `module=<name>` → scoped map; only entities and flows that belong to that module
- `<path>` → run discovery against that path instead of the current repo

State the resolved scope before doing any work.

### Step 2 — Detect mode

```
bun run context:map business-data-context --list
  → skill folder missing:   STOP. The skill is delivered by `bun sync`
                            (or ships with the boilerplate); never create it here.
  → placeholder notice:     CREATE mode: build every section from the sources.
  → a list of sections:     UPDATE mode: staleness check per section
                            (business-context-maps.md §5), regenerate ONLY the
                            stale ones, show a section-level diff, WAIT for
                            explicit approval. NEVER regenerate the whole map.
```

A section edited through the skill's own refresh path (`business-data-context/references/refresh.md`) is a normal section: the staleness check decides whether it is regenerated, never the fact that a human touched it.

### Step 3 — Read sources

Read in this order (delegate heavy reads to a sub-agent if context is tight):

1. Existing context: `.context/PRD/`, `.context/SRS/`, `.context/business/` (glossary, and any legacy markdown map as input)
2. Package manifests (to spot external services)
3. DB schema, RLS policies and the migration ledger, from the source `{{stack.database.schema_source}}` names: the live database via `[DB_TOOL]`, or the migration files read in order (then `[DB_TOOL]` only as an optional cross-check; a file-vs-database difference goes to Discovery Gaps)
4. Backend code (services + controllers + models)
5. Frontend code (routes + pages + forms)
6. OpenAPI spec if present

If any required source is missing or unreadable, log it for the Discovery Gaps section — do not invent.

### Step 4 — Map entities and relationships

For every entity discovered via DB + code:

- What real-world concept does it represent?
- Why does it exist? What problem does it solve?
- How does it relate to other entities, and why?

**Do NOT dump columns**: the DB MCP (or the migration files) serves that on demand. Document the business meaning.

Produce an ER figure (diagram-design) + a table (`Entity | Business Role | Why it exists`) + a short narrative on the key relationships. For each table with RLS, state in plain words who can read and write which rows and why; for the migrations, name the ones that changed the meaning of an entity (a soft delete, a status enum, a tenancy column), not every file.

### Step 5 — Document flows and state machines

**Flows** — for each major feature trace the complete journey:

```
User → API → Service / business logic → DB → Response (+ side effects)
```

For each flow document:

- a flowchart or sequence figure (diagram-design)
- Numbered narrative
- Business rules (with the "why")
- Code paths involved (cite real files)
- Side effects (emails, webhooks, downstream state changes)

**Document ALL important flows** — do not cap at 3.

**State machines** — for entities with lifecycle states (e.g. `pending → active → completed → cancelled`):

- a state machine figure (diagram-design)
- Transitions table (`From | To | Event | Effects`)
- Business rules that constrain transitions

### Step 6 — Identify automatic processes and integrations

**Automatic processes** — three tables:

- DB triggers (when, what, why)
- Cron jobs / scheduled tasks (frequency, what, why)
- Async workers / background jobs / webhooks-in (source, event, system effects)

**External integrations** — for each third-party service:

- a data flow figure when it clarifies direction (your system ↔ the service)
- Data impact (which entities/tables change)
- Dependent flows
- Failure behavior — what breaks if the service is down

### Step 7 — Write the output

Before drawing the first figure, run the point-of-use check for capability `diagrams` (`../../agentic-dev-core/references/business-context-maps.md` §7). Write `.agents/skills/business-data-context/references/business-data-map.html` using the section structure below, with line 1 `<!-- generated by project-context mode data; edited in place by business-data-context refresh; do not hand-edit -->` (anatomy: `business-context-maps.md` §2).

### Step 8 — Report gaps and changes

After writing:

- Verify: `bun run context:map business-data-context --list` prints every section, the run's date on the ones written, and no placeholder notice
- Print **Discovery Gaps**: even if the list is empty, write the `discovery-gaps` section
- In UPDATE mode, print a section-level diff (sections regenerated vs untouched, entities / flows / integrations added or changed) and wait for confirmation before writing
- The map just changed: review the rules section and `references/gotchas.md` of `business-data-context` against it. A rule the new map contradicts is PROPOSED for the gotchas' "No longer true" section, never deleted
- Suggest follow-ups (`/project-context api`, `/project-context features`, `/project-context master-plan`, or `/project-foundation` if PRD/SRS were missing; on an existing app, `/project-foundation` Discovery-only for the dev guide and the glossary)

---

## Output structure

Write the map as flat `<section>`s, in this order, each with a stable `id`, its `data-sources` and its `data-updated` date (anatomy: `business-context-maps.md` §2). The `<h1>` carries the project name and a one-line tagline; state the scope (`full-system`, `module=<name>` or `path=<...>`) in the `overview` section.

| Section id | Content | Figure (diagram-design type) |
|---|---|---|
| `overview` | executive summary: what the system does, main actors (table `Actor \| Description`), value proposition, scope, and where the schema was read (the env for `live`, the migrations folder and its newest file for `migrations`) | one overview figure for the whole map (architecture or ER) |
| `entities` | table `Entity \| Business role \| Why it exists` + the key relationships in prose (WHY they exist, not only that they do) | ER / data model (split above the type's budget) |
| `entity-<slug>` | one per entity whose meaning is not obvious from the table: soft deletes, derived fields, ownership, tenancy | only when a picture carries the mechanism |
| `access-control` | RLS per table in plain words (`Table \| Who reads \| Who writes \| Why`), the roles they rely on, and the tables with RLS off | none by default |
| `migrations` | the migrations that changed the meaning of an entity, oldest first, each with what changed and why (cited `migration:<file>` when the files are the source) | none |
| `flow-<slug>` | one per business flow (do not cap): numbered narrative, business rules with their why, code paths involved, side effects | flowchart or sequence |
| `state-<entity>` | one per stateful entity: transitions table `From \| To \| Triggering event \| Effects`, the rules that constrain them | state machine |
| `automatic-processes` | three tables (DB triggers, cron jobs / scheduled tasks, async workers / incoming webhooks), each with a "why it exists" column | none by default |
| `integration-<service>` | one per external service: what it does, which entities it changes, dependent flows, failure behaviour | data flow when it clarifies direction |
| `discovery-gaps` | MANDATORY: everything you could not verify, missing PRD / SRS inputs (recommend `/project-foundation`; never on an existing app, see the soft-gate notice), tables you could not place in a flow. "I could not verify X" beats an invented answer | none |

Every fact a figure shows is also written in the section text: the AI reads the text only (`bun run context:map`). Ids are slugs of the source name and never change after CREATE. Code paths are cited as `<code>` with real file paths.

---

## Rules

1. **Cite sources** — every entity, flow, trigger, and integration claim must reference a file path or DB object. No invented behavior.
2. **Synthesize, don't dump** — do not list every column. The schema source (the DB MCP, or the migration files) serves it on demand.
3. **Section-level updates only**: in UPDATE mode, regenerate only the stale sections; never rewrite the whole map and never change a section id.
4. **Always write Discovery Gaps**: even if the section is empty. An empty list still proves you looked.
5. **Visual first, text complete**: a diagram-design figure wherever the structure allows it, and every fact it shows also in the section text.
6. **Do not auto-overwrite**: in UPDATE mode, show the section-level diff and wait for explicit confirmation.
7. **Scope honestly** — if `$ARGUMENTS` scopes to a module, do not pretend to cover the full system. State the scope at the top.
8. **Language** — write the document in English (per project convention). Mirror the user's language only for conversational responses, not for the output file.
9. **No QA flavor** — this is a developer-facing map. Do not reference test cases, TMS, ATCs, or master test plans. QA workflows live in the sister repo.

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
