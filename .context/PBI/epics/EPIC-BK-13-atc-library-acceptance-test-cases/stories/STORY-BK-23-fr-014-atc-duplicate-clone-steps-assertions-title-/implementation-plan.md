# BK-23 — Implementation Plan (Dev)

> **Spec Implementation Plan (Dev)** · Story [BK-23](https://jira.upexgalaxy.com/browse/BK-23) · Epic [BK-13](https://jira.upexgalaxy.com/browse/BK-13) ATC Library
> Goal: duplicate an existing ATC (new id + fresh slug) **with all its ordered steps and assertions**, defaulting the copy's title to `"<source> (copy)"` or a user-provided title, keeping the copy fully independent of the source. Maximize UI fidelity to the mockup WITHOUT backend refactors.

---

## 1. Summary

Duplicate = **deep-copy one ATC** within the same Workspace. The copy inherits `module_id`, `user_story_id`, `layer`, `tags`, the AC anchors, and every step + assertion (in order). It gets `version = 1`, a brand-new auto-generated `slug`, and an independent set of step/assertion rows (no FK link back to the source).

The existing ATC create path (`bunkai_create_atc` RPC, behind `POST /api/v1/atcs`, shipped in BK-18) already does the atomic insert of `atcs` + `atc_steps` + `atc_assertions` + AC bindings and mints a fresh slug. BK-23 reuses that write model — it does **not** introduce a new bespoke write path. The only new pieces are: a thin server-side **duplicate endpoint** that reads the source then calls the same create RPC inside one transaction, and a wired-up **"Duplicate" item in the Explorer context menu** (currently rendered as a `soon` placeholder).

---

## 2. Acceptance Criteria → files map

| AC scenario | Files | Approach |
|---|---|---|
| **AC1** — Duplicate an ATC with all steps + assertions | `supabase/migrations/00XX_atc_duplicate.sql` (new RPC `bunkai_duplicate_atc`), `app/api/v1/atcs/[id]/duplicate/route.ts` (new POST), `app/api/v1/atcs/[id]/duplicate/route.openapi.ts` (new), `lib/supabase/rpc.ts` (`duplicateAtc` wrapper), `components/layout/Sidebar.tsx` (`buildMenu()` ATC branch — wire Duplicate `onClick`) | Server-side deep copy in ONE transaction: read source header + ordered steps + ordered assertions + AC ids, then INSERT a new ATC graph reusing the create insert logic. Steps/assertions copied verbatim with their `position` preserved → ordering guaranteed by `unique(atc_id, position)`. |
| **AC2** — Copy title defaults to `"<source> (copy)"` | `bunkai_duplicate_atc` RPC (title default), `lib/atcs/validation.ts` (`AtcDuplicateBodySchema` — optional `title`) | When no title is supplied, server computes `new_title = source.title || ' (copy)'`. Single space, single suffix (no double-`(copy)` logic in MVP — see Risks). |
| **AC3** — Provide a custom title for the duplicate | `bunkai_duplicate_atc` RPC, `app/api/v1/atcs/[id]/duplicate/route.ts`, context-menu/editor entry point that allows typing a title | Optional `title` in the POST body overrides the default; validated 3–200 chars via the existing `AtcWriteBodySchema` title rule. MVP UI: pass-through (default title), with the typed-title path exercised via API; an inline title prompt is the fidelity stretch (see §4). |
| **AC4** — Editing the copy does not change the original | `bunkai_duplicate_atc` RPC (fresh rows, no FK to source) | Copy is a new `atcs` row + freshly-inserted `atc_steps`/`atc_assertions` rows. No shared rows, no source→copy link. Independence is structural, proven by the integration test in §5. |

---

## 3. Backend shape (decision)

**Decision: add a dedicated `POST /api/v1/atcs/{id}/duplicate` endpoint backed by a new SECURITY DEFINER RPC `bunkai_duplicate_atc(p_actor_user_id, p_source_atc_id, p_title text default null)` that reuses the existing create insert logic.**

Why a dedicated endpoint + RPC over client orchestration (read source → POST create):
- **Atomicity + independence guarantee** — a single server transaction copies header + N steps + M assertions; AC4 (independence) and AC1 (all steps/assertions) cannot half-apply. Client orchestration would do a read then a separate create, racing edits and risking partial copies.
- **Tenant scoping in one place** — the RPC reuses `bunkai_assert_actor_can_write_project` (the same authZ guard `bunkai_create_atc` already calls). Source lookup is workspace-scoped → cross-workspace source = `not_found` (404), viewer role = `forbidden` (403). No project_id/slug ever crosses the wire from the client.
- **Matches the refined spec** — the story's dev comments (comments.md) explicitly call for `POST /atcs/{source_id}/duplicate` with optional `{ title }`, `version = 1`, fresh slug, event `atc.created` (NOT a new `atc.duplicated` event — downstream search index treats it as a normal create, so BK-20's `atc_search` needs zero changes).

