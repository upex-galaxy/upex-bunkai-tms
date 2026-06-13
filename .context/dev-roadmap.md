# Dev Roadmap — Bunkai TMS (ticket-level dependency plan)

> **What this is**: the single source of truth for the **execution order of the dev backlog, driven by dependencies** — at Jira-ticket granularity (BK-NN), across every epic.
> **Last sync**: 2026-06-13
> **Maintained by**: hand-authored synthesis + `jira:sync-issues` snapshots. See §7.

---

## 1. How to read this — authority split

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
| BK-86 Account | BK-87 Settings hub | hard | BK-87 owns the topbar entry point BK-86 renders into |
| BK-87 Settings hub | BK-88 PATs, BK-89 Workspaces | hard | both are Settings sub-views; need the hub shell |
| BK-89 View workspaces | BK-90 Leave workspace | hard | leave action lives in the workspaces list + needs its active-workspace contract |

**No incoming edge (start anytime, gated only by their own readiness):** BK-20, BK-3, BK-86.

---

## 4. Execution sprints

An **Execution Sprint (ES)** is a gate-released batch: a set of stories safely workable in parallel once the prior ES's gates are dev-done. ES are dependency-driven batches, **not** calendar sprints and **not** the strategy-layer Master Sprints in `master-implementation-plan.md`.

| Exec Sprint | Stories | Gate released by | Notes |
|-------------|---------|------------------|-------|
| **ES0 ✅** | BK-27 | — | Done this cycle → Ready For QA. Released the whole ES1 fan-out. |
| **ES1 (now)** | BK-28, BK-33, BK-22, BK-23, BK-32 + parallels BK-20, BK-3, BK-86 | BK-27 ✅ | All Ready For Dev. BK-23 needs 8 contract Qs first; BK-3 needs AC-field sync. |
| **ES1.5** | BK-87 (after BK-86) ; BK-21 (after its 10 Qs) | BK-86 ; BK-27 | BK-87 spec-only OK if Rule-15 §4.10 ratified, else 🔒 Settings mockup. |
| **ES2** | BK-34 | BK-27 ✅ | Opens the Runs tail. 7 PO/Design/Dev Qs answerable during build. |
| **ES2.5** | BK-88, BK-89 (after BK-87) | BK-87 | 🔒 Settings mockup. BK-88 has 9 planning-blocker Qs; BK-89 has 2 API-contract BLOCKERS. |
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

## 6. Status snapshot — VOLATILE (Jira is truth)

> Frozen 2026-06-13. Re-sync with `bun run jira:sync-issues` before relying on it. Dependency edges in §3 are durable; **these status cells are not.**

| Story | Title | SP | Status (snapshot) | Exec Sprint |
|-------|-------|----|-------------------|-------------|
| BK-27 | Test Builder | 8 | 🧪 Ready For QA (dev-done) | ES0 ✅ |
| BK-20 | ATC Search | 5 | 🟢 Ready For Dev | ES1 |
| BK-3 | OAuth sign-in | 8 | 🟢 Ready For Dev *(sync AC field)* | ES1 |
| BK-86 | Account/sign-out | 3 | 🟢 Ready For Dev *(ratify 3 role-plays)* | ES1 |
| BK-28 | Test Reorder | 5 | 🟢 Ready For Dev | ES1 |
| BK-33 | Test Tags | 8 | 🟢 Ready For Dev | ES1 |
| BK-22 | ATC Usage report | 3 | 🟢 Ready For Dev | ES1 |
| BK-23 | ATC Duplicate | 5 | 🟢 Ready For Dev *(8 contract Qs)* | ES1 |
| BK-32 | Test view expanded | 1 | ⚪ Backlog *(gate met, promotable)* | ES1 |
| BK-87 | Settings hub | 2 | 🟢 Ready For Dev *(🔒 mockup or ratify)* | ES1.5 |
| BK-21 | ATC Propagation | 5 | 🟡 Shift-Left QA *(10 Qs + OpenAPI drift)* | ES1.5 |
| BK-34 | Start manual run | 8 | 🟢 Ready For Dev *(7 Qs)* | ES2 |
| BK-88 | Manage PATs | 5 | 🟡 Ready For Dev *(🔒 mockup + 9 Qs)* | ES2.5 |
| BK-89 | View workspaces | 2 | 🟡 Shift-Left QA *(2 contract BLOCKERS)* | ES2.5 |
| BK-35 | Mark step pass/fail | 1* | ⚪ Backlog *(re-estimate)* | ES3 |
| BK-36 | Abort run | 1 | ⚪ Estimation | ES3 |
| BK-37 | Run history | 1 | ⚪ Backlog *(🔒 mockup)* | ES3 |
| BK-38 | Filter project runs | 1 | ⚪ Backlog *(🔒 mockup)* | ES3 |
| BK-39 | Finish run verdict | 1 | ⚪ Backlog | ES3 |
| BK-90 | Leave workspace | 5 | 🟡 Ready For Dev *(🔒 mockup)* | ES3 |
| BK-18 | ATC API | 5 | 🧪 In Test | shipped |
| BK-19 | ATC Builder | 5 | 🧪 Ready For QA | shipped |

> Earlier-shipped / In-Test (epics BK-1/BK-7/BK-12): BK-2/4/5/6/8/9/10/11/14/15/16/17 — out of the active dependency frontier; see Jira for live status.

### Pre-dev chore backlog (cheap, unblocks the above)
1. BK-3 — sync AC field to the 10 refined ACs (/onboarding vs /projects redirects, drop "201").
2. BK-22 / BK-86 / BK-90 — human-ratify AI role-played PO answers.
3. BK-23 — answer 8 contract Qs (role gate, title overflow, API mismatch).
4. BK-88 — answer 4 PO + 5 dev Qs (ATP marks them planning blockers).
5. BK-89 — decide API contract (role per workspace in GET /workspaces + active-workspace contract).
6. BK-21 — answer 10 propagation Qs + fix OpenAPI drift on PATCH /atcs/{id}.
7. BK-35 — re-estimate (1 vs ≥5) + post the announced ATP content to Jira.
8. Design §8 — add screen rows for BK-35/36/37/39.

---

## 7. Maintenance protocol

- **Dependency edges (§2–§5)**: hand-maintained here. When a new story is refined, add its edge BEFORE it goes Ready For Dev.
- **Status snapshot (§6)**: refresh by re-running `jira:sync-issues` (READ `package.json` for the exact script) and re-photographing. Date the snapshot.
- **Cross-check against Jira issue-links** (validation, not authority): periodically diff §3 edge list vs Jira "blocks/is-blocked-by" links. **Local wins on structure** — Jira links are sparser and have no execution-sprint/mockup concept. Flag any Jira edge missing here, and any here missing in Jira (candidate to push up to Jira for traceability).
- **Relation to `/master-implementation-plan`**: that skill regenerates the epic-strategy layer (`master-implementation-plan.md`) from business-maps. It does NOT own this doc. If the skill is extended to emit ticket-level sequence, it should write *here*, not into the strategy doc. See open recommendation in session notes.
- **Trigger to update**: a gate releases (story → dev-done), a new story enters refinement, a mockup lands (clears a 🔒), or a sprint closes.
