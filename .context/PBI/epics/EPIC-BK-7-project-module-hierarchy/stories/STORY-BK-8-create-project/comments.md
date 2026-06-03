# Comments for BK-8

[View in Jira](https://jira.upexgalaxy.com/browse/BK-8)

---

### Ely - 5/19/2026, 9:05:46 PM

🧱 ****Architect Annotation****

**Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.**

1. 

- Modal: `<CreateProjectDialog />` triggered from Workspace Home empty-state CTA.

1. 

- Route: `app/api/v1/workspaces/[id]/projects/route.ts` (POST).
- Validation: zod schema.

1. 

- Tables: `projects`.
- Index: `UNIQUE (workspace_id, slug)`.

1. 

- [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) (workspace create) — need a workspace first.

1. 

- [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) (modules need a project).

1. 

- [ ] All 4 AC scenarios pass on staging.
- [ ] Per-workspace slug uniqueness verified at DB level.
- [ ] Reserved-slug list applied (`api`, `app`, etc.).
- [ ] E2E test: sign-in → create workspace → create project → land in project home.

---

### Andrés Daniel Cumare Morales - 5/28/2026, 6:22:18 AM

## === Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) — 2026-05-28 ===

***Risk Level:*** HIGH (9/10) — root blocker for Epic [https://jira.upexgalaxy.com/browse/BK-7#icft=BK-7](https://jira.upexgalaxy.com/browse/BK-7#icft=BK-7) hierarchy chain

---

### Implementation State (code-verified, pre-implementation)

| ***Component**** | ****Status*** |
| --- | --- |
| `POST /api/v1/workspaces/[id]/projects` | NOT EXISTS (confirmed: no route in app/api/v1/) |
| `projects` DB table + RLS | READY (migration 0002) |
| `UNIQUE (workspace_id, slug)` | READY (DB constraint) |
| UI "Create Project" form | NOT EXISTS (projects/page.tsx: "Phase E") |

---

### Refined ACs

***AC-1 (refined):*** Given active member (role>=member) in Workspace W / When POST /api/v1/workspaces/{W.uuid}/projects { name: "Checkout v2" } / Then HTTP 201 + { project_id, slug: "checkout-v2" }

***AC-2 (refined):*** Given workspace member / When POST { name: "AB" } (2 chars) / Then HTTP 400, error code NAME*TOO*SHORT

> ***NEEDS PO/DEV CONFIRMATION:**** Story writes `NAME**TOO*SHORT` — codebase convention is `NAME*TOO*SHORT` (underscore). Which is canonical?

***AC-3 (refined):*** Given W already has slug "checkout-v2" / When POST { name: "Checkout V2" } same workspace / Then HTTP 409, SLUG*DUPLICATE*IN_WORKSPACE

> ***NEEDS PO/DEV CONFIRMATION:*** Does slug auto-suffix (-2, -3) with 201 instead of 409?

***AC-4 (refined):*** Given user NOT member of Workspace X / When POST /api/v1/workspaces/{X.uuid}/projects / Then HTTP 403, NOT*A*MEMBER

> ***NEEDS PO/DEV CONFIRMATION:*** Enforced at API middleware or Supabase RLS? RLS alone won't return a typed error body.

***AC-5 (new — NEEDS PO/DEV CONFIRMATION):*** Given viewer role in W / When POST valid body / Then HTTP 403

**(Business Rule says role >= member — viewer is excluded but no AC covers it)**

***AC-6 (new — NEEDS PO/DEV CONFIRMATION):*** Given member / When POST { name: "---" } (no alphanumeric) / Then HTTP 400

**(Business Rule: name MUST contain >=1 alphanumeric char — no AC exists)**

***AC-7 (new — NEEDS PO/DEV CONFIRMATION):*** Given member / When POST name=81 chars / Then HTTP 400

**(Scope says 3-80 chars — upper bound untested)**

***AC-8 (new — NEEDS PO/DEV CONFIRMATION):*** Given member / When POST description=5121 chars / Then HTTP 400

**(Business Rule: <=5KB — no AC)**

***AC-9 (new — NEEDS PO/DEV CONFIRMATION):*** Given any user / When POST to non-existent workspace UUID / Then HTTP 404 or 403

**(404 leaks existence; 403 is enumeration-safe — which is preferred?)**

***AC-10 (new):*** Given workspace B / When POST { name: "Checkout v2" } / Then HTTP 201

**(Same slug is valid across different workspaces — per-workspace scope)**

***AC-11 (new — NEEDS PO/DEV CONFIRMATION):*** Given member / When POST { name: "api" } (reserved slug) / Then HTTP 400

**(From arch comment: "Reserved-slug list applied (api, app, etc.)" — list not defined in story)**

---

### Open Questions for PO / Dev

| ***#**** | ****Question**** | ****Priority*** |
| --- | --- | --- |
| Q1 | Error code separator: `*` or `**`? (NAME*TOO*SHORT vs NAME*TOO_SHORT) | ****BLOCKER*** |
| Q2 | Path param UUID or slug? | ***RESOLVED*** — UUID (confirmed by arch annotation: `[id]`) |
| Q3 | Auth: cookie session or PAT bearer? If PAT, which scope? | ***BLOCKER*** |
| Q4 | Slug collision: 409 immediate or auto-suffix (-2, -3) + 201? | HIGH |
| Q5 | Unknown workspace: 404 (leaks existence) or 403 (safe)? | MEDIUM |
| Q6 | UI form in [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) scope or separate Phase E story? | MEDIUM |
| Q7 | Max slug length explicitly defined? (DNS = 63 chars) | MEDIUM |
| Q8 | Complete list of reserved slugs? | HIGH |

---

### ATP DRAFT — Test Outline Summary (15 outlines)

T01–T04: Positive + name validation (min/max/alphanumeric) [P1]

T05–T06: Slug uniqueness within/across workspaces [P1]

T07–T09: Auth/role/reserved-slug gates [P1]

T10–T13: Description + slug derivation boundary [P2]

T14: DB integrity post-201 [P1]

T15: Unauthenticated → 401 [P1]

---

**Posted by /shift-left-testing — 2026-05-28**

**Local artifact: .context/PBI/epics/EPIC-BK-7-project-module-hierarchy/stories/STORY-BK-8-create-a-project-inside-a-workspace/shift-left-refinement.md**

---

### Andrés Daniel Cumare Morales - 5/28/2026, 6:37:49 AM

## 🎯 PO Response — Shift-Left QA Open Questions

**Role: Product Owner — Bunkai TMS**

**Context read: PRD executive-summary, user-personas, user-journeys, MVP scope, business model**

---

### Q4 — Slug collision: 409 immediate or auto-suffix (-2, -3)?

***Decision: 409 immediate. No auto-suffix.***

Rationale: The workspace creation flow already sets this precedent — when a workspace slug collides, the onboarding form shows a toast error "Slug taken — try another" and the user chooses a different name. Project slugs are part of the permanent URL (`/projects/{slug`}) and are shared between teammates. An auto-generated `checkout-v2-2` slug would be confusing and hard to communicate. QA engineers and PMs share these URLs in Slack and Jira — slug quality matters.

***AC update:*** AC-3 stays as-is (409 + SLUG*DUPLICATE*IN_WORKSPACE). No auto-suffix logic needed.

---

### Q6 — UI form in [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) scope or separate Phase E story?

***Decision: UI form is IN SCOPE for BK-8.***

The Workflow section of this story (steps 1–9) already describes the full UI flow:

- Step 1: "Workspace member navigates to Workspace Home, clicks Create Project"
- Step 2: "UI shows name input + optional description textarea + slug preview"
- Steps 3–9: submission → API → navigation to new project

The placeholder text in `projects/page.tsx` ("Project creation UI ships in Phase E") is a code comment that will be removed when this story ships — it was written before [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) was refined.

The architect annotation confirms the component: `<CreateProjectDialog />` as a modal triggered from the empty-state CTA.

***Scope confirmation:*** [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) delivers both the API (`POST /api/v1/workspaces/[id]/projects`) AND the `<CreateProjectDialog />` modal. T14 (UI form visible), T15 (slug preview), T16 (navigation after 201) are all in sprint scope.

---

### Q5 — Unknown workspace: 404 or 403? (PO angle)

***Recommendation: 403.***

From a product perspective, we do not want to expose workspace enumeration. If a user stumbles on a valid workspace UUID they don't belong to, they should get the same "access denied" response whether the workspace exists or not. 404 teaches bad actors to enumerate valid workspace IDs by trying UUIDs until they stop getting 404s.

Consistent UX: our RLS policies already return empty results (not "not found") for unauthorized workspace data — we follow the same principle at the API layer.

---

**— PO | Bunkai TMS | 2026-05-28**

---

### Andrés Daniel Cumare Morales - 5/28/2026, 6:38:27 AM

## ⚙️ Dev Response — Shift-Left QA Open Questions

**Role: Backend Engineer — Bunkai TMS**

**Context read: business-data-map.md (all flows), migration 0001–0008, existing API routes in app/api/v1/, middleware/bearer.ts, onboarding flow**

---

### Q1 — Error code separator: `_` or `*`?

***Confirmed: underscore `*`. All error codes use snake*case.***

The existing codebase is consistent — every error code uses `_`:

- `otp*exchange*failed` (auth/callback/route.ts)
- `missing_code` (auth/callback/route.ts)
- `rate_limited` (magic-link/route.ts)
- `bad*request`, `internal*error` (lib/api/error-envelope.ts)

The `**` in the story ACs is a Jira markdown artifact — in Jira wiki markup, `**text**` renders as ****bold****. `NAME**TOO*SHORT` in the raw text was intended to be bold-formatted labels, not literal asterisks. The canonical error codes are:

| ***Story AC**** | ****Canonical code*** |
| --- | --- |
| NAME*TOO*SHORT | `NAME*TOO*SHORT` |
| SLUG*DUPLICATE*IN*WORKSPACE | `SLUG*DUPLICATE*IN*WORKSPACE` |
| NOT*A*MEMBER | `NOT*A*MEMBER` |

***QA: update all test assertions to use underscore variants.***

---

### Q2 — Path param: UUID or slug? (confirm)

***Confirmed: workspace UUID.***

Route will be `app/api/v1/workspaces/[id]/projects/route.ts` where `[id]` is the workspace UUID. Using slug would require an extra DB lookup (`workspaces WHERE slug = ?`) before the membership check, adding latency. UUID is already in the client context after workspace bootstrap. The RLS INSERT policy uses `workspace_id` (FK UUID) directly — no translation needed.

---

### Q3 — Auth mechanism: cookie session or PAT bearer?

***Decision: cookie session only for this story. PAT support deferred to Phase F.***

Pattern precedent: every route under `app/api/v1/` that performs mutations on behalf of an authenticated user uses cookie session (`createClient()` from `@lib/supabase/server`), NOT bearer auth:

- `POST /api/v1/tokens` — cookie session
- `DELETE /api/v1/tokens/[id]` — cookie session

PAT bearer is reserved for machine consumers (CI, AI agents, CLI) executing ATCs — those consumers don't create projects interactively. The `requireBearerToken()` middleware exists in `lib/api/middleware/bearer.ts` but no scope currently covers project management.

***Implementation***: use `createClient()` server-side — Supabase handles session validation via `supabase.auth.getUser()`. The RLS INSERT policy on `projects` enforces membership and role, so no extra middleware layer is needed.

***Phase F scope (not BK-8)***: if a `project:write` PAT scope is eventually needed for CLI-based project scaffolding, that's a separate story. Do not add PAT auth to this route now.

---

### Q5 — Unknown workspace UUID: 404 or 403?

***Confirmed: 403 for all unauthorized/nonexistent workspace access.***

Rationale: Bunkai is a multi-tenant system. If we return 404 for nonexistent workspaces, an authenticated user can enumerate valid workspace UUIDs by brute-forcing. Returning 403 uniformly ("you cannot access this resource") leaks nothing about existence.

Implementation: the RLS INSERT policy already enforces this — if the workspace doesn't exist, the membership check returns 0 rows → INSERT is rejected by RLS → Supabase returns a PostgreSQL error that the API layer surfaces as 403. We don't need extra workspace existence checks in the route handler.

---

### Q7 — Max slug length?

***Confirmed: max 40 chars, same as workspace slug.***

Workspace slug format (migration 0006): `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$` → effective max = 40 chars.

Project slugs should be consistent. The auto-derivation algorithm:

1. Lowercase
2. Normalize accents (NFD decompose, strip combining chars)
3. Replace non-alphanumeric chars with `-`
4. Collapse consecutive `-`
5. Strip leading/trailing `-`
6. Truncate to 40 chars
7. Strip trailing `-` again after truncate

If derived slug exceeds 40 chars after truncation, we truncate at a word boundary where possible (last `-` within 40 chars).

---

### Q8 — Complete list of reserved slugs?

***Reserved project slugs (cannot be created by users):***

```
api, new, create, edit, delete, settings, admin, null, undefined,
true, false, me, self, health, docs, openapi, static, public
```

Rationale: these conflict with Next.js route segments under `app/(app)/projects/[projectSlug]/`. Also reserving `api` to avoid confusion with the REST API path, and `null`/`undefined`/`true`/`false` to prevent parsing bugs in clients that JSON-deserialize slugs.

***Implementation***: validate against this list in the Zod schema for the POST body before slug derivation. Return 400 with code `SLUG_RESERVED` if the derived slug matches any reserved word.

***Update AC:*** add AC-11 — {{{ name: "api" }}} → 400 `SLUG_RESERVED`.

---

**— Dev | Bunkai TMS Backend | 2026-05-28**

---

### Andrés Daniel Cumare Morales - 5/28/2026, 6:39:09 AM

## 🎨 Design Response — Shift-Left QA Open Questions

**Role: Product Designer — Bunkai TMS**

**Context read: DESIGN.md (full — brand, tokens, components, principles), mockup screens at .context/designs/bunkai-test-management-tool/, user-journeys, PRD personas**

---

### Q6 — UI form: what does `<CreateProjectDialog />` look like?

***Confirmed: Modal dialog, triggered from the Workspace Home empty-state CTA.***

The component is a modal dialog following the established DESIGN.md vocabulary:

***Container***

- Type: modal overlay with `--shadow-pop` (`0 12px 28px rgba(0,0,0,0.55)`)
- Radius: `--r-4` (10px) — modals use the largest radius token
- Background: `--bg-2` (`#14171c`) — standard surface panel
- Border: `1px solid --stroke-2` (`rgba(255,255,255,0.08)`)
- Width: `440px` (same as the onboarding card — consistent narrow dialog treatment)
- Focus trap: required — keyboard navigation must be contained inside the dialog

***Form layout (top to bottom)***

1. ***Header row***

- Title: "New Project" — 14px Inter semibold, `--fg-0`

- Close button: `icon-only` ghost button, Lucide `X` icon 14px, `--fg-3`

1. ***Name input***

- Label: "Project name" — 10.5px uppercase, `--fg-3`, letter-spacing 0.04em

- Input: `.input` component, `--bg-2` fill, placeholder "e.g. Checkout v2", 12.5px Inter

- Min 3 chars, max 80 chars enforced via HTML `minLength`/`maxLength`

- Error state: `--fail` border + error message below (`--fail` text, 11px)

1. ***Slug preview (read-only)***

- Label: "URL slug" — same label treatment

- Value: monospace (JetBrains Mono, 11px), color `--fg-2`, derivation happens on every keystroke with ≥1 char

- Prefix shown dimmed: `your-workspace /` + `{slug`} in `--fg-0`

