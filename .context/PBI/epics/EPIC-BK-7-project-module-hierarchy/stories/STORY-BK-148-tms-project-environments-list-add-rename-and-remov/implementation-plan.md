# BK-148 — Implementation Plan (Spec Implementation Plan / Dev)

> **Story:** [BK-148](https://jira.upexgalaxy.com/browse/BK-148) — TMS-Project Environments | List, add, rename and remove environments
> **Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) — Project & Module Hierarchy · **Points:** 1 · **Source spec:** FR-005
> **Realizes:** [ADR-0004](../../../../../ADR/ADR-0004-run-snapshot-and-environments.md) §47 — the deferred environment-management layer.

## 0. Goal & framing

Add per-project **environment CRUD** (list / add / rename / remove) on top of the `project_environments` table that **already exists** (created + seeded by BK-34, migration `0031_runs.sql`). This story does **NOT** create the table. It adds: the missing client **write** path (RPCs + write RLS), three REST routes, and a **live-first management UI** mirroring the existing module-CRUD idiom.

**Binding contract = the BK-148 Acceptance Criteria** (Gherkin). Where the AC and ADR-0004's musings differ, the AC wins:

- **Delete = hard remove, BLOCKED when a run references the env**, with a message stating **how many** runs reference it (AC scenario "Block removal…"). ADR-0004 floated soft "deactivate"; the AC is explicit about hard-remove-when-unused + block-with-count-when-used → build that. The `runs.environment_id … on delete restrict` FK is the DB backstop; we surface a clean pre-counted message, not a raw FK error.
- **Length = 1–50 chars** after trim (AC + business-rules). The table CHECK is the wider `1..60`; the app layer (zod + RPC) enforces the tighter **1–50**. No migration change to the CHECK — 50 ≤ 60, so the app rule is authoritative and the table stays a harmless outer bound.

### PO-pending defaults (stated, per business-rules.md)

| Decision | Default built this story | Source |
|---|---|---|
| Delete guard | **BLOCK** when ≥1 run references the env (non-destructive, preserves run history) | business-rules §Delete guard; FK `ON DELETE RESTRICT` |
| Default-environment marker | **Out of scope** — not built unless PO opts in | business-rules §Default environment |
| Seed names `Staging`/`Production` | Already seeded by BK-34; unchanged | 0031_runs.sql |

## 1. AC → files map

| AC scenario | Files (new = ✚, edit = ✎) | Approach |
|---|---|---|
| **List** environments (stable order) | ✚ `app/api/v1/projects/[id]/environments/route.ts` (GET) · ✎ `app/(app)/projects/[projectSlug]/layout.tsx` · ✚ `app/(app)/projects/[projectSlug]/environments-panel.tsx` | List via the existing SELECT RLS policy (members can already read). Order **`name asc` deterministic** (stable, predictable — AC). UI rows rendered in the explorer rail, data threaded from `layout.tsx` next to `modules`. |
| **Add** with unique name | ✚ migration `0032_project_environments_crud.sql` (`bunkai_create_environment`) · ✚ `app/api/v1/projects/[id]/environments/route.ts` (POST) · ✎ `lib/supabase/rpc.ts` · ✚ `lib/environments/validation.ts` · ✚ `app/(app)/projects/[projectSlug]/create-environment-form.tsx` | RPC inserts after `bunkai_assert_actor_can_write_project` gate; uniqueness via existing `unique(project_id, lower(name))` index → `23505`. UI mirrors `create-module-form.tsx`. |
| **Trim** surrounding whitespace | zod `.trim()` in `lib/environments/validation.ts` + RPC `btrim()` before insert/update | Double-trim (client zod + server `btrim`), consistent with the table CHECK `name = btrim(name)`. |
| **Reject duplicate** (case-insensitive) | RPC catches `unique_violation` → raises `environment_name_taken` (452xx); route maps → `409 conflict` "An environment with this name already exists" | Case-insensitive via the existing `lower(name)` unique index. Exact AC copy. |
| **Reject empty** name | zod `.min(1)` + RPC length guard | Message "Name is required" (client-side, mirrors module form). |
| **Reject >50 chars** | zod `.max(50)` + RPC `char_length 1..50` guard → `environment_name_length` (452xx) → `422` | Message "Name must be 50 characters or fewer". |
| **Rename** existing env | `bunkai_rename_environment` RPC · `app/api/v1/environments/[id]/route.ts` (PATCH) · ✚ `rename-environment-form.tsx` | Update `name`; same uniqueness/trim/length rules. Runs keep referencing the row (rename ≠ new row → AC "runs still reference it" holds by construction — same `id`). |
| **Reject rename collision** | RPC update trips `unique(project_id, lower(name))` → `23505` → `409` | Same mapper branch as add. |
| **Remove unused** env | `bunkai_delete_environment` RPC · `app/api/v1/environments/[id]/route.ts` (DELETE) · ✚ `delete-environment-dialog.tsx` | RPC counts referencing runs; if 0 → hard `DELETE`. UI confirm dialog mirrors `delete-module-dialog.tsx`. |
| **Block remove when referenced** (+count) | `bunkai_delete_environment` pre-counts `runs` for the env; if >0 raises `environment_in_use` (452xx) **with the count in the message**; route → `409`; FK `23503` is the backstop | RPC: `select count(*) from runs where environment_id = …`; if >0 raise with `using errcode='452xx', message=format('… %s run(s) …', n)`. Route also maps `23503 → 409` defensively. UI shows the count message. |

