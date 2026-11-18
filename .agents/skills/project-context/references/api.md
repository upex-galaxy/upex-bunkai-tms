# Business API Map Generator

Generates or updates the map of `business-api-context`: `.agents/skills/business-api-context/references/business-api-map.html`, a business-first map of how the system's API powers user journeys. Anatomy, section contract and incremental update live in `../../agentic-dev-core/references/business-context-maps.md` §2 and §4; this reference says what goes in the sections.

**Target**: `$ARGUMENTS` forwarded by the alias or given in the invocation (project path, module filter, or blank for the full system).

---

## What this produces

One HTML map that explains how the business operates through the API:

- the permission and auth model (tiers, token flow, where enforcement lives)
- critical business journeys traced as end-to-end API call chains
- the architecture behind the API (services, persistence, boundaries)
- external integrations at the API boundary (payment, auth, email, webhooks)
- cross-references to data-map entities and feature-map features, by skill and section id

It is the narrative complement to the data map in `business-data-context` (data-centric), the feature map in `business-feature-context` (capability-centric) and the `bun run api:sync` output (technical types in `api/schemas/`). It is not an endpoint catalog; the table in "What is NOT in this plan" says who owns the rest.

The audience is developers who need to understand the API contract well enough to implement, modify or extend features. Write business-first: a new contributor should grasp why each journey exists before they touch the code behind it.

---

## Sources

Use every source available, and prefer existing context files over re-deriving from code. App paths resolve under `{{stack.app_root}}` (SKILL.md § Stack parameters).

| Source | What to extract | Tool |
|---|---|---|
| OpenAPI spec | Endpoint inventory, auth tags, request/response shapes | `api/openapi.json`, output of `bun run api:sync`, or `[API_TOOL]` |
| The data map | Entities, flows, state machines (journeys align to these) | `bun run context:map business-data-context` |
| The feature map | Features, CRUD, integrations (endpoints belong to features) | `bun run context:map business-feature-context` |
| Legacy map (input only) | A project's old markdown API map | `.context/business/business-api-map.md` when present: read it as input and cite it in `data-migrated-from`; leave the file in place, unedited |
| Auth middleware | Where tokens are validated, how roles map, public-vs-protected boundaries | `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}`: auth/, middleware/, guards/, decorators |
| Controllers / routes | Handler shapes and side effects behind each endpoint | Same backend entry: controllers, services, route files |
| Backend services and repositories | What each handler delegates to (domain services, data access, queues) | Same backend entry: services/, repositories/, domain/ |
| Package dependencies | External SDKs at the API boundary (Stripe, Auth0, Resend, S3, etc.) | `package.json`, `requirements.txt`, `Gemfile` |
| Env / config (examples only) | Auth provider config, integration endpoints, webhook URLs | `.env.example` and config files; real secrets are never read or dumped |
| Product docs | Intended user journeys, business rules, MVP scope | `.context/PRD/user-journeys.md`, `.context/PRD/*`, `.context/SRS/*` |
| Existing API notes | Hand-written notes, onboarding guides, ADRs | `.context/`, `docs/`, `README.md` |

**Golden rule**: this is a narrative document. When OpenAPI already expresses a fact as a schema, link to it instead of restating it in prose.

**Stack hints**: `bun run api:sync` syncs the OpenAPI spec and regenerates types under `api/schemas/`. Run it (or ask the user to) before reading routes when the spec is stale or missing. A Supabase-direct app has no spec to sync: skip `api:sync` and read the surface in the next section. The `db`, `library-docs` and `web-search` capabilities help with cross-checks (DB schema, library docs, integration patterns), but read the codebase first.

---

## Mode detection

```
bun run context:map business-api-context --list
  → skill folder missing:   STOP. The skill is delivered by `bun sync`
                            (or ships with the boilerplate); do not create it here.
  → placeholder notice:     CREATE mode: build every section from the sources.
  → a list of sections:     UPDATE mode: staleness check per section
                            (business-context-maps.md §5; `openapi:` sources
                            first), regenerate only the stale ones, show a
                            section-level diff, wait for explicit approval.
                            Never regenerate the whole map.
```

UPDATE approval comes from the person who invoked the mode. When nobody is present (a supervised worker or a routine), follow `../../agentic-dev-core/references/decision-protocol.md`: the delegating brief is the approval when it covers the write, and without one you prepare the diff, write nothing and report it.

---

## Dependency gates

Both context-map gates are soft. The command still produces value in sparse repos, and a missing input becomes a Discovery Gap instead of a stop.

- Data map still a placeholder (`bun run context:map business-data-context` prints the placeholder notice): warn the user ("journeys will be weaker without entity context"), proceed, log the limitation in the `discovery-gaps` section, and suggest `/project-context data` afterwards.
- Feature map still a placeholder: warn the user ("journey selection will rely on code scan alone"), proceed, log it in `discovery-gaps`, and suggest `/project-context features` afterwards.
- No OpenAPI spec, no route-scannable backend and no Supabase-direct API: hard stop. Ask the user to expose a spec or run `bun run api:sync`; an API map needs at least one of the three.