**What it reuses (BK-18):**
- The create insert body of `bunkai_create_atc` (`supabase/migrations/0021_atc_create_update.sql:112–243`) — slug computation (`module_slug || '/atc-' || <8 hex>`), the AC-in-US + module-in-subtree validation, the `bunkai_atc_json` composition for the return payload, and the `atc.created` activity-log event. Implementation preference: refactor the shared insert into an internal SQL helper called by both `bunkai_create_atc` and `bunkai_duplicate_atc` (DRY), OR have `bunkai_duplicate_atc` read source fields and delegate. Surgical: prefer delegation if extracting a helper would force editing the proven create RPC.
- API envelope error mapping `lib/atcs/errors.ts` (`mapAtcRpcError`) — 42501→forbidden, P0002→not_found, 23505→slug_collision (retry), 45020/45021→AC/module integrity. No new error codes.
- Validation `lib/atcs/validation.ts` — new `AtcDuplicateBodySchema = z.object({ title: AtcTitle.optional() })` reusing the existing title rule (3–200). No new limits.
- RPC client wrapper pattern in `lib/supabase/rpc.ts` (`createAtc`/`getAtc` 85–132) — add `duplicateAtc(supabase, { sourceAtcId, title? })`.

**Why an RPC, not pure SQL in the route:** the existing app already does all ATC writes through SECURITY DEFINER RPCs with an explicit actor; duplicating that pattern keeps authZ + slug + event emission consistent and avoids re-implementing them in TypeScript.

---

## 4. Screen fidelity (Rule #15)

Per master-design-plan **§8** (BK-23 row, line 270): screens = **ATC Editor · Explorer context menu**, mockup `project.jsx`. Per **§4.3** (line 136), the Explorer context menu is BK-10-done with **Duplicate rendered `soon`** — BK-23 realizes that item.

**What BK-23 realizes:**
- **Explorer context-menu "Duplicate"** — mockup `project.jsx:284` `{ l: 'Duplicate', k: '⌘D', i: null }`. Impl wiring point: `components/layout/Sidebar.tsx` `buildMenu()` ATC branch (816–827), which today shows only Open / Open in new tab / Copy ID. Copy the existing **module** `Duplicate` placeholder pattern (Sidebar.tsx:786 — `{ label: 'Duplicate', icon: Files, shortcut: '⌘D', soon: true }`) but give it a real `onClick`. Thread a new `onDuplicateAtc?` prop through `ContextMenuProps` (713–728) → `SidebarProps` → `project-explorer.tsx` (alongside the other `on*` callbacks ~226–238). On click → call the duplicate endpoint → on 201, navigate to the new ATC's editor route (mirrors `NewAtcEditor` post-create `router.push`).
- **Resulting new ATC** opens in the editor `/projects/[projectSlug]/atcs/[atcId]` — no new editor UI; the copy renders through the existing `page.tsx` read path.

**Tokens / atoms reused (frozen §2):** the context menu already uses `--bg-3`, `--stroke-3`, `--shadow-pop`, `.kbd`, radii 6/3, `--fg-1`/`--fail`/`--accent-hi` (project.jsx:295–331 / Sidebar.tsx existing menu). Duplicate item inherits the existing `MenuEntry` styling — **zero new tokens, zero new component**. The `⌘D` shortcut chip uses the existing `.kbd` atom.

