# Master Bootstrap Plan — Bunkai

> **Status (2026-05-20)**: Phase A · B · C **complete**. Phase D · E **pending**.
> **Last applied commit**: `b947efd feat(bootstrap): phase C — supabase backend slice 1 + auth scaffolding`.
> **Supabase project**: `fmbpikzpkafptqximhxn` (bunkai-database, ACTIVE_HEALTHY, Postgres 17, us-east-1).
> **Origin of this file**: synthesised from `/home/sai/.claude/plans/ok-ya-hemos-generado-elegant-summit.md` (the original 5-phase plan authored 2026-05-19) cross-checked against the actual repo state, then expanded with the new context produced during Phase A → C (Wave 1+2 backlog, RLS helpers, types pipeline notes).

This is the **authoritative roadmap** for finishing `/project-bootstrap` on Bunkai. Update it when scope changes; do not let it drift.

---

## 0. Reference map — read before resuming

### 0.1 Product foundation (already authored by `/project-foundation`)

| File | What it contains | Why it matters here |
|---|---|---|
| [`.context/business/business-model.md`](business/business-model.md) | Open-core / Cloud / Enterprise tiering, monetisation, moat. | Justifies the 10-table Slice 1 (membership + ATC anchoring are the moat). |
| [`.context/business/market-context.md`](business/market-context.md) | Competitive landscape (Xray, Zephyr, TestRail). | Frames the agentic-execution priority that drives Phase E (bearer auth + OpenAPI). |
| [`.context/business/business-data-map.md`](business/business-data-map.md) | Entities, state machines, automatic processes, integrations. | **Source of truth for `lib/types.ts` and the migrations**. Phase D queries must respect the flows documented here. |
| [`.context/business/business-feature-map.md`](business/business-feature-map.md) | Domain → feature → CRUD matrix. | Phase D needs this when wiring the tree view + ATC editor (which sub-features stay mocked vs. live). |
| [`.context/business/business-api-map.md`](business/business-api-map.md) | Auth model, journeys, endpoint inventory. | Phase E API-routes layer maps 1-to-1 to the endpoints listed here. |
| [`.context/business/project-dev-guide.md`](business/project-dev-guide.md) | Onboarding for any contributor (human or AI). | Read it before sub-agents are dispatched in Phase D / E. |
| [`.context/PRD/executive-summary.md`](PRD/executive-summary.md) | One-page product vision. | Top-of-file context for sub-agent briefings. |
| [`.context/PRD/user-personas.md`](PRD/user-personas.md) | QA Lead, QA Engineer, AI Agent personas. | UX decisions in Phase D follow these personas. |
| [`.context/PRD/user-journeys.md`](PRD/user-journeys.md) | Critical journeys (signup → workspace → ATC author → run). | Phase D end-to-end smoke maps to journey #1 (signup) + #3 (ATC author). |
| [`.context/PRD/mvp-scope.md`](PRD/mvp-scope.md) | EPIC-BK-001..009 inventory + signature features. | Bootstrap finish-line: ready for `/product-management` + `/sprint-development` against this scope. |
| [`.context/SRS/architecture-specs.md`](SRS/architecture-specs.md) | ERD §2, RLS §2.4, data-flow §4, security §5. | **Hard contract** — every migration column name, every RLS policy, every middleware behaviour traces here. |
| [`.context/SRS/functional-specs.md`](SRS/functional-specs.md) | FR-001..FR-040 functional requirements. | Phase D feature-level acceptance. |
| [`.context/SRS/non-functional-specs.md`](SRS/non-functional-specs.md) | LCP/TTI budgets, RLS overhead notes, magic-link rate limits. | Phase D + E quality bar. |
| [`.context/SRS/api-contracts.yaml`](SRS/api-contracts.yaml) | OpenAPI 3.1 spec (~30 endpoints across 13 tags). | Phase E OpenAPI integration syncs against this file. |
| [`DESIGN.md`](../DESIGN.md) | Google-Labs design system (tokens, typography, components, motion, a11y). | Phase D UI work must stay token-bound; no ad-hoc hex values. |
| [`.context/master-implementation-plan.md`](master-implementation-plan.md) | 18-section Wave 0–7 MVP roadmap. | Bootstrap finishes Wave 0 + half of Wave 1 (Tenancy + Project hierarchy backend). |
| [`.context/PBI/epic-tree.md`](PBI/epic-tree.md) | Jira issue tree seeded via `/product-management`. | Phase D handles the first stories of EPIC-BK-1 / EPIC-BK-7 / EPIC-BK-12 / EPIC-BK-13. |

