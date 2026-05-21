---
name: business-data-map
description: Generate or update `.context/business/business-data-map.md` — a visual + narrative map of the system being built (entities, business flows, state machines, automatic processes, external integrations) so developers can plan implementation against real domain context. Triggers on "map the business data", "mapear el dominio", "crear business-data-map", "discovery del modelo de datos", "regenerate business data map", "actualizar mapa de entidades", "rebuild domain map". Reads DB schema (Supabase MCP), backend repo, frontend repo, PRD, SRS, package dependencies. Do NOT use for API endpoint inventory (use `/business-api-map`), feature inventory (use `/business-feature-map`), implementation roadmap (use `/master-implementation-plan`), unit-testing scope (use `/unit-testing`), or QA test planning (out of scope, see agentic-qa-boilerplate).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Business Data Map

Generate or update `.context/business/business-data-map.md` — a **visual and narrative map** of the system under development. It explains how the domain works (entities, flows, state machines, automatic processes, external integrations) so developers can plan implementation against real context instead of guessing.

**Target**: `$ARGUMENTS` (project path, module name to scope discovery, or blank for the full system)

---

## When to use

| Use this command for                                      | Use a different tool for                               |
| --------------------------------------------------------- | ------------------------------------------------------ |
| Mapping/refreshing the domain model and business flows    | API endpoint inventory → `/business-api-map`           |
| Documenting state machines and automatic processes        | Feature inventory → `/business-feature-map`            |
| Synthesizing DB + backend + frontend into one map         | Implementation roadmap → `/master-implementation-plan` |
| Producing the canonical reference for downstream planning | QA test planning (out of scope, see sister repo)       |

The output feeds `/master-implementation-plan` and informs every `/sprint-development` cycle. Treat this as the **most valuable context file in the repo** for developers.

---

## What this produces

A single document at `.context/business/business-data-map.md` that contains:

- Visual header (system name + tagline) and executive summary
- Entity map (entities + relationships + business role)
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

Exhaust every source before writing. Cite paths/files for every claim.

| Source                         | What to extract                                                            | How to access                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database schema**            | Tables, columns, relationships, constraints, enums, RLS policies, triggers | Supabase MCP — `mcp__claude_ai_Supabase__list_tables`, `execute_sql` against the project identified by `{{DB_PROJECT_REF}}` (active env). Use it to **understand**, not to dump `information_schema`. |
| **Backend codebase**           | Services, controllers, models, validation rules, business logic, schemas   | Read files under the backend tree (e.g. `api/`, `src/server/`, `app/api/`). Focus on services and controllers, not boilerplate.                                     |
| **Frontend codebase**          | Pages, routes, forms, user flows, state management, client schemas         | Read files under the frontend tree (e.g. `src/app/`, `src/pages/`, `src/routes/`). Focus on user-facing flows.                                                      |
| **API surface**                | Routes, methods, payloads, auth levels                                     | Read `api/openapi.json` if it exists; otherwise read route files directly. Cross-check with `bun run api:sync` output.                                              |
| **Existing context**           | PRD, SRS, domain glossary, prior maps                                      | `.context/PRD/`, `.context/SRS/`, `.context/business/`                                                                                                              |
| **Package dependencies**       | External integrations (Stripe, SendGrid, Auth0, Resend, etc.)              | `package.json`, `requirements.txt`, `Gemfile`, etc. — match names against known SaaS services.                                                                      |
| **Library docs (when needed)** | Confirm how an external SDK shapes data flow                               | Context7 MCP for library docs; Tavily MCP for community patterns.                                                                                                   |
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
Does .context/business/business-data-map.md exist?
  → NO:  CREATE mode — generate from scratch
  → YES: UPDATE mode — generate the new version, show a diff summary, ask
         for explicit confirmation before overwriting. NEVER auto-overwrite.
