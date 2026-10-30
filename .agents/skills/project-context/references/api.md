
# Business API Map Generator

Generate or update the map of `business-api-context`: `.agents/skills/business-api-context/references/business-api-map.html`, a business-first map of how the system's API powers user journeys. Anatomy, section contract and incremental update: `../../agentic-dev-core/references/business-context-maps.md` §2 and §4; this reference says WHAT goes in the sections.

**Target**: `$ARGUMENTS` forwarded by the alias or given in the invocation (project path, module filter, or leave blank for full system)

---

## What this produces

One HTML map that explains **how the business operates through the API**, covering:

- The permission & auth model (tiers, token flow, where enforcement lives)
- Critical business journeys traced as end-to-end API call chains
- The architecture that sits behind the API (services, persistence, boundaries)
- External integrations at the API boundary (payment, auth, email, webhooks)
- Cross-references to data-map entities and feature-map features (by skill and section id)

This is the **narrative** complement to:

- the data map in `business-data-context` (data-centric)
- the feature map in `business-feature-context` (capability-centric)
- `bun run api:sync` output (technical types in `api/schemas/`)

**It is NOT an endpoint catalog.** See §What is NOT in this plan.

**Audience**: developers who need to understand the API contract well enough to implement, modify, or extend features. Keep prose business-first — a new contributor should grasp _why_ each journey exists before they touch the code that backs it.

---

## Sources (use ALL available)

Exhaust every source. Prefer existing context files over re-deriving from code. App paths resolve under `{{stack.app_root}}` (SKILL.md § Stack parameters).

| Source                                      | What to extract                                                           | Tool                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| OpenAPI spec                                | Endpoint inventory, auth tags, request/response shapes                    | `api/openapi.json`, output of `bun run api:sync`, or `[API_TOOL]`                   |
| The data map                                | Entities, flows, state machines — journeys must align to these            | `bun run context:map business-data-context`                                         |
| The feature map                             | Features, CRUD, integrations — endpoints belong to features               | `bun run context:map business-feature-context`                                      |
| Legacy map (input only)                     | a project's old markdown API map                                          | `.context/business/business-api-map.md` when present: read as input, cite it in `data-migrated-from`; never delete or rewrite it |
| Auth middleware                             | Where tokens are validated, how roles map, public-vs-protected boundaries | Read `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` — auth/, middleware/, guards/, decorators |
| Controllers / routes                        | Handler shapes and side effects behind each endpoint                      | Same backend entry — controllers, services, route files                             |
| Backend services & repositories             | What each handler delegates to (domain services, data access, queues)     | Same backend entry — services/, repositories/, domain/                              |
| Package dependencies                        | External SDKs at the API boundary (Stripe, Auth0, Resend, S3, etc.)       | Read `package.json`, `requirements.txt`, `Gemfile`                                  |
| Env / config (examples only)                | Auth provider config, integration endpoints, webhook URLs                 | Read `.env.example`, config files — NEVER read or dump real secrets                 |
| Product docs                                | Intended user journeys, business rules, MVP scope                         | `.context/PRD/user-journeys.md`, `.context/PRD/*`, `.context/SRS/*`                 |
| Existing API notes                          | Hand-written notes, onboarding guides, ADRs                               | `.context/`, `docs/`, `README.md`                                                   |

**Golden rule**: This is a _narrative_ document. If OpenAPI already expresses a fact as a schema, link to it — do NOT restate it in prose.

**Stack hints**: `bun run api:sync` syncs the OpenAPI spec and regenerates types under `api/schemas/`. Run it (or ask the user to run it) before reading routes if the spec is stale or missing. A Supabase-direct app has no spec to sync: skip `api:sync` and read the surface below. The `db`, `library-docs` and `web-search` capabilities are available for cross-checks (DB schema, library docs, integration patterns) but should not replace reading the codebase first.

---

## Mode detection

```
bun run context:map business-api-context --list
  → skill folder missing:   STOP. The skill is delivered by `bun sync`
                            (or ships with the boilerplate); never create it here.
  → placeholder notice:     CREATE mode: build every section from the sources.
  → a list of sections:     UPDATE mode: staleness check per section
                            (business-context-maps.md §5; `openapi:` sources
                            first), regenerate ONLY the stale ones, show a
                            section-level diff, WAIT for explicit approval.
                            NEVER regenerate the whole map.
```

---

## Dependency gates

Both context-file gates are **soft** — this command produces value even in sparse repos; missing inputs become Discovery Gaps, not hard stops.

- **Data map still a placeholder** (`bun run context:map business-data-context` prints the placeholder notice) → warn the user ("journeys will be weaker without entity context"), proceed, log the limitation in §Discovery Gaps. Suggest running `/project-context data` afterwards.
- **Feature map still a placeholder** → warn the user ("journey selection will rely on code scan alone"), proceed, log the limitation in §Discovery Gaps. Suggest running `/project-context features` afterwards.
- **No OpenAPI spec AND no route-scannable backend AND no Supabase-direct API** → hard stop. Ask the user to expose a spec or run `bun run api:sync`; you cannot produce an API map without one of the three.

