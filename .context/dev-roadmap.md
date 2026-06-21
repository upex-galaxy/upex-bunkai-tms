# Dev Roadmap — Bunkai TMS (ticket-level dependency plan)

> **What this is**: the single source of truth for the **execution order of the dev backlog, driven by dependencies** — at Jira-ticket granularity (BK-NN), across every epic.
> **Last sync**: 2026-06-20
> **Maintained by**: hand-authored synthesis. Live story status is **never frozen here** — it is queried on demand (see §6). See §7.

---

## 1. How to read this — authority split

> **TL;DR for the AI/human reading this — what this doc is, in one breath:**
> This doc answers **one question only: "which Jira ticket do we work next, and what is blocking it?"** It is NOT the strategy plan and it does NOT store live status.
> - Want **"why are we building epics in this order?"** → that is `master-implementation-plan.md` (strategy / epic altitude). Not here.
> - Want **"what ticket is next + what unblocks what?"** → **you are in the right doc** (§3 graph, §4 execution sprints, §5 mockup-gates). This is the part nothing else holds.
> - Want **"is BK-28 done yet / what's its current status?"** → **do not read it off this page.** Status changes daily and is never written here. Query it live with the recipe in **§6**.
>
> One-line rule: **§2–§5 are durable truth you can trust; live status is always a query, never a paste.**

This doc sits in a 3-layer roadmap stack. Each layer owns a different altitude:

```
.context/master-implementation-plan.md   EPIC / strategy   "what to build & why that order"   (derived from business-maps)
.context/dev-roadmap.md  ◄── THIS DOC     TICKET / sequence "what unblocks what, in what execution sprint"  (derived from Jira links + local design)
.context/PBI/.../implementation-plan.md   STORY / files     "how to build one ticket"           (derived by /sprint-development)
```

**Authority split — who is the source of truth for what:**

| Fact | Source of truth | Why |
|------|-----------------|-----|
| **Dependency edges** (A blocks B), execution sprints, mockup-gates | **THIS doc (local)** | Local design context (master-design-plan §8, schema topology, readiness audits) holds the *full* structure; Jira issue-links are sparse/partial. |
| Story **status** + **points** | **Jira** (snapshot in §6, dated) | Jira is live; §6 is a frozen photo — re-sync before trusting it. |
| Epic→story membership | Jira (`epic-tree.md` mirror) | Sync-owned. |
| Per-story file plan | `/sprint-development` | Out of scope here. |

