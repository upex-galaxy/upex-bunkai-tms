# Comments for BK-14

[View in Jira](https://jira.upexgalaxy.com/browse/BK-14)

---

### Ely - 5/19/2026, 9:54:30 PM

1. 🧱 Architect Annotation

1. 

- ****DB****: new table `user*stories` (id uuid pk, module*id uuid fk -> modules, title varchar(200), description text, external*id text nullable, external*url text nullable, status text default 'draft', created*at, updated*at, deleted*at). Indexes: `(module*id, deleted*at)`, partial unique `(project*id, upper(external*id)) WHERE external*id IS NOT NULL` — project_id derived via module join (materialize as denormalized column to keep unique constraint local).
- ****API surface****: `POST /api/user-stories`, `GET /api/user-stories/:id`, `GET /api/modules/:module*id/user-stories`, `PATCH /api/user-stories/:id`, `DELETE /api/user-stories/:id`. Return shape `{ user*story: UserStory }`. Status codes 200/201/403/404/409/422.
- ****Server validation****: Zod schemas `UserStoryCreateSchema`, `UserStoryUpdateSchema`. Length checks via `.min(3).max(200)` for title, byte-length check for description via `Buffer.byteLength(value, 'utf8') <= 51200`. `external_id` validated against `/^[A-Z]-\d$/` and normalized to uppercase before persist.
- ****RLS****: row-level policy joins `user*stories -> modules -> projects -> workspace*members` to enforce caller membership. PATCH/DELETE require same RLS path.
- ****Client****: form is a server component with a client-side react-hook-form island. PATCH treats `external_id` as immutable when previous value is non-null (server enforces 409; client disables field).
- ****Performance****: list endpoint paginates by `(module*id, created*at desc)` with default page size 50.

1. 

- Upstream: ****BK-7***** "Project & Module Hierarchy" (modules table must exist), *****BK-1..BK-6**** "Tenancy & Identity" (workspace membership + RLS plumbing).
- Downstream: ****BK-15***** "Acceptance Criterion CRUD" depends on `user*stories.id`. *****BK-17***** "Jira import" upserts into this same table via `external*id`. *****BK-16**** "Markdown editor" feeds the `description` field through its sanitizer.
- External: none beyond Supabase Postgres + Next.js route handlers.

1. 

- [ ] Supabase migration applied + verified reversible via `supabase db reset`
- [ ] OpenAPI updated; `bun run api:sync` regenerates client types without diff noise
- [ ] Unit tests cover happy path, RLS rejection, external_id regex, immutability, soft-delete filtering (≥80% branch coverage)
- [ ] Integration test verifies cross-workspace insert is rejected
- [ ] `bun run lint` + `bun run typecheck` pass
- [ ] Manual smoke: create a Story under a Module via the SPA, verify it lists under that Module only
- [ ] PR description cross-references each AC by Gherkin scenario name

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003 / US 3.1
- SRS: `.context/SRS/functional-specs.md` § FR-007
- Business map: `.context/business/business-data-map.md` § user_stories entity
- API contract: `.context/SRS/api-contracts.yaml` § `/api/user-stories`

---

### Ely - 6/4/2026, 11:37:11 PM

## Ready For QA — BK-14 (Manage user stories anchored to a module)

Merged to staging and deployed. Ready for testing on staging.

### Links

- PR: https://github.com/upex-galaxy/upex-bunkai-tms/pull/13 (merged)
- Staging: https://staging-upexbunkai.vercel.app — deploy READY
- Merge commit: 8a19b1f

### What shipped

- Per-module "New User Story" action in the project tree; per-story edit and remove actions on the story rows.
- The story form takes a title, a Markdown description (the BK-16 editor, up to 50 KB, sanitized), and an optional Jira key. The Jira key is locked once set.
- Stories that are removed are archived (hidden from the module's default list, retained).

### As-built contract (observable)

- Create: POST /api/v1/modules/{moduleId}/user-stories. List: GET same path. Single + edit + remove: GET/PATCH/DELETE /api/v1/user-stories/{id}.
- Title required, 3–200. Jira key must read as LETTERS-NUMBER (e.g. BK-42), unique per project (case-insensitive), immutable once set (409). Description Markdown ≤ 50 KB. Removing archives (409 on re-remove).

### Suggested QA focus

- Create a story under a module with title + Markdown description → appears in that module's list; preview renders the Markdown.
- Title "Re" (2 chars) → rejected ("at least 3 characters").
- Link a story to "BK-42"; try linking a second story in the same project to "BK-42" → rejected (already linked). Try "bk-42" (case) → same conflict.
- Malformed key "not a key" → rejected.
- Edit a story whose key is set → the key field is locked.
- Remove a story → it leaves the module's list.

### Notes / known follow-ups

- The Jira key shows as a visible reference but is not yet a clickable hyperlink (no Jira base URL is configured app-side) — follow-up.
- "Re-import updates instead of duplicating" is BK-17 (Jira import); BK-14 stores the key + provides the uniqueness index that enables it.
- The story description is shown via the editor's preview; a dedicated read-only story detail view arrives with later work.

---


_Synced from Jira by sync-jira-issues_