```

In UPDATE mode, **preserve any human-written sections or notes** that don't come from auto-discovery (look for comments like `<!-- human: ... -->` or sections marked manual). If unsure, ask before discarding.

### Step 3 — Read sources

Read in this order (delegate heavy reads to a sub-agent if context is tight):

1. Existing context: `.context/PRD/`, `.context/SRS/`, `.context/business/` (any prior map)
2. Package manifests (to spot external services)
3. DB schema via Supabase MCP
4. Backend code (services + controllers + models)
5. Frontend code (routes + pages + forms)
6. OpenAPI spec if present

If any required source is missing or unreadable, log it for the Discovery Gaps section — do not invent.

### Step 4 — Map entities and relationships

For every entity discovered via DB + code:

- What real-world concept does it represent?
- Why does it exist? What problem does it solve?
- How does it relate to other entities, and why?

**Do NOT dump columns** — the DB MCP serves that on demand. Document the business meaning.

Produce an ASCII relationship diagram + a table (`Entity | Business Role | Why it exists`) + a short narrative on the key relationships.

### Step 5 — Document flows and state machines

**Flows** — for each major feature trace the complete journey:

```
User → API → Service / business logic → DB → Response (+ side effects)
```

For each flow document:

- ASCII diagram
- Numbered narrative
- Business rules (with the "why")
- Code paths involved (cite real files)
- Side effects (emails, webhooks, downstream state changes)

**Document ALL important flows** — do not cap at 3.

**State machines** — for entities with lifecycle states (e.g. `pending → active → completed → cancelled`):

- ASCII state diagram
- Transitions table (`From | To | Event | Effects`)
- Business rules that constrain transitions

### Step 6 — Identify automatic processes and integrations

**Automatic processes** — three tables:

- DB triggers (when, what, why)
- Cron jobs / scheduled tasks (frequency, what, why)
- Async workers / background jobs / webhooks-in (source, event, system effects)

**External integrations** — for each third-party service:

- ASCII call diagram (your system ↔ the service)
- Data impact (which entities/tables change)
- Dependent flows
- Failure behavior — what breaks if the service is down

### Step 7 — Write the output

Write `.context/business/business-data-map.md` using the structure below. Always include the **stub-with-pointer** header at the very top.

### Step 8 — Report gaps and changes

After writing:

- Print **Discovery Gaps** — even if the list is empty, write the section
- In UPDATE mode, print a diff summary (entities added/changed, flows added/changed, integrations added/changed) and wait for confirmation before overwriting
- Suggest follow-ups (`/business-api-map`, `/business-feature-map`, `/master-implementation-plan`, or `/project-foundation` if PRD/SRS were missing)

---

## Output structure

The generated file must follow this exact skeleton. Use ASCII diagrams extensively — diagrams beat paragraphs.

```markdown
> **Generated by**: `/business-data-map` slash command
> **Last update**: <YYYY-MM-DD>
> **Sources**: DB schema (Supabase MCP), backend repo, frontend repo, PRD, SRS, package.json
> **Scope**: <full-system | module=<name> | path=<...>>
> **Regenerate with**: `/business-data-map` (CREATE mode if deleted, UPDATE mode otherwise — never auto-overwrites)

# Business Data Map: <Project Name>

╔══════════════════════════════════════════════════════════════════════════════╗
║ <PROJECT NAME> — BUSINESS DATA MAP ║
║ <one-line tagline> ║
╚══════════════════════════════════════════════════════════════════════════════╝

---

## 1. Executive Summary

### What does this system do?

<3-5 lines on business purpose, problem it solves, value created>

### Main Actors

| Actor     | Description                  |
| --------- | ---------------------------- |
| <Actor 1> | <what they do in the system> |

### Value Proposition

<how the system benefits each actor>

---

## 2. Entity Map

<ASCII relationship diagram>

### Entities and Their Business Role

| Entity | Business Role        | Why It Exists       |
| ------ | -------------------- | ------------------- |
| <name> | <what it represents> | <problem it solves> |

### Key Relationships