### 0.2 Bootstrap skill references (Phase D · E playbooks)

The `/project-bootstrap` skill ships per-feature reference files. Each Phase E increment maps to one of them — load the file before authoring the increment.

| Skill reference | Used in | Purpose |
|---|---|---|
| [`.claude/skills/project-bootstrap/references/backend-setup.md`](../.claude/skills/project-bootstrap/references/backend-setup.md) | Phase C (done) | Stack detection, DB schema gen, base middleware, type pipeline, verification. |
| [`.claude/skills/project-bootstrap/references/frontend-setup.md`](../.claude/skills/project-bootstrap/references/frontend-setup.md) | Phase A (done) | Framework scaffolding, design-system integration, page skeletons. |
| [`.claude/skills/project-bootstrap/references/env-url-setup.md`](../.claude/skills/project-bootstrap/references/env-url-setup.md) | **Phase E.1** | Typed `.env` schema (Zod), env-aware URL helpers, validation at boot. |
| [`.claude/skills/project-bootstrap/references/api-routes-setup.md`](../.claude/skills/project-bootstrap/references/api-routes-setup.md) | **Phase E.2** | Route conventions, error envelope, request logging, auth middleware wiring. |
| [`.claude/skills/project-bootstrap/references/bearer-token-support.md`](../.claude/skills/project-bootstrap/references/bearer-token-support.md) | **Phase E.3** | JWT-style PAT issuance, refresh, protected-route middleware. |
| [`.claude/skills/project-bootstrap/references/openapi-setup.md`](../.claude/skills/project-bootstrap/references/openapi-setup.md) | **Phase E.4** | Schema gen, Scalar UI, contract publication against `.context/SRS/api-contracts.yaml`. |
| [`.claude/skills/project-bootstrap/references/supabase-types-setup.md`](../.claude/skills/project-bootstrap/references/supabase-types-setup.md) | **Phase E.5** | DB schema → TS pipeline, regeneration script, frontend wiring. |

### 0.3 Decisions cached in Engram (do not re-ask)

- **Slice 1 = 10 tables** (workspaces, workspace_members, projects, modules, user_stories, acceptance_criteria, atcs, atc_steps, atc_assertions, atc_acceptance_criteria). Remaining 9 ERD entities defer to their sprints.
- **Supabase = existing project `fmbpikzpkafptqximhxn`**. Vars present in `.env` and Vercel. No new project creation.
- **Login = magic-link only in MVP**. OAuth ships in sprint `EPIC-BK-1`.
- **Ordering = frontend-first with mocks → backend → swap**. Already paid the swap cost in Phase D plan.
- **CSS tokens canonical at `.context/designs/bunkai-test-management-tool/project/styles.css`**, mirrored in `DESIGN.md`. Tailwind config in `tailwind.config.ts` reads from CSS vars.

---

## 1. Phase-by-phase actual state