---

## Supabase-direct API

An app whose `{{stack.database.provider}}` is `supabase` often has no API of its own for some or all domains: the browser and the server components call Supabase through its client, and the API is what Supabase exposes over the schema. Detect it by the client calls in the app code, not by the absence of an `api/` folder; an app can mix both (route handlers for billing, direct table access for profiles), and then each domain is mapped by what it really uses.

| Surface | Find it with | Maps to |
|---|---|---|
| tables and views through PostgREST | `.from('<table>')` calls | a route group per domain; the operation (`select`, `insert`, `update`, `upsert`, `delete`) is the method |
| RPC functions | `.rpc('<function>')` calls, plus the function's definition in the schema source | an endpoint each; sections cite `rpc:<function>` |
| Auth | `supabase.auth.*` calls, the auth callback route, the middleware or proxy that refreshes the session | the `auth-model` tiers |
| Storage | `.storage.from('<bucket>')` calls and the bucket policies | a route group per bucket |
| Edge Functions | `functions.invoke('<name>')` calls and `supabase/functions/` | an endpoint each |

Enforcement lives in the database: the `auth-model` section's "Where enforced" column names the RLS policy (the data map's `access-control` section id) or the function's `security definer` check, not a middleware file. Sections cite the calling modules (repo paths), `db:<table>`, `rpc:<function>` and `auth:<scheme>`. The `cross-references` section says there is no OpenAPI spec and no `api/schemas/` output for these domains, instead of pointing at them.

---

## Discovery phases

### Phase 1 — Permission & auth model

Identify tiers and how a caller reaches each one.

- What authentication schemes exist? (JWT, session cookie, API key, OAuth, bearer service token — treat each as its own tier, not a generic "Protected")
- How does a user obtain a token? (login endpoint, SSO flow, refresh recipe, service-to-service exchange)
- What roles/scopes/claims gate higher tiers? (admin, owner, tenant-scoped, service principal)
- Where does validation live? (middleware, guard, decorator, edge function, API gateway, or an RLS policy on a Supabase-direct domain)

**Outcome**: a taxonomy (Public / Authenticated / Role-based / Owner-scoped / Service) anchored to concrete code paths. Do NOT list endpoints per tier here — that is feature-map's job.

### Phase 2 — Critical business journeys

Select **3–7 journeys** that matter most to the business. Prioritize by:

- Revenue impact (checkout, billing, subscription, plan upgrade)
- Security (auth, password reset, permission changes, impersonation, token rotation)
- Core user value (the primary product flow — whatever the PRD calls "the happy path")
- High blast radius on failure (fund transfers, data exports, bulk operations, irreversible writes)

For each selected journey, trace the chain: `Client → Auth → Handler → Services → DB / External → Response`. Reference feature-map FEAT-IDs and data-map entities where possible. Cross-check with `.context/PRD/user-journeys.md` if it exists — do NOT invent journeys.

### Phase 3 — Architecture behind the API

One layer of depth, not exhaustive:

- What services sit behind the API? (monolith module, microservice, background worker, queue consumer)
- What persistence does it touch? (primary DB, cache, queue, object storage, search index)
- What deployment shape? (serverless function, container, edge worker, lambda)
- What internal boundaries matter? (multi-tenant isolation, row-level security, write-through caches)

Purpose: orient a developer on "what breaks if the API hangs here" and "where do I add a new endpoint that belongs to this domain".

### Phase 4 — External integrations at the API boundary

For each third-party service reached from the API:

- What triggers the call? (endpoint, webhook inbound, webhook outbound, background job)
- What is the failure mode visible to the user? (timeout, silent failure, queued retry, hard error)
- Which critical journeys depend on it?
- Where is it configured? (env var name only — never dump real secrets)

Pull from feature-map §Third-party integrations if available; enrich with the failure-mode column it omits.

### Phase 5 — Cross-reference with data-map and feature-map

Validate coherence, do not duplicate content:

- Every journey touches entities that exist in data-map — flag orphans.
- Every journey maps to features in feature-map — flag API-only paths not caught as features.
- Every integration listed in feature-map that reaches the API boundary appears here (and vice versa).

---

## Output structure

Before drawing the first figure, run the point-of-use check for capability `diagrams` (`../../agentic-dev-core/references/business-context-maps.md` §7). Write `.agents/skills/business-api-context/references/business-api-map.html` with line 1 `<!-- generated by project-context mode api; edited in place by business-api-context refresh; do not hand-edit -->` and these sections, as flat `<section>`s with the stable `id` named in each heading below, their `data-sources` (`openapi:<tag>`, `route:<path>`, `auth:<scheme>`, repo paths) and their `data-updated` date. Every fact a figure shows is also in the section text: the AI reads the text only.

A section you could not fill from evidence says so in one sentence and points to the Discovery phase above; it is never left empty. This keeps partially-discovered repos honest about what is and is not yet mapped.

### 1. `overview`: executive summary

