# Execution Sprint Sequence — Bunkai (69) Sprint 2

_Last computed: 2026-06-10 · Scope: **active sprint** (sprint id 339 · board 7 · site `upexgalaxy69`) · Sprint window: 2026-06-09 → 2026-07-06 · Goal: "Finalizar un Producto Funcional con Módulos de Story, Test, ATC y Accounting"._

> **Sprint 2 reality: QA found bugs — bug-fix waves come FIRST.** Sprint 1 dev work (Part 1 + BK-18) is now in QA hands; QA opened 20 bugs (1 Highest, 2 High, 15 Medium, 1 Low + 1 Low improvement) and BLOCKED 4 stories. The sequence below orders the bug-fix work by severity/unblock-value, then resumes the story frontier from Sprint 1's plan.
>
> Sprint 1 sequence (superseded): see git history of this file (computed 2026-06-08, sprint id 6).

## Board snapshot (62 items)

| Type | Count | Breakdown |
|---|---|---|
| Story | 33 | 11 Ready For Dev · 6 Ready For QA · 3 Shift-Left QA · 2 In Test · 4 BLOCKED · 6 Backlog · 1 QA Approved (BK-98) |
| Bug | 21 | **20 Open** (1 Highest · 2 High · 16 Medium · 1 Low) · 1 Closed (BK-96) |
| Improvement | 2 | BK-97 (Medium) · BK-69 (Low) |
| Test / Test Plan / Test Execution | 6 | BK-63 · BK-64 · BK-65 · BK-66 · BK-94 · BK-95 (QA-owned, not dev scope) |

## BLOCKED stories — what unblocks them

| Story | Blocked by | Unblock action |
|---|---|---|
| BK-6 (Switch workspaces) | bug **BK-83** | Fix BK-83 (Wave 1) |
| BK-16 (Markdown editor) | bugs **BK-99** + **BK-100** | Fix BK-99 (Wave 1) + BK-100 (cheap pair, same component) |
| BK-10 (Rename/soft-delete module) | BK-9 In Test (QA sequencing) | QA-side; no dev action |
| BK-18 (ATC API) | relates to BK-96 — **already Closed** | Ask QA to re-check / unblock; no dev action pending |

---

## Bug-fix waves (build in this order)

### Wave 1 — CRITICAL (fix now, via `/sprint-development`)

| Order | Key | Priority | Bug | Why first |
|---|---|---|---|---|
| 1 | **BK-84** | **Highest** | [Staging] PAT bearer auth rejected on member/owned-resource routes (Imports, Projects, Modules, Tokens) — `requireAuth` middleware regression | Staging-wide API regression; blocks QA of 4 route families. BK-92/BK-93 are apparent duplicates — verify + close as dup when fixing. |
| 2 | **BK-83** | High | POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role) | Unblocks story BK-6. |
| 3 | **BK-99** | High | MarkdownEditor: 50 KB size limit not enforced on submission | Unblocks BK-16 (with BK-100). Server-side guard was a known Sprint-1 carry-forward. |
| 3b | BK-100 | Medium | MarkdownEditor: 90% capacity warning threshold not implemented | Same component as BK-99 — fix in the same ticket-pair pass to fully unblock BK-16. |

### Wave 2 — Functional-critical Medium (invite integrity, BK-5)

| Order | Key | Bug |
|---|---|---|
| 4 | **BK-62** | Role overwrite on accept — `workspace_members.upsert` demotes existing owner/member (data-integrity; worst of the three) |
| 5 | BK-60 | No email uniqueness check vs active workspace members in POST /invites |
| 6 | BK-61 | No email uniqueness check vs pending invites — duplicate invites allowed |

### Wave 3 — Dedup + remaining Medium

1. **Dedup first** (Jira hygiene, no code): close BK-54/BK-55/BK-56 as duplicates of BK-51/BK-52/BK-53; close BK-92/BK-93 as duplicates of BK-84 (verify same root cause).
2. Then fix: BK-51 (reserved project slugs not rejected, AC-11) · BK-52 (project detail route not workspace-scoped) · BK-53 (CJK/Cyrillic names rejected) · BK-67 (depth ≥5 success toast suppressed).
3. Tech-debt trio (pre-existing, from Sprint 1): BK-57 (rename+move not atomic) · BK-59 (activity_log audit on module ops) · BK-58 (migration ledger cleanup).

### Wave 4 — Simple/Low (leave for last)

| Key | Priority | Item |
|---|---|---|
| BK-68 | Low | Create Module form allows 1-char names (client-side min-length) |
| BK-69 | Low | Module name stores raw HTML tags (improvement) |
| BK-97 | Medium | Improvement: enforce per-route PAT capabilities on non-ATC routes (ADR-0001 follow-up) — plan as story-sized |

---

## Story frontier (resumes AFTER Wave 1, capacity permitting)

Inherited from Sprint 1 sequencing (dependency links unchanged in Jira):

| Order | Key | Story | Status | Blockers |
|---|---|---|---|---|
| 1 | BK-3 | Authentication — OAuth (GitHub/Google) | Ready For Dev | NONE (independent) |
| 1 | BK-20 | TMS-ATC Search | Ready For Dev | BK-18 dev-done (in QA) |
| 1 | BK-22 | TMS-ATC Usage report | Ready For Dev | BK-18 dev-done |
| 1 | BK-23 | TMS-ATC Duplicate | Ready For Dev | BK-18 dev-done |
| 2 | BK-27 | TMS-Test Builder | Ready For Dev | BK-18 dev-done |
| 3 | BK-28 | TMS-Test Reorder | Ready For Dev | BK-27 |
| 3 | BK-33 | TMS-Test Tags | Ready For Dev | BK-27 |
| 4 | BK-34 | TMS-Run Execution — start manual run | Ready For Dev | BK-27 chain |
| — | BK-86→87→88/89→90 | Account/Settings cluster | RFD/SLQA | Independent chain, build per capacity |
| — | BK-32, BK-35–39 | Test View + Run Execution tail | Backlog | Pull after BK-34 |

## Cycle warnings
- none

## Notes
- BK-21 (ATC Propagation, Shift-Left QA) still gated by BK-18+BK-27 per Sprint-1 links.
- Test artifacts (BK-63/64/65/66/94/95) are QA-owned; not dev-sequenced.

---
_Sequencing recomputed 2026-06-10 against active sprint 339 via `acli` + REST link reads (site upexgalaxy69). Bug-first ordering requested by Tech Lead; Wave 1 executes via `/sprint-development`._