| Phase | Scope | Status | Commit | Notes |
|---|---|---|---|---|
| A | Next.js 15 scaffold + DESIGN.md tokens wired | ✅ done | `430916d` | shadcn `init` skipped — manually authored `components.json` + 4 primitives (Button, Input, Label, Card). Other Radix wrappers (Dialog/Dropdown/Tooltip/Tabs/Toast/Command) deferred to Phase D when they have a concrete consumer. |
| B | 3 demo pages with mock data | ✅ done | `6821005` | `/login` + `/projects/[slug]` + `/projects/[slug]/atcs/[atcId]`. Monaco via `next/dynamic({ssr:false})`. TanStack Table for ATC listing. AnchoringPanel enforces moat visually. |
| C | Supabase backend Slice 1 + auth scaffolding | ✅ done | `b947efd` | 5 migrations (one added: `0005_rls_helpers.sql`). 10 tables, 40 policies, 4 SECURITY DEFINER helpers, 2 triggers. Seed deferred (auth.users FK). |
| D | Swap mocks → real Supabase queries | ⏸️ pending | — | Detailed plan in §2 below. |
| E | Incremental features (env, API routes, bearer, OpenAPI, types regen) | ⏸️ pending | — | Detailed plan in §3 below. |

### 1.1 Drift from the original plan (now baked into truth)

| Original plan said | Actually shipped | Reason |
|---|---|---|
| `shadcn@latest init` via TTY | Manual `components.json` + 4 primitives in `components/ui/` | bunx shadcn init hangs in non-TTY contexts. |
| 4 migrations `0001..0004` | 5 migrations `0001..0005` | `0005_rls_helpers.sql` added to refactor all 40 policies through SECURITY DEFINER helpers — needed to fix infinite recursion in `workspace_members.SELECT`. |
| Inline `EXISTS (… workspace_members …)` in each policy | `public.bunkai_is_workspace_member(ws_id)` SECURITY DEFINER + 3 sibling helpers | Inline recursion (42P17) on workspace_members; helper pattern is the canonical Supabase fix. |
| `atcs.tsv` as `GENERATED ALWAYS AS (…) STORED` | Regular column + `BEFORE INSERT OR UPDATE OF (title,tags)` trigger | `to_tsvector('english', …)` is STABLE not IMMUTABLE — Postgres rejects it in a GENERATED column. |
| Seed data replicating `lib/mock/*` in Phase C | Deferred to Phase D | `workspaces.owner_user_id` FK to `auth.users(id)` requires a real signed-in user; seeding pre-login fails referential integrity. |
| `withWorkspace(supabase, workspaceId).from(...)` helper | Not yet created | Phase D will add this when writing the first real query — it has no consumer before then. |
| OAuth providers in `/login` UI | Disabled placeholders ("Continue with GitHub / Google · soon") | Per decision — OAuth wave is `EPIC-BK-1` sprint, not bootstrap. |
| Lucide brand icons (`Github`, `Google`) | Mono-glyph placeholders ("GH", "G") | `lucide-react@1.16` dropped brand icons. |

---

## 2. Phase D — Swap mocks → real Supabase queries

**Goal**: every Phase B page reads/writes through Supabase, magic-link signup completes end-to-end, the moat (anchoring) is enforced at the DB level via the existing RLS policies and FK constraints.

**Pre-flight checks** (do these before writing code):
- [ ] `bun run typecheck` exit 0
- [ ] Supabase env vars present in `.env` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Confirm `git log origin/main..HEAD` is at `b947efd` or later — Phase C migrations must exist remotely if a CI run is expected
- [ ] Dev server on `:3000` either fresh-started or restarted after env changes (env is cached at MCP-spawn time)

### 2.1 Steps

1. **Wrap the (app) layout with AuthProvider**
   - `app/(app)/layout.tsx`: import `AuthProvider` from `@components/providers/auth-context` and wrap `children`. Marks every protected route as a client tree that can call `useAuth()`.
   - **Files**: `app/(app)/layout.tsx`.

2. **Magic-link wiring on `/login`**
   - Replace the `console.warn` stub with `const supabase = createClient(); await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: \`${window.location.origin}/auth/callback?next=/projects\` } })`.
   - Keep the "Check your inbox" confirmation state.
   - Surface error toast on `error?.message` (use sonner — already installed Phase B).
   - **Files**: `app/(auth)/login/page.tsx`.