<narrative explaining WHY the main relationships exist, not just that they exist>

---

## 3. Business Flows

### Flow 1: <Flow / Feature Name>

<ASCII diagram of the complete flow>

**Flow Narrative:**

1. The user <initial action>...
2. The system <validation / process>...
3. Data is persisted in <table> with state <state>...
4. <side effects>

**Business Rules:**

- <Rule>: <description + why it exists>

**Code Involved:**

- `<path/to/route.ts>` — <what it does>
- `<path/to/service.ts>` — <what it does>

<Repeat for every important flow. Do not cap.>

---

## 4. State Machines

### <Entity with states>

<ASCII state diagram>

**Transitions:**

| From | To  | Triggering Event | Effects        |
| ---- | --- | ---------------- | -------------- |
| <A>  | <B> | <what causes it> | <what happens> |

**Business Rules:**

- <why these transitions and not others>

---

## 5. Automatic Processes

### Database Triggers

| Trigger | When It Executes | What It Does | Why It Exists |
| ------- | ---------------- | ------------ | ------------- |

### Cron Jobs / Scheduled Tasks

| Job | Frequency | What It Does | Why It Exists |
| --- | --------- | ------------ | ------------- |

### Async Workers / Incoming Webhooks

| Worker / Webhook | Source / Trigger | What It Processes | System Effects |
| ---------------- | ---------------- | ----------------- | -------------- |

---

## 6. External Integrations

### <External Service>

<ASCII call diagram: your system ↔ the service>

**What it does:** <purpose of the integration>

**How it affects data:**

- <Table / entity>: <how>

**Flows that depend on this:**

- <Flow N>

**Failure behavior:** <what breaks if the service is down>

---

## 7. Discovery Gaps

> ALWAYS write this section, even if empty.

- <thing you could not verify and why>
- <missing PRD/SRS input, if any — recommend running `/project-foundation`>
- <DB tables you saw but could not place in a flow>

---

## 8. Downstream Consumers

This map feeds:

- `/master-implementation-plan` — uses entities + flows to schedule work
- `/sprint-development` — reads the relevant flow before planning a story
- `/business-api-map`, `/business-feature-map` — cross-reference entities

---

<!-- human-notes: anything written below this comment is preserved across regenerations -->
```

---

## Rules

1. **Cite sources** — every entity, flow, trigger, and integration claim must reference a file path or DB object. No invented behavior.
2. **Synthesize, don't dump** — do not list every column. The DB MCP is live and serves schema on demand.
3. **Preserve human notes** — in UPDATE mode, never discard human-written content. Look for the `<!-- human-notes: -->` marker and any section the user has clearly edited by hand. If unsure, ask.
4. **Always write Discovery Gaps** — even if the section is empty. An empty list still proves you looked.
5. **Visual first** — ASCII diagrams over paragraphs whenever the structure allows it.
6. **Do not auto-overwrite** — in UPDATE mode, show the diff summary and wait for explicit confirmation.
7. **Scope honestly** — if `$ARGUMENTS` scopes to a module, do not pretend to cover the full system. State the scope at the top.
8. **Language** — write the document in English (per project convention). Mirror the user's language only for conversational responses, not for the output file.
9. **No QA flavor** — this is a developer-facing map. Do not reference test cases, TMS, ATCs, or master test plans. QA workflows live in the sister repo.

---

## Final report

After generation, print a short report:

```markdown
# Business Data Map — <CREATE | UPDATE>

**File**: `.context/business/business-data-map.md`
**Scope**: <full-system | module=<name>>

## Documented

- Entities: <N>
- Business flows: <N>
- State machines: <N>
- Automatic processes: <N triggers, N cron jobs, N workers/webhooks>
- External integrations: <N>

## Discovery Gaps

- <list, or "None">

## Suggested next steps

- <e.g. `/master-implementation-plan` to schedule the work>
- <e.g. `/project-foundation` if PRD/SRS were missing>
```