---

## Supabase-direct API

An app whose `{{stack.database.provider}}` is `supabase` often has no API of its own for some or all domains: the browser and the server components call Supabase through its client, and the API is whatever Supabase exposes over the schema. Detect it by the client calls in the app code, not by a missing `api/` folder. An app can mix both (route handlers for billing, direct table access for profiles); map each domain by what it really uses.

| Surface | Find it with | Maps to |
|---|---|---|
| tables and views through PostgREST | `.from('<table>')` calls | a route group per domain; the operation (`select`, `insert`, `update`, `upsert`, `delete`) is the method |
| RPC functions | `.rpc('<function>')` calls, plus the function's definition in the schema source | an endpoint each; sections cite `rpc:<function>` |
| Auth | `supabase.auth.*` calls, the auth callback route, the middleware or proxy that refreshes the session | the `auth-model` tiers |
| Storage | `.storage.from('<bucket>')` calls and the bucket policies | a route group per bucket |
| Edge Functions | `functions.invoke('<name>')` calls and `supabase/functions/` | an endpoint each |

Enforcement lives in the database. The `auth-model` section's "Where enforced" column names the RLS policy (the data map's `access-control` section id) or the function's `security definer` check, not a middleware file. Sections cite the calling modules (repo paths), `db:<table>`, `rpc:<function>` and `auth:<scheme>`. The `cross-references` section says there is no OpenAPI spec and no `api/schemas/` output for these domains, instead of pointing at them.

---

## Discovery phases

### Phase 1: permission and auth model

Identify the tiers and how a caller reaches each one.

- Which authentication schemes exist (JWT, session cookie, API key, OAuth, bearer service token)? Each is its own tier, not a generic "Protected".
- How does a user obtain a token (login endpoint, SSO flow, refresh recipe, service-to-service exchange)?
- Which roles, scopes or claims gate higher tiers (admin, owner, tenant-scoped, service principal)?
- Where does validation live (middleware, guard, decorator, edge function, API gateway, or an RLS policy on a Supabase-direct domain)?

The outcome is a taxonomy (Public / Authenticated / Role-based / Owner-scoped / Service) anchored to concrete code paths. Endpoints per tier are the feature map's job, so leave them out.

### Phase 2: critical business journeys

Select 3 to 7 journeys that matter most to the business, prioritized by:

- revenue impact (checkout, billing, subscription, plan upgrade)
- security (auth, password reset, permission changes, impersonation, token rotation)
- core user value (the primary product flow, whatever the PRD calls the happy path)
- blast radius on failure (fund transfers, data exports, bulk operations, irreversible writes)

For each journey, trace the chain `Client → Auth → Handler → Services → DB / External → Response`, referencing feature-map FEAT-IDs and data-map entities where you can. Cross-check against `.context/PRD/user-journeys.md` when it exists, and take journeys from evidence only.

### Phase 3: architecture behind the API

One layer of depth, not an exhaustive tour.

- Which services sit behind the API (monolith module, microservice, background worker, queue consumer)?
- Which persistence does it touch (primary DB, cache, queue, object storage, search index)?
- What is the deployment shape (serverless function, container, edge worker, lambda)?
- Which internal boundaries matter (multi-tenant isolation, row-level security, write-through caches)?

The purpose is to answer "what breaks if the API hangs here" and "where does a new endpoint for this domain go".

### Phase 4: external integrations at the API boundary

For each third-party service reached from the API:

- What triggers the call (endpoint, inbound webhook, outbound webhook, background job)?
- What failure mode does the user see (timeout, silent failure, queued retry, hard error)?
- Which critical journeys depend on it?
- Where is it configured (the env var name only, never the secret)?

Pull from the feature map's third-party integrations when available, and add the failure-mode column it omits.

### Phase 5: cross-reference with the data map and the feature map

Check coherence without duplicating content.

- Every journey touches entities that exist in the data map; flag orphans.
- Every journey maps to features in the feature map; flag API-only paths the feature map missed.
- Every integration the feature map lists that reaches the API boundary appears here, and the reverse.

---

## Output structure

Before drawing the first figure, run the point-of-use check for capability `diagrams` (`../../agentic-dev-core/references/business-context-maps.md` §7). Write `.agents/skills/business-api-context/references/business-api-map.html` with line 1 `<!-- generated by project-context mode api; edited in place by business-api-context refresh; do not hand-edit -->` and these sections, as flat `<section>`s with the stable `id` named in each heading below, their `data-sources` (`openapi:<tag>`, `route:<path>`, `auth:<scheme>`, repo paths) and their `data-updated` date. Every fact a figure shows is also in the section text, because the AI reads the text only.

A section you could not fill from evidence says so in one sentence and points to the discovery phase above. It is never left empty, which keeps a partially discovered repo honest about what is mapped.