Legend (used in §3–§6):
- `A ──> B` = A must be **dev-done** before B can start (hard gate).
- `A ··> B` = soft gate: B is buildable without A but low-value / partial until A lands.
- 🔒 mockup-gated = cannot start until the named mockup exists (Critical Rule #15 fidelity).
- ✅ dev-done · 🟢 ready · 🟡 gated · ⚪ backlog/estimation · 🧪 in QA/test.

---

## 2. Epic backbone — the schema-forced spine

Order below is **forced by entity topology** (`business-data-map.md §2`), not preference: no entity ships before the entities + RLS it depends on. This is the epic-level skeleton; §3 is the ticket-level detail hanging off it.

```
BK-1  Tenancy & Identity ──┬──> BK-7  Project & Module Hierarchy ──┬──> BK-12 User Stories & AC ──┐
   (workspace_id + RLS)    │        (project → module tree)        │                              ├──> BK-13 ATC Library
                           │                                       └──> BK-13 ATC Library ◄────────┘     (the differentiator)
                           │                                                  │
                           │                                                  └──> BK-24 Tests (chains of ATCs)
                           │                                                            │
                           │                                                            └──> BK-30 Manual Execution & Runs
                           │                                                                       │
                           │                                                                       └──> BK-31 Bugs & Defect Heatmap
                           │
                           ├──> BK-85 Account & Settings   (parallel once BK-1 done)
                           └──> BK-29 QA Credentials        (parallel, /qa page)

   BK-44 Coverage & Traceability ── reads ALL of the above (US→AC→ATC→Test→Run→Bug chain); last MVP epic.
```

| Epic | Title | Depends on | Phase |
|------|-------|-----------|-------|
| BK-1 | Tenancy & Identity (RLS) | — (foundation) | MVP S1 |
| BK-7 | Project & Module Hierarchy | BK-1 | MVP S2 |
| BK-12 | User Stories & AC | BK-7 | MVP S2/3 |
| BK-13 | ATC Library | BK-7 (+BK-12 for AC anchor) | MVP S3 |
| BK-24 | Tests (chains of ATCs) | BK-13 | MVP S4 |
| BK-30 | Manual Execution & Runs | BK-24 | MVP S4 |
| BK-31 | Bugs & Defect Heatmap | BK-30 | MVP S5 |
| BK-85 | Account & Settings | BK-1 | MVP (parallel) |
| BK-29 | QA Credentials (`/qa`) | BK-1 | MVP (parallel) |
| BK-44 | Coverage & Traceability | BK-13/24/30/31 | MVP S6/7 |

> Phase-2 / Phase-3 epics (self-hosted bundle, agentic protocol, CI adapters, 3D mind-map, SSO, marketplace) are **strategy-layer only** — see `master-implementation-plan.md §2`. Not ticket-broken yet; out of this doc until they enter a sprint.

---

## 3. Story dependency graph — the core

The active frontier (Sprint-2 dev). This is the part Jira cannot express as a roadmap; it is the reason this doc exists.

```
                              ┌──────────────────────────────────────────────┐
   BK-27 Test Builder ✅ ─────┤ (dev-done — gate RELEASED, unblocks 7)        │
   (chain ATCs, 8 SP)         └──┬───────────────────────────────────────────┘
                                 ├──> BK-28 Test Reorder        (5)
                                 ├──> BK-33 Test Tags           (8)
                                 ├──> BK-22 ATC Usage report    (3)
                                 ├──> BK-23 ATC Duplicate       (5)
                                 ├──> BK-32 Test view expanded  (1)
                                 ├··> BK-21 ATC Propagation     (5)   (also needs its 10 contract Qs)
                                 └──> BK-34 Start manual run    (8) ──┬──> BK-35 Mark step pass/fail (1*)
                                          (opens Runs tail)           ├──> BK-36 Abort run          (1)
                                                                      ├──> BK-37 Run history        (1) 🔒 Test Runs mockup
                                                                      ├──> BK-38 Filter proj runs   (1) 🔒 Test Runs mockup
                                                                      └──> BK-39 Finish run verdict (1)

   INDEPENDENT (no BK-27 gate — parallel-safe):
     BK-20 ATC Search (5) 🟢      BK-3 OAuth (8) 🟢*sync-AC      BK-19 ATC Builder 🧪   BK-18 ATC API 🧪

   SETTINGS CLUSTER (epic BK-85):
     BK-86 Account/sign-out (3) ──> BK-87 Settings hub (2) ──┬──> BK-88 Manage PATs (5) 🔒
                                                             └──> BK-89 View workspaces (2) ──> BK-90 Leave workspace (5) 🔒
                                    └─ BK-87+ all 🔒 Settings mockup (§4.10 spec exists, wireframe ❌)
```

### Flat edge list (the durable contract — validate against Jira §7)

| Blocker (must be dev-done) | Unblocks | Type | Reason |
|----------------------------|----------|------|--------|
| BK-27 Test Builder | BK-28, BK-33, BK-32 | hard | reorder/tags/view all operate on a Test's `test_steps`, created by BK-27 |
| BK-27 | BK-22 | hard | "Used in N tests" count reads `test_steps` rows |
| BK-27 | BK-23 | hard | duplicating an ATC must account for its test memberships |
| BK-27 | BK-21 | soft | propagation cascades edits *to tests*; pointless before tests exist |
| BK-27 | BK-34 | hard | a run executes a Test; no Test → no run |
| BK-34 Start manual run | BK-35, BK-36, BK-37, BK-38, BK-39 | hard | all operate on a `run` / `run_atc` / `run_step` row created by BK-34 |
| BK-34 Start manual run | BK-148 Project Environments | hard | env CRUD operates on the `project_environments` table + `runs.environment_id` FK created by BK-34 — **Relates BK-34 (gate satisfied: BK-34 merged to staging)** |
| BK-86 Account | BK-87 Settings hub | hard | BK-87 owns the topbar entry point BK-86 renders into |
| BK-87 Settings hub | BK-88 PATs, BK-89 Workspaces | hard | both are Settings sub-views; need the hub shell |
| BK-89 View workspaces | BK-90 Leave workspace | hard | leave action lives in the workspaces list + needs its active-workspace contract |

**No incoming edge (start anytime, gated only by their own readiness):** BK-20, BK-3, BK-86.

---

## 4. Execution sprints

An **Execution Sprint (ES)** is a gate-released batch: a set of stories safely workable in parallel once the prior ES's gates are dev-done. ES are dependency-driven batches, **not** calendar sprints and **not** the strategy-layer Master Sprints in `master-implementation-plan.md`.

> This table is **regenerated from the live dependency graph each run** — it is a derived projection of §3 + current gate state, not a hand-frozen plan. Status words below ("shipped", "done this cycle") describe gate-release events, not live Jira status (query that via §6).

| Exec Sprint | Stories | Gate released by | Notes |
|-------------|---------|------------------|-------|
| **ES0 ✅** | BK-27 | — | Shipped → Ready For QA (QA Approved). Released the whole ES1 fan-out. |
| **ES1 (mostly shipped)** | ✅ shipped this cycle: BK-28, BK-22, BK-23, BK-32, BK-20 (all Ready For QA). **Active remainder: BK-33** + parallels **BK-3, BK-86** | BK-27 ✅ | ES1 fan-out is nearly drained: reorder/usage/duplicate/view + ATC Search all landed. Only **BK-33 Test Tags** left on the BK-27 gate; BK-3 (OAuth, needs AC-field sync) + BK-86 (Account) run parallel. |
| **ES1.5** | BK-87 (after BK-86) ; BK-21 (after its 10 Qs) | BK-86 ; BK-27 | BK-87 spec-only OK if Rule-15 §4.10 ratified, else 🔒 Settings mockup. |
| **ES2 (live frontier)** | BK-34 Start manual run | BK-27 ✅ | **Now the highest-leverage pick** — opens the Runs tail (BK-35/36/37/38/39, 5 stories). 7 PO/Design/Dev Qs answerable during build. |
| **ES2.5** | BK-88, BK-89 (after BK-87) | BK-87 | 🔒 Settings mockup. BK-88 has 9 planning-blocker Qs; BK-89 has 2 API-contract BLOCKERS + is Shift-Left QA. |
| **ES3** | BK-35, BK-36, BK-37, BK-38, BK-39 ; BK-90 (after BK-89) | BK-34 ; BK-89 | BK-35 re-estimate (1 vs ≥5). BK-37/38 🔒 Test Runs mockup. |
| **ES4+** | epic BK-31 (Bugs), BK-44 (Coverage) | BK-30 complete | 🔒 Bug Reports + Metrics mockups. Beyond current frontier. |

---

## 5. Mockup-gate registry (Critical Rule #15)

A story whose primary screen has no mockup **cannot start** until the mockup lands (or a spec-only departure is ratified in master-design-plan §5 + ADR).

| Mockup needed | Screen ref | Blocks | Status |
|---------------|-----------|--------|--------|
| 🔴 **Settings** (Account · PATs · Workspaces) | §4.10 (spec only, wireframe ❌) | BK-87, BK-88, BK-89, BK-90 | **author now** — only BK-86 in the cluster escapes it |
| 🟡 **Test Runs index** | ⚠️ wireframe pending | BK-37, BK-38 | needed post-BK-34 |
| 🟢 **Metrics** | §4.7 (no mockup) | epic BK-44 | far from frontier |
| 🟢 **Bug Reports** | §4.6 (no mockup) | epic BK-31 | far from frontier |

> Mockups with screens already drawn (`login.jsx`, `app.jsx`, `project.jsx`, `editor.jsx`, `run.jsx`, `home.jsx`) cover every ES1/ES2 story — no mockup blocks the immediate frontier **except Settings**.

---

## 6. Live status — query it, never freeze it

> **Why there is no status table here.** Story status (`Ready For Dev`, `In Progress`, `QA Approved`, …) and story points live in **Jira**, which changes every day. Any table pasted here goes stale within days and then actively *lies* to whoever reads it. So this section is a **recipe, not a photo**: run one of the two queries below to get *today's* truth. The durable structure — which ticket unblocks which (§3), execution sprints (§4), mockup-gates (§5) — is safe to trust as written; only status is volatile.

**Recipe A — refresh the local PBI cache** (writes files under `.context/PBI/`, good for offline reading):

```bash
bun run jira:sync-issues        # READ package.json for the exact script before running
# then read .context/PBI/epic-tree.md  — the epic→story index with status per story
```

**Recipe B — one-shot live query** (Atlassian MCP, nothing written to disk):

```
project = BK AND sprint in openSprints() AND issuetype = Story ORDER BY rank ASC
```

Useful fields: `summary, status, assignee, customfield_10016` (story points). Then cross-reference each `BK-NN` against the §3 graph + §4 execution sprints to see what is *actually* workable now.

**To answer "what is next to work?"** — run Recipe B, then pick the highest-ranked story where ALL of these hold:
1. its §3 blocker is already dev-done (`QA Approved` / `In Test` / merged), AND
2. its §5 mockup-gate (if any) is cleared, AND
3. its pre-dev blockers below (if any) are resolved.

### Per-story pre-dev blockers — LOCAL knowledge (NOT a Jira field; will NOT appear in a §6 query)

These are gating questions / contract decisions captured during shift-left refinement. A story can read `Ready For Dev` in Jira while still blocked by one of these. Clear before starting dev:

| Story | Pre-dev blocker (resolve first) |
|-------|----------------------------------|
| BK-3  | Sync AC field to the 10 refined ACs (/onboarding vs /projects redirects, drop "201"). |
| BK-22 / BK-86 / BK-90 | Human-ratify the AI role-played PO answers. |
| BK-23 | Answer 8 contract Qs (role gate, title overflow, API mismatch). |
| BK-88 | Answer 4 PO + 5 dev Qs (ATP marks them planning blockers). |
| BK-89 | Decide API contract (role per workspace in `GET /workspaces` + active-workspace contract). |
| BK-21 | Answer 10 propagation Qs + fix OpenAPI drift on `PATCH /atcs/{id}`. |
| BK-35 | Re-estimate (1 vs ≥5) + post the announced ATP content to Jira. |
| Design §8 | ~~Add screen rows for BK-35 / 36 / 37 / 39.~~ **Resolved (2026-06-20)** — master-design-plan §8 already has screen rows for BK-35/36/37/38/39 (lines ~276–280). No action. |

### Edge-mapping TODO — stories seen on the board but not yet in the §3 graph

- **BK-98** "TMS-Projects | Tree / Table / Mind-map views in a hardened explorer" — lands the `EPIC-BK-008` "Views" surface as a story under BK-7; resolves part of the §2.1 ⚠️ "Views folded into BK-7" note in `master-implementation-plan.md`. Add a §3 edge if it gains downstream dependents.
- **BK-101** "🚀 TMS-Workspace | View the workspaces I belong to" — **Resolved (2026-06-20)**: BK-101 was a **duplicate** of BK-89 and has been **deleted from Jira** (user-confirmed). **BK-89 stands as the real story** — it keeps its ES2.5 edge, is not superseded. No further action.

---

## 7. Maintenance protocol

- **Dependency edges (§2–§5)**: hand-maintained here. When a new story is refined, add its edge BEFORE it goes Ready For Dev.
- **Live status (§6)**: **never hand-maintained.** §6 is a query recipe, not a table. Do NOT paste status snapshots here — they rot in days. If someone needs status, they run Recipe A or B. The only hand-edited parts of §6 are the *local-only* lists (pre-dev blockers, edge-mapping TODO), which hold knowledge Jira does not store.
- **Cross-check against Jira issue-links** (validation, not authority): periodically diff §3 edge list vs Jira "blocks/is-blocked-by" links. **Local wins on structure** — Jira links are sparser and have no execution-sprint/mockup concept. Flag any Jira edge missing here, and any here missing in Jira (candidate to push up to Jira for traceability).
- **Relation to `/master-implementation-plan`** (decided 2026-06-19, do not re-litigate): that skill regenerates the epic-strategy layer (`master-implementation-plan.md`) from business-maps. It does NOT own this doc, and the two are **intentionally kept separate** — they consume different inputs (strategy ← business-maps; this doc ← Jira issue-links + local design context like mockup status), so one generator cannot produce both. Do not merge them. The two docs answer different questions: `master-implementation-plan.md` = "why this epic order" (strategy); this doc = "what ticket next + what unblocks it" (sequence).
- **Trigger to update**: a gate releases (story → dev-done), a new story enters refinement, a mockup lands (clears a 🔒), or a sprint closes.