2–3 paragraphs answering _what does this API let the business do?_ Frame from the user's perspective — "authenticated buyers complete a purchase in four calls", not "the API exposes 47 endpoints". Avoid counts and endpoint lists.

### 2. `auth-model`: permission & auth model

- Tier table: `Tier | Who it applies to | How to acquire | Where enforced (code path)`.
- A sequence figure (diagram-design) of the token flow for the primary auth scheme (login → token → subsequent call → refresh).
- If multiple schemes coexist (Supabase session + API key + service role), one figure per scheme.

No per-endpoint listings here.

### 3. `journey-<slug>`: critical business journeys

One section per journey. Each:

- Name + one-sentence business purpose.
- A sequence figure (diagram-design): `Client → Middleware → Handler → DB / External → Response`.
- Numbered narrative (1..N) with the _why_ at each step.
- **Endpoints involved**: list of `METHOD /path` pointers (not full specs — link to OpenAPI).
- **Entities touched**: pointers to data-map section ids.
- **Feature IDs**: pointers to feature-map FEAT-NNNs and section ids.

Cap at 7 journeys by default. If the system genuinely has more critical flows, document the cap decision in §Discovery Gaps rather than expanding silently.

### 4. `architecture`: architecture behind the API

- One layered architecture figure (diagram-design): `Client → API Gateway / Edge → Handlers → Services → Persistence / External`.
- Table: `Component | Role | Persistence/Integrations touched | Why it matters for dev`.

The "Why it matters for dev" column answers questions like: _where do new endpoints go?_, _what do I have to mock when I unit-test this?_, _which layer owns the business rule?_. One diagram total for the whole system, not one per journey.

### 5. `integrations`: external integrations

```markdown
| Service | Trigger                | Direction     | Failure mode (user-visible)          | Journeys affected |
| ------- | ---------------------- | ------------- | ------------------------------------ | ----------------- |
| Stripe  | POST /checkout         | Outbound sync | 5xx → order stuck in `pending`       | Checkout          |
| Stripe  | webhook /stripe/events | Inbound async | missed event → order never finalizes | Checkout          |
```

### 6. `cross-references`: cross-references

- Data-map entities this API exposes → `business-data-context` section ids (`bun run context:map business-data-context --section <id>`).
- Feature-map features this API backs → `business-feature-context` section ids.
- OpenAPI spec location (file path or URL) for full endpoint specs.
- `bun run api:sync` output path (`api/schemas/`) for TypeScript types.
- Supabase-direct domains: no spec and no `api/schemas/` types; the generated database types (`{{stack.database.types_path}}`) are the contract instead.
- Downstream consumers: `/project-context master-plan` (sequences API-backed work), `/sprint-development` (per-story implementation reads this map for context).

Purpose: make it obvious where each flavor of API info lives so nothing gets re-documented here.

### 7. `discovery-gaps`: discovery gaps

MANDATORY. List anything you could not verify:

- Auth schemes observed in code but missing from middleware (or vice versa).
- Journeys that could not be traced end-to-end (dead branches, missing evidence).
- Integrations mentioned in env but with no code calls (planned, dead, or undocumented?).
- Monorepo shards or backend services not inspected.
- Webhooks configured in external dashboards but not discoverable from code.
- Endpoints with no matching feature-map entry or data-map entity.

---

## After generation

- Verify: `bun run context:map business-api-context --list` prints every section with the run's date and no placeholder notice.
- If the data map or the feature map was still a placeholder during generation, note the limitation in the summary you report back to the user and suggest running the corresponding mode.
- The `data-updated` date of each section carrying an `openapi:` source is the "last verified against OpenAPI" date: the staleness check reads it, no extra banner line.
- In UPDATE mode: show the section-level diff and wait for explicit confirmation before writing.
- The map just changed: review the skill's rules and `references/gotchas.md` against it; a rule it contradicts is PROPOSED for "No longer true", never deleted.
- Report: auth tiers documented, journeys traced, services behind the API, integrations mapped, discovery gaps.

---

## What is NOT in this plan

This command does one thing: narrate the **business-level API story** for developers. Everything below is delegated — do not expand scope.

| Out of scope                                                                | Owner                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| Exhaustive endpoint catalog (every route with request/response)             | `bun run api:sync` + OpenAPI spec               |
| TypeScript types for request/response shapes                                | `api/schemas/*.types.ts` via `bun run api:sync` |
| Per-endpoint cURL / DevTools recipes                                        | OpenAPI spec viewer / Scalar UI                 |
| CRUD matrix per entity                                                      | `/project-context features`                         |
| UI component inventory                                                      | `/project-context features`                         |
| Entity schemas, state machines, business rules                              | `/project-context data`                            |
| Risk-ranked implementation roadmap ("what to build and why, in what order") | `/project-context master-plan`                   |
| Per-story implementation plan and code                                      | `/sprint-development`                           |
| Unit-test design (TDD red-green for a function)                             | `/unit-testing`                                 |
| QA test cases, regression suites, automation                                | sister repo `agentic-qa-boilerplate`            |

If the user asks for any of the above inside the API map, decline politely and point to the owning tool. This document stays short, narrative, and business-first.