## 2. Backend shape

**Migration `0032_project_environments_crud.sql` (ADDITIVE only — table already exists):**

1. **Write RLS policies** for `project_environments` (today it is SELECT-only / default-deny on writes — ADR-0004). Add INSERT / UPDATE / DELETE policies gated `via projects join → bunkai_can_write_workspace(p.workspace_id)`, mirroring `0002_projects_modules.sql` module policies. (Defense-in-depth; the RPCs are SECURITY DEFINER, but keep the policy consistent with the module precedent.)
2. **Three SECURITY DEFINER RPCs** (`set search_path = ''`, structured like `bunkai_update_module` in `0014` + the runs RPCs in `0031`), each gated by **`bunkai_assert_actor_can_write_project(p_actor_user_id, p_project_id)`** (defined in `0021`, resolves project→workspace, raises `project_not_found`/P0002 + `forbidden`/42501, returns workspace_id):

   | RPC | Params | Behavior |
   |---|---|---|
   | `bunkai_create_environment` | `(p_actor_user_id, p_project_id, p_name)` | gate → `btrim` → length 1–50 guard → insert (unique index enforces case-insensitive uniqueness) → return row jsonb |
   | `bunkai_rename_environment` | `(p_actor_user_id, p_environment_id, p_name)` | resolve project from the env row → gate → `btrim`/length → update name → return row |
   | `bunkai_delete_environment` | `(p_actor_user_id, p_environment_id)` | resolve project → gate → **count runs where `environment_id = p_environment_id`**; if >0 raise `environment_in_use` (count in message); else `delete` → return `{ deleted: true }` |

3. **Custom SQLSTATEs** in the `452xx` block (the runs domain already uses 45200–45203; allocate the next free codes, e.g. `45210 environment_name_length`, `45211 environment_in_use`; uniqueness reuses the native `23505`). Document them in the migration header like `0031` does.

**App layer (mirrors `lib/runs/`):**
- `lib/environments/validation.ts` — zod `EnvironmentNameSchema = z.string().trim().min(1, 'Name is required').max(50, 'Name must be 50 characters or fewer')`; `EnvironmentCreateBodySchema`, `EnvironmentRenameBodySchema`; exported `ENVIRONMENT_NAME_MAX = 50` constant + AC-exact toast/error copy.
- `lib/environments/errors.ts` — `mapEnvironmentRpcError(error): never` switch mirroring `lib/runs/errors.ts`: `42501→forbidden(403)`, `P0002→not_found(404)`, `23505→conflict(409)` ("An environment with this name already exists"), `45210→validation_failed(422)`, `45211/23503→conflict(409)` (environment-in-use, with count), `default→internal_error(500)`.
- `lib/supabase/rpc.ts` — add typed `createEnvironment` / `renameEnvironment` / `deleteEnvironment` wrappers (mirror `createRun`).
- `lib/api/error-envelope.ts` — add `environment_in_use` (and any new code) to `API_ERROR_CODES` + `DEFAULT_STATUS` (409) if a distinct code is preferred over reusing `conflict`.