- Error state for reserved slugs or duplicate: same fail treatment

1. ***Description textarea*** (optional)

- Label: "Description" + `(optional)` in `--fg-4`

- Textarea: `.textarea` component, 4 rows visible, Markdown note: "Markdown supported"

- Max 5KB enforced with a live character count shown dimmed when > 4000 chars

1. ***Action row***

- Cancel: ghost button, "Cancel"

- Create: primary button (`data-variant="primary"`, vermillion `--accent`), "Create Project"

- Loading state: spinner inside primary button, disabled during request

***Error states***

- `NAME*TOO*SHORT`: inline red text below name input — "Name must be at least 3 characters"
- `SLUG*DUPLICATE*IN_WORKSPACE`: inline red below slug preview — "A project with this name already exists in your workspace"
- `SLUG_RESERVED`: inline red below slug preview — "This name is reserved. Try a different one."
- `NOT*A*MEMBER` / 403: toast error (not inline) — this should never appear in the UI since the dialog is only shown to members, but handle defensively

---

### Q4 — Slug collision UX (Design angle)

***Confirming 409 + inline error (no auto-suffix). Design rationale:***

The slug is displayed in real-time as the user types. The duplicate error appears BEFORE form submission via an async debounced uniqueness check (300ms debounce, `GET /api/v1/workspaces/[id]/projects?slug={slug`} — or a dedicated validation endpoint). This way the user never hits 409 mid-submit — they see the error as they type.