### 1. `overview`: executive summary

Two or three paragraphs on what this API lets the business do, framed from the user's side: "authenticated buyers complete a purchase in four calls", not "the API exposes 47 endpoints". Leave out counts and endpoint lists.

### 2. `auth-model`: permission and auth model

- A tier table: `Tier | Who it applies to | How to acquire | Where enforced (code path)`.
- A sequence figure (diagram-design) of the token flow for the primary auth scheme (login, token, subsequent call, refresh).
- When several schemes coexist (Supabase session, API key, service role), one figure per scheme.

Per-endpoint listings stay out of this section.

### 3. `journey-<slug>`: critical business journeys

One section per journey, each with:

- a name and a one-sentence business purpose
- a sequence figure (diagram-design): `Client → Middleware → Handler → DB / External → Response`
- a numbered narrative (1 to N) with the why at each step
- endpoints involved, as `METHOD /path` pointers that link to OpenAPI instead of copying specs
- entities touched, as pointers to data-map section ids
- feature IDs, as pointers to feature-map FEAT-NNNs and section ids

Cap at 7 journeys by default. When the system has more critical flows, record the cap decision in `discovery-gaps` instead of expanding silently.

### 4. `architecture`: architecture behind the API

- One layered architecture figure (diagram-design): `Client → API Gateway / Edge → Handlers → Services → Persistence / External`.
- A table: `Component | Role | Persistence/Integrations touched | Why it matters for dev`.

The last column answers where new endpoints go, what to mock when unit-testing this, and which layer owns the business rule. One diagram for the whole system, not one per journey.

### 5. `integrations`: external integrations

```markdown
| Service | Trigger                | Direction     | Failure mode (user-visible)          | Journeys affected |
| ------- | ---------------------- | ------------- | ------------------------------------ | ----------------- |
| Stripe  | POST /checkout         | Outbound sync | 5xx → order stuck in `pending`       | Checkout          |
| Stripe  | webhook /stripe/events | Inbound async | missed event → order never finalizes | Checkout          |
```

### 6. `cross-references`: cross-references

- Data-map entities this API exposes, as `business-data-context` section ids (`bun run context:map business-data-context --section <id>`).
- Feature-map features this API backs, as `business-feature-context` section ids.
- The OpenAPI spec location (file path or URL) for full endpoint specs.
- The `bun run api:sync` output path (`api/schemas/`) for TypeScript types.
- Supabase-direct domains: no spec and no `api/schemas/` types; the generated database types (`{{stack.database.types_path}}`) are the contract instead.
- Downstream consumers: `/project-context master-plan` (sequences API-backed work) and `/sprint-development` (per-story implementation reads this map for context).

The point is that every kind of API information has one visible home, so nothing is documented twice.

### 7. `discovery-gaps`: discovery gaps

Always written. List everything you could not verify:

- auth schemes seen in code but missing from middleware, or the reverse
- journeys that could not be traced end to end (dead branches, missing evidence)
- integrations mentioned in env with no code calls (planned, dead or undocumented?)
- monorepo shards or backend services not inspected
- webhooks configured in external dashboards but not discoverable from code
- endpoints with no matching feature-map entry or data-map entity

---

## After generation

- Verify that `bun run context:map business-api-context --list` prints every section with the run's date and no placeholder notice.
- If the data map or the feature map was still a placeholder during generation, say so in the summary you report back and suggest the matching mode.
- The `data-updated` date of each section carrying an `openapi:` source is its "last verified against OpenAPI" date; the staleness check reads it, so no extra banner line is needed.
- In UPDATE mode, show the section-level diff and get explicit confirmation before writing (see Mode detection for the unattended case).
- The map just changed, so review the skill's rules and `references/gotchas.md` against it. A rule the map contradicts is proposed for "No longer true", never deleted.
- Report: auth tiers documented, journeys traced, services behind the API, integrations mapped, discovery gaps.

---

## What is NOT in this plan

This command narrates the business-level API story for developers. Everything below belongs to another owner, so do not expand scope.

| Out of scope | Owner |
|---|---|
| Exhaustive endpoint catalog (every route with request/response) | `bun run api:sync` + OpenAPI spec |
| TypeScript types for request/response shapes | `api/schemas/*.types.ts` via `bun run api:sync` |
| Per-endpoint cURL / DevTools recipes | OpenAPI spec viewer / Scalar UI |
| CRUD matrix per entity | `/project-context features` |
| UI component inventory | `/project-context features` |
| Entity schemas, state machines, business rules | `/project-context data` |
| Risk-ranked implementation roadmap ("what to build and why, in what order") | `/project-context master-plan` |
| Per-story implementation plan and code | `/sprint-development` |
| Unit-test design (TDD red-green for a function) | `/unit-testing` |
| QA test cases, regression suites, automation | sister repo `agentic-qa-boilerplate` |

When the user asks for any of these inside the API map, decline and point to the owner. The document stays short, narrative and business-first.