**Routes (mirror module routes — user-scoped `db.rpc` is simplest; or admin-client + actor param like runs):**
- `app/api/v1/projects/[id]/environments/route.ts` — **GET** (list, `name asc`) + **POST** (create).
- `app/api/v1/environments/[id]/route.ts` — **PATCH** (rename) + **DELETE** (remove).
- Add `route.openapi.ts` siblings to match the existing module-route OpenAPI convention.

**What already exists vs new:**

| Already exists (BK-34 / prior) | New this story |
|---|---|
| `project_environments` table + `unique(project_id, lower(name))` index + seed | 3 write RPCs + write RLS policies (migration `0032`) |
| SELECT RLS policy (members read) | GET/POST/PATCH/DELETE routes |
| `runs.environment_id … on delete restrict` FK | `lib/environments/{validation,errors}.ts` + rpc wrappers |
| Database types for `project_environments` in `lib/types/supabase.ts` | regenerate types so new RPCs type-check (`bun run types:gen`) |

## 3. UI plan (live-first)

**Home: the project explorer rail** — mirror module CRUD exactly. No settings/gear surface exists in the live app; building a `/settings/environments` route would be a net-new navigational pattern (higher divergence + inherits the Settings 🔒 mockup-gate). Instead, surface an **"Environments" group in the explorer rail**, sibling to the module tree, managed by **hand-rolled overlay modals hosted in `project-explorer.tsx`** — byte-identical pattern to modules.

- **Data threading:** `app/(app)/projects/[projectSlug]/layout.tsx` fetches the project's environments server-side (next to `modules`) and passes them into `ProjectShell` → `ProjectExplorer`.
- **List:** `environments-panel.tsx` renders rows (`name asc`) in the rail, each with rename / remove verbs (context-menu or row affordance, matching the module tree idiom).
- **Add:** `create-environment-form.tsx` ← clone `create-module-form.tsx` (controlled `useState`, `<Input className="h-9">`, `<Button>` primary/ghost, client min/max mirror, `fetch` POST → `router.refresh()` → close).
- **Rename:** `rename-environment-form.tsx` ← clone `rename-module-form.tsx`.
- **Remove:** `delete-environment-dialog.tsx` ← clone `delete-module-dialog.tsx`; shows the in-use count + block message when the API returns `409 environment_in_use`.
- **Errors/toasts:** local `friendlyError(body)` mapping `details.reason` → AC-exact inline copy (`text-signal-fail`, `data-testid="environment-*-error"`); `sonner` `toast` for success/warning (Toaster already mounted in `app/layout.tsx`).
- **Reused patterns:** overlay-modal host + global Escape listener (`project-explorer.tsx`), `components/ui/{button,input,label}.tsx`, frozen tokens (`surface-*`, `stroke-*`, `signal-fail`, `accent`, `rounded-*`). **Zero new design-system primitives.** Inline-add (BK-33 `TestTagEditor.tsx`) is the fallback idiom if a lighter in-rail add row is preferred over a modal.
- **Member+ gate:** consistent with module CRUD (write RPC enforces `can_write_workspace`); read visible to all members.
- **Discoverability (golden rule):** the Environments group sits in the always-visible explorer rail under the project — a user manages a project's environments from the same place they manage modules. Reflected immediately wherever a run target is chosen (BK-34's env picker reads the same table).

## 4. Test plan

- **RPC-level (DB) — co-located `lib/environments/*.test.ts` mirroring `lib/runs/*.test.ts`:**
  - create: trims whitespace; rejects empty / >50; rejects case-insensitive duplicate (`Staging` vs `staging`); inserts on unique name.
  - rename: trims; rejects collision with a sibling; same `id` preserved (runs still reference).
  - delete: removes when 0 runs reference; **blocks with count** when ≥1 run references; FK `23503` backstop.
  - **RLS isolation:** a non-member cannot create/rename/delete (403, no disclosure); cross-workspace env not visible/writable.