**Fidelity scope decision:** MVP wires Duplicate to create the copy with the **default `(copy)` title** and navigate to it (covers AC1, AC2, AC4 through the UI; AC3 covered via the endpoint's optional `title`). An **inline rename / title prompt** in the context-menu flow is a mockup-faithful stretch — the mockup menu item is a single click with no inline title field, so the default-title one-click flow IS the faithful behavior; a custom title is then set by editing the freshly-opened copy. No §5 divergence needed; no UI invented.

---

## 5. Test plan

Test runner: **`bun run types:check`** (tsc, no build — Rule #14) + **ESLint `bun run lint:check`**. Unit tests follow the existing `lib/atcs/*.test.ts` pattern (e.g. `validation.test.ts`, `sanitize.test.ts`, `builder-guards.test.ts`) — co-located `*.test.ts`, same harness already in the repo.

- **Unit — validation** (`lib/atcs/validation.test.ts` or new `duplicate-validation.test.ts`): `AtcDuplicateBodySchema` accepts empty body (title optional), accepts a valid title, rejects title < 3 and > 200 chars.
- **Unit — title default** (pure helper, if the `(copy)` default is computed app-side or extracted): `"Login happy path"` → `"Login happy path (copy)"`; custom title overrides.
- **RPC / DB-level** (manual SQL via `mcp__supabase__execute_sql` against staging branch, or migration smoke): duplicate an ATC with 3 steps + 2 assertions → new ATC has exactly 3 steps + 2 assertions in the same order; new slug ≠ source slug; `version = 1`; AC bindings copied.
- **Independence (AC4)**: after duplicate, `UPDATE` a step on the copy → re-read source → source steps unchanged.
- **AuthZ**: viewer-role actor → 403; cross-workspace source id → 404.
- **Type-safety**: `bun run types:check` clean (route + RPC wrapper + Sidebar prop thread).
- **Manual smoke (staging)**: right-click an ATC in the Explorer → Duplicate → lands on the new ATC editor titled `… (copy)` with steps/assertions intact; source row still present and unchanged. Curl the endpoint with a custom `title` to exercise AC3.

> E2E / integration automation is out of scope for this skill (Gotcha #10); the independence + count checks above run as unit/RPC-level + manual smoke.

---

## 6. Risks / unknowns

- **Slug uniqueness on copy** — slug is **never cloned**; the RPC auto-mints `module_slug/atc-<8hex>` (0021:192–193) and `unique(project_id, slug)` guards it. A collision raises SQLSTATE 23505 → mapped to `slug_collision`; reuse the create path's retry/regenerate behavior. Low risk (8-hex from a fresh uuid).
- **Copy naming** — MVP appends a single ` (copy)` suffix; duplicating a copy yields `… (copy) (copy)`. The ATP flags "no double suffix" / "no trailing space" (comments.md TC 2.1) and title-overflow when source title ≥197 chars (E8) as **NEEDS PO/DEV CONFIRMATION**. Decision for MVP: plain suffix, rely on the 200-char title cap (a source ≥197 chars + ` (copy)` would exceed 200 → 422). **Open question for PO**: truncate-then-suffix vs reject? Plan assumes reject (422) for now — surfaced for confirmation, not silently chosen.
- **Steps/assertions tables + FKs** — confirmed separate tables `atc_steps` / `atc_assertions`, each FK→`atc_id` (cascade) with `position int` and `unique(atc_id, position)` (0004:179–187, 285–291). Copying source rows verbatim preserves order. `atc_acceptance_criteria` M:N must also be copied (AC anchors / provenance per business-rules).
- **Mandatory AC binding** — `bunkai_create_atc` requires `acceptance_criterion_ids` min 1. A duplicate must carry over the source's AC ids (read from `atc_acceptance_criteria`); a source somehow with 0 ACs would block. Expected non-issue (create already enforces ≥1) but verify in the RPC read.
- **Zero-step source (E7)** — create requires ≥1 step. If a source can exist with 0 steps (it shouldn't, per create validation), duplicate would fail validation. Verify the source-read path; expected non-issue.
- **Editor entry point** — plan wires Duplicate via the **Explorer context menu** (the BK-10 `soon` slot). An additional Editor-topbar Duplicate action is optional/out-of-MVP; the mockup's primary affordance is the context-menu item.
- **`AtcTable` has no row menu** — the right-click menu lives only in `Sidebar.tsx` (the tree explorer), so Duplicate appears in the Tree view's context menu, not as a Table row action. Consistent with the mockup (menu is tree-only).

---

## 7. Technical decisions

- Reuse `bunkai_create_atc` insert logic via a new `bunkai_duplicate_atc` RPC + `POST /api/v1/atcs/{id}/duplicate` rather than client read-then-create — atomicity + single authZ surface. **Not ADR-worthy** (no new architecture; it follows the established RPC-per-write + DEFINER-with-actor pattern and the existing tenancy model). Story-local.
- Event stays `atc.created` (not a new `atc.duplicated`) — downstream search (BK-20 `atc_search`) and activity log need no changes.
- No schema change to existing tables; one additive migration for the new RPC only.

---

## Review Workload Forecast

Estimated: ~180 additions + ~10 deletions = ~190 total lines
(new migration ~70, route + openapi ~50, rpc wrapper + validation ~25, Sidebar/explorer prop thread + onClick ~30, tests ~30; 20% test+docs buffer applied)
400-line budget risk: Low
Chain strategy: stacked-to-main (single feature branch `feature/BK-23-atc-duplicate`)
Decision needed before apply: No

---

_Plan authored Stage 1 (sprint-development). Canonical source = Jira `spec_implementation_plan`; this file is the synced cache._