If the uniqueness check API doesn't ship in [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8), fall back to post-submit 409 with inline error. Auto-suffix is a UX anti-pattern here — QA teams treat project slugs as stable identifiers that appear in URLs shared in Slack and bug reports. A `checkout-v2-3` slug erodes trust.

---

### Slug preview derivation (real-time, client-side)

The client-side slug preview uses the same algorithm as the server (for consistency):

```
input → lowercase → NFD normalize (strip accents) → replace [^a-z0-9]+ with - → collapse -- → strip leading/trailing - → truncate 40
```

Shown under the name field as the user types. Font: JetBrains Mono. Color: `--fg-2` (muted, indicates it's derived, not user-editable). If the user wants to customize the slug, a small "Edit" link appears next to the preview that converts the field to an editable `.input.mono` — this is the same pattern as workspace slug editing in the onboarding form.

---

### `data-testid` attributes (QA integration)

Per DESIGN.md §10 (accessibility) and the known gap identified in project discovery, the following `data-testid` values are proposed for [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) components:

| ***Element*** | `data-testid` |
| --- | --- |
| Dialog container | `create-project-dialog` |
| Name input | `project-name-input` |
| Slug preview | `project-slug-preview` |
| Description textarea | `project-description-input` |
| Submit button | `create-project-submit` |
| Cancel button | `create-project-cancel` |
| Inline name error | `project-name-error` |
| Inline slug error | `project-slug-error` |

These follow the `{entity}-{field}-{type`} naming convention established by the project's QA team. All `data-testid` attributes are stripped in production builds via the Babel transform (or left as-is — they have no runtime cost).

---

**— Design | Bunkai TMS | 2026-05-28**

---


_Synced from Jira by sync-jira-issues_