- **Error mapper (`lib/environments/errors.test.ts`):** each SQLSTATE → expected `ApiError` code + HTTP status (403 / 404 / 409 / 422 / 500).
- **Validation (`lib/environments/validation.test.ts`):** zod trim/min/max + exact messages.
- **Route-level:** POST/PATCH 200/201 happy path; 422 (empty/too-long); 409 (duplicate / in-use); 403 (non-member). GET returns stable `name asc` order.
- **UI:** modals open/close (Escape + backdrop); add/rename/remove call the right endpoint + `router.refresh()`; error copy renders the AC-exact strings; in-use delete shows the count message. `data-testid` per `data-testid-standards`.
- Verification gate: `bun run types:check` + `bun run lint:check` + unit tests (parallel cap=3).

## 5. Risks / unknowns

- **Settings mockup-gate (🔴):** BK-148 has **no §8 US→Screen row** and the Settings screen (§4.10) is unbuilt + 🔴 mockup-gated. **Mitigation (live-first per Rule #15):** land env management on the **project explorer rail** (an existing built surface), NOT the unbuilt Settings screen → this is a **spec-only departure that must be ratified in master-design-plan §5 + a §8 row authored before Stage 2 dev**. Flag to orchestrator: add the §8 row (`BK-148 → Project Explorer rail / env modals`) and a §5 note. No new ADR needed (no architectural reversal; reuses module-CRUD pattern).
- **Roadmap absence:** BK-148 is absent from `dev-roadmap.md` (no ES, no edges, no gate). Hard blocker = **BK-34** (creates the table) — **BK-34 is merged to staging** (commit `ce8e3bb`), so the blocker is satisfied. Orchestrator should add BK-148's edge (`depends_on BK-34`) per Phase 0b's cheap-inline-flip rule.
- **Glossary gap:** no formal "(Project) Environment" glossary entry exists (term only appears inside the Run definition). Per the glossary §5 change protocol, **add a "(Project) Environment" entry in the same PR**. Canonical naming: prose "environment" / "Project environment"; code `project_environments` / `environment_id`.
- **Length CHECK vs AC (1–60 table / 1–50 app):** resolved — app enforces 50, table stays 60. No migration touch to the CHECK; documented so a future reader isn't surprised.
- **Route style choice:** user-scoped `db.rpc` (module precedent) vs admin-client + actor param (runs precedent). Lean module-style (simpler, env-CRUD is plain project-scoped writes) unless the actor-id resolution argues otherwise at impl time.
- **No optimistic-lock precedent for environments:** modules don't version; env-CRUD is low-contention single-field edits → **no `version` column** (simplicity). If concurrent-rename races become a concern later, that's a separate tech-story.
- **Mockup gem → future tech-story:** a dedicated Settings → Environments screen (with per-env config: URLs, secrets, variables, default-env marker) is the eventual home per §4.10 + out-of-scope.md. **Note as a future tech-story** ("Project Settings → Environments screen + per-env config") once the Settings screen is designed; BK-148 deliberately stays UI-minimal on the live rail.

## 6. Technical Decisions

- **TD-1 — Hard delete + block-with-count, not soft-deactivate.** The AC is the binding contract (hard-remove-unused, block-referenced-with-count). FK `ON DELETE RESTRICT` is the backstop; the RPC pre-counts to produce the count message. (Supersedes ADR-0004's exploratory "deactivate" note — no ADR change needed; ADR deferred the *decision* to this story.)
- **TD-2 — App enforces 1–50; table CHECK stays 1–60.** No migration churn on the CHECK.
- **TD-3 — Live-first home = explorer rail, not the unbuilt Settings screen.** Ratify as a §5 spec-only departure + §8 row. Story-local, not ADR-worthy (reuses an established pattern, fully reversible when the Settings screen ships).
- **TD-4 — No `version` optimistic lock for environments.** Matches the module precedent; simplicity.

## Review Workload Forecast

Estimated: ~360 additions + ~10 deletions = ~370 total lines
(1 migration ~110 · 2 routes + openapi ~90 · validation/errors/rpc ~70 · 3 UI forms + panel ~90, all clones of existing files · types regen autogen)
400-line budget risk: **Medium**
Chain strategy: **single feature-branch** (`feature/BK-148-project-environments-crud`) — under budget, one cohesive slice
Decision needed before apply: **No**