3. **Auth callback route**
   - Create `app/auth/callback/route.ts` — `GET` handler. Read `code` + `next` from query. Use `createServerClient` from `@lib/supabase/server`. Call `await supabase.auth.exchangeCodeForSession(code)`. On success redirect to `next` (default `/projects`). On failure redirect to `/login?error=otp_exchange_failed`.
   - **Files**: `app/auth/callback/route.ts`.

4. **First-workspace bootstrap (chicken-and-egg fix)**
   Two acceptable approaches — pick **A** for MVP velocity:
   - **A. SECURITY DEFINER RPC `bunkai_bootstrap_workspace(p_slug, p_name)`** in a new migration `supabase/migrations/0006_bootstrap_workspace.sql`. Runs as definer, inserts `workspaces` + `workspace_members(role='owner', status='active')` in one transaction tied to `auth.uid()`. Grant EXECUTE to `authenticated`.
   - **B. Server action `bootstrapWorkspace(slug, name)`** using the service-role admin client (`@lib/supabase/admin`). Same insert pair, just from the application side.
   - A is preferred — keeps the invariant at the DB tier and removes the need for any service-role usage in interactive flows.
   - **Files**: `supabase/migrations/0006_bootstrap_workspace.sql`, `app/(app)/onboarding/page.tsx` (post-signup landing that calls the RPC), `lib/supabase/rpc.ts` (typed wrapper).

5. **`/projects/[projectSlug]` server fetch**
   - Server Component reads:
     ```ts
     const supabase = await createServerClient();
     const { data: project } = await supabase.from('projects').select('*').eq('slug', slug).single();
     const { data: modules } = await supabase.from('modules').select('*').eq('project_id', project.id);
     const { data: stories } = await supabase.from('user_stories').select('*, acceptance_criteria(*)').in('module_id', moduleIds);
     const { data: atcs }    = await supabase.from('atcs').select('*').eq('project_id', project.id);
     ```
   - Reuse `buildModuleTree(...)` from `@lib/mock` (move helper to `@lib/tree.ts` since it's not mock-specific).
   - **Files**: `app/(app)/projects/[projectSlug]/page.tsx`, `lib/tree.ts` (extracted).

6. **`/projects/[slug]/atcs/[atcId]` server fetch + transactional save**
   - Server Component fetches the ATC + steps + assertions + bound ACs in parallel.
   - `Save` handler is a Server Action that runs a transactional upsert across `atcs`, `atc_steps`, `atc_assertions`, `atc_acceptance_criteria`. RLS enforces workspace + role; FK on `user_story_id` (`ON DELETE RESTRICT`) plus the M:N `atc_acceptance_criteria` enforces the anchoring moat at the DB tier.
   - Optimistic-update locally on success; revert on failure.
   - **Files**: `app/(app)/projects/[projectSlug]/atcs/[atcId]/page.tsx`, `app/(app)/projects/[projectSlug]/atcs/[atcId]/actions.ts`.

7. **`withWorkspace` query helper**
   - `lib/supabase/with-workspace.ts`: `function withWorkspace<T extends keyof Database['public']['Tables']>(supabase, workspaceId)` returning a chainable that pre-filters tables that have `workspace_id`. Avoids the "forgot to filter workspace_id" risk flagged in §5.
   - **Files**: `lib/supabase/with-workspace.ts`.

8. **Delete `lib/mock/`** (except seed helpers that were extracted).
   - Keep `lib/tree.ts` if you extracted `buildModuleTree`.
   - Update all imports.
   - **Files**: removed — `lib/mock/*`.

9. **Verification**
   - [ ] `bun run typecheck` exit 0
   - [ ] `bun run lint:check` clean
   - [ ] Manual: signup → email arrives → click → cookie present → middleware allows `/projects` → tree renders → ATC editor saves → reload persists
   - [ ] Negative test: sign out → navigate `/projects/bunkai-mvp` → redirect to `/login?next=/projects/bunkai-mvp`
   - [ ] RLS smoke: SQL editor — `SET ROLE authenticated; SET LOCAL "request.jwt.claims" TO '{"sub":"<other-user>"}'; SELECT count(*) FROM atcs WHERE project_id = '<your project>'` returns 0.

### 2.2 Critical files Phase D

```
app/auth/callback/route.ts                              # NEW — OTP exchange
app/(app)/layout.tsx                                    # MODIFIED — wrap AuthProvider
app/(app)/onboarding/page.tsx                           # NEW — first-workspace bootstrap UI
app/(app)/projects/[projectSlug]/page.tsx               # MODIFIED — server fetch
app/(app)/projects/[projectSlug]/atcs/[atcId]/page.tsx  # MODIFIED — server fetch
app/(app)/projects/[projectSlug]/atcs/[atcId]/actions.ts # NEW — Server Action save
app/(auth)/login/page.tsx                               # MODIFIED — real signInWithOtp
lib/supabase/rpc.ts                                     # NEW — typed RPC wrapper
lib/supabase/with-workspace.ts                          # NEW — workspace-scoped query helper
lib/tree.ts                                             # NEW (extracted from lib/mock/index.ts)
lib/mock/                                               # DELETED
supabase/migrations/0006_bootstrap_workspace.sql        # NEW — DEFINER RPC
```

### 2.3 Hand-off when Phase D closes

After Phase D verification passes:
- Update `lib/types/supabase.ts` (re-run `mcp__claude_ai_Supabase__generate_typescript_types` if `0006` lands).
- Commit: `feat(bootstrap): phase D — supabase wiring + magic-link signup E2E`.
- `mem_save` under topic `bootstrap/phase-d-supabase-wiring` with the gotchas + final auth flow narrative.
- Phase E starts.

---

## 3. Phase E — Incremental features

Run in this order. Each item is one increment / one commit.

### 3.1 Env vars + URL builders (`/project-bootstrap` reference: `env-url-setup.md`)

- `lib/env.ts` — Zod schema covering every variable read by the app. Throws on boot if any required var is missing. Replaces the lighter `lib/config.ts` written in Phase C (or wraps it).
- `lib/urls.ts` — `apiUrl(path)`, `webUrl(path)` helpers that read `.agents/project.yaml` `active_env` to switch between local/staging/production hosts.
- Re-validate all `process.env.NEXT_PUBLIC_*` accesses are static (Next.js inlines those only when statically referenced).
- **Commit**: `feat(bootstrap): phase E.1 — typed env + URL builders`.

### 3.2 API routes + middleware (`api-routes-setup.md`)

- Route convention: `app/api/v1/{resource}/route.ts`. One handler per HTTP verb.
- Error envelope JSON: `{ error: { code, message, details? } }`.
- Request-id middleware: generate `x-request-id` if missing, log on every request, propagate to Supabase.
- Idempotency-key middleware for `POST /api/v1/runs` (table `idempotency_keys` is Phase F — for now reserve the header + middleware shape).
- **Commit**: `feat(bootstrap): phase E.2 — API route conventions + middleware`.

### 3.3 Bearer-token auth (`bearer-token-support.md`)

- New migration `supabase/migrations/0007_access_tokens.sql`: `access_tokens` table (`id`, `user_id`, `workspace_id?`, `token_prefix`, `hash` SHA-256, `scopes text[]`, `expires_at`, `revoked_at`, `created_at`).
- RLS: owner sees their own tokens only; service-role bypasses.
- `POST /api/v1/tokens` endpoint that mints a random 32-byte token, returns `bk_pat_<prefix>.<secret>` ONCE (never persisted in clear), stores `prefix + sha256(secret)`.
- `lib/api/middleware/bearer.ts` — `requireBearerToken()` that looks up the token, attaches `{ user_id, workspace_id?, scopes }` to the request, rejects expired/revoked.
- **Commit**: `feat(bootstrap): phase E.3 — bearer-token auth for CLI + AI agents`.

### 3.4 OpenAPI integration (`openapi-setup.md`)

- Generate OpenAPI 3.1 spec from Zod schemas via `zod-to-openapi` (or `@asteasolutions/zod-to-openapi`).
- Mount Scalar UI at `/api/docs` (Server Component + Scalar's `<APIReference>`).
- Sync against `.context/SRS/api-contracts.yaml` — diff is a CI gate, not a hard fail.
- **Commit**: `feat(bootstrap): phase E.4 — OpenAPI spec + Scalar docs UI`.

### 3.5 Supabase types regen hook (`supabase-types-setup.md`)

- `scripts/gen-supabase-types.ts` — invokes the Supabase CLI (or MCP if running locally) to regenerate `lib/types/supabase.ts`. Add `bun run types:gen` script.
- Husky `pre-commit`: if any file under `supabase/migrations/` is staged, run `bun run types:gen` and stage the result.
- **Commit**: `feat(bootstrap): phase E.5 — supabase types regeneration hook`.

---

## 4. Open technical backlog (parking lot — not phase-blocking)

| Item | Origin | Trigger | Owner |
|---|---|---|---|
| SECURITY DEFINER RPC `bunkai_bootstrap_workspace` | Phase C chicken-and-egg | Phase D Step 4 | Phase D |
| Move RLS helpers to `bunkai_internal` schema | Phase C advisor WARN 0029 | Optional cleanup in Phase E | Phase E (low priority) |
| `ALTER PUBLICATION supabase_realtime ADD TABLE atcs, atc_steps, atc_assertions` | Architecture-specs §4.1 (Realtime row-change broadcast) | Phase D step 6 (when ATC save lands) | Phase D |
| Index advisor pass (`mcp__claude_ai_Supabase__get_advisors --type performance`) post-seed | Architecture-specs NFR §1 | After first real seed data lands (Phase D + a few real rows) | Phase D verification |
| Magic-link SMTP custom provider docs | NFR magic-link rate limits (Supabase free tier ≈ 4/h) | Document in `.env.example` once a user hits the limit | Phase D verification |
| Soft-delete columns (`deleted_at`) on user-facing entities | SRS audit-light §5 | Sprint feature, not bootstrap | EPIC-BK-1 |
| `workspace_invites` table | ERD §2 (deferred from Slice 1) | Sprint feature | EPIC-BK-1 |
| `activity_log` write paths | ERD §2 + architecture-specs §4.1 | Sprint feature | EPIC-BK-1 |

---

## 5. Risks (updated with what actually materialised)

| Risk | Phase | Mitigation | Materialised? |
|---|---|---|---|
| RLS blocks legitimate queries in Phase D | C | Smoke SQL tests per table during C, before D | **Yes (mitigated)** — 42P17 infinite recursion on workspace_members fixed via `0005_rls_helpers.sql`. Smoke passed: anonymous user with no membership sees 0 rows in every workspace-scoped table. |
| Monaco SSR clash with Next 15 RSC | B | `dynamic(() => import('@monaco-editor/react'), { ssr: false })` | **No** — pattern worked on first try. |
| Phase B type stubs diverge from real schema | B → D | Stub keys copied literally from ERD §2; review diff before D | **Tracked** — `lib/types.ts` (Phase B) vs. `lib/types/supabase.ts` (Phase C generated). Phase D should switch consumers to the generated types and let `lib/types.ts` deprecate. |
| DESIGN.md tokens drift from Tailwind config | A | `/design-tokens` page compares swatches with mockups | **No** — `/design-tokens` page in place. |
| `workspace_id` omitted in queries → silent leak | C + D | Mandatory `withWorkspace(supabase, workspaceId).from(...)` helper | **Pending** — helper is a Phase D step (§2.1 #7). |
| Migrations only in Supabase MCP, not in `supabase/migrations/` → self-hosted Phase 2 breaks | C | `.sql` files in `supabase/migrations/` BEFORE `apply_migration` | **Mitigated** — 5 files committed in `b947efd`. |
| Magic-link emails throttled by Supabase free tier | C / D | Document in `.env.example` + provide SMTP fallback config | **Open** — covered in §4 backlog. |
| `to_tsvector` in GENERATED column not IMMUTABLE | C | Switch to trigger-populated column | **Yes (resolved)** — `bunkai_atcs_refresh_tsv()` trigger added in `0004`. |
| Forward-reference in RLS policies | C | Order: tables → enable RLS → policies | **Yes (resolved)** — `0001` reordered after first apply failed with 42P01. |
| REVOKE EXECUTE from `authenticated` breaks RLS policies | C | RLS evaluates SECURITY DEFINER funcs as caller; keep EXECUTE on authenticated, revoke from anon + public | **Yes (resolved)** — documented in `0005_rls_helpers.sql` body. |
| First-workspace chicken-and-egg (insert policy lets caller declare ownership; update/delete require existing member row) | C → D | SECURITY DEFINER `bunkai_bootstrap_workspace` RPC | **Pending** — Phase D step 4. |

---

## 6. Verification gates (every phase)

After every commit:
- `bun run typecheck` exit 0
- `bun run lint:check` clean
- `bun run vars:check` 0 errors
- `bun run skills:check` 0 errors
- `bun run format:check` clean
- Dev server already on `:3000` — do not restart; the user manages it. Smoke pages manually in browser.
- `bun run build` **only when explicitly requested** — building can conflict with the live dev server.

Phase-specific gates:
- **D**: end-to-end magic-link signup + tree + editor save documented in §2.1 step 9.
- **E**: `curl http://localhost:3000/api/v1/health` → 200 JSON · `curl http://localhost:3000/api/docs` → Scalar UI · `curl -H "Authorization: Bearer ${TOKEN}" http://localhost:3000/api/v1/atcs` → 200.

---

## 7. Hand-off after Phase E

Bootstrap is **done** when Phase E.5 lands. Hand-off chain:
1. `mem_session_summary` covering Phase D + Phase E outputs.
2. `/sync-ai-memory` — refresh README, CLAUDE.md, CONTEXT.md, docs against the now-real backend.
3. `/business-data-map` + `/business-feature-map` + `/business-api-map` regen — actual schema can now be mapped, not just spec-derived.
4. `/master-implementation-plan` regen — Wave 0 is complete, Waves 1–7 become the active roadmap.
5. `/product-management` already produced the Wave 1+2 seed (EPIC-BK-1 / 7 / 12 / 13 in `.context/PBI/epics/`). Wave 3+ stories are next.
6. First `/sprint-development` slice = **EPIC-BK-13 (ATC library)** — covers the signature feature plus the moat.

---

## 8. Commit log (cumulative)

Order is newest-last. Push checkpoint = the user has confirmed.

```
fb87bda  chore(config): wire bunkai Supabase project ref into db_mcp
430916d  feat(bootstrap): phase A — Next.js 15 scaffold + DESIGN.md tokens
6821005  feat(bootstrap): phase B — 3 demo pages with mock data
4edd255  docs(pbi): seed Wave 1 backlog — EPIC-BK-1 + EPIC-BK-7
6d6350d  fix(jira-sync): preserve snake_case + sync BK Wave 1 with architect comments
b947efd  feat(bootstrap): phase C — supabase backend slice 1 + auth scaffolding
db962a6  docs(pbi): seed Wave 2 backlog — EPIC-BK-12 + EPIC-BK-13 (BK-14..BK-23)
```

Pending: push to `origin/main` (requires explicit user confirmation per Critical Rule #4).

---

## 9. How to regenerate this file

This file is a living plan. Update it when:
- A phase commits — flip the row in §1.
- The original plan drifts — log the drift in §1.1.
- A new risk materialises — add it to §5 with phase + mitigation + outcome.
- The reference map gains a file — add it to §0.

Do **not** rewrite from scratch. Edit in place; preserve the commit log.
