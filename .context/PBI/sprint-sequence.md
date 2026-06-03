# Execution Sprint Sequence — Bunkai (67) Sprint 1

_Last computed: 2026-06-03 · Scope: **active sprint** (20 stories · board 7 · site `upexgalaxy69`) · Supersedes the prior BK-44-only run._

> **Why ordering is plan-driven, not link-driven.** The in-sprint Jira `Dependencies` graph is effectively EMPTY: only BK-27 carries hard links, and all its dependents (BK-28 / BK-32 / BK-33 / BK-34) are OUT of the active sprint. A pure topological sort would drop all 20 stories into one parallel batch. The ordering below is therefore driven by the **architectural dependency cascade** in `.context/master-implementation-plan.md` (Auth → Workspace → Project → Module → US → AC → ATC → Test), not by Jira links. To make this machine-derivable, add proper `Dependencies` links via `references/dependency-linking.md`, then re-run sprint sequencing.

## Dev scope: 16 of 20 (4 already dev-done)

Excluded from development (dev complete, awaiting QA): **BK-2** (QA Approved), **BK-4 / BK-5 / BK-6** (Ready For QA).

Story-point scale: **AI-rapid-dev** (Fibonacci 1·2·3·5·8), not human scale. `✓` kept (already defined) · `✦` newly assigned (was empty) · `⟳` re-scaled from 1.

---

## Part 1 — "The Skeleton" (Project · Module · US · AC) — THIS SESSION

Structural substrate. Build order follows dependency cascade; one story at a time via `/sprint-development`.

| # | Key | Story | Epic | Status | SP |
|---|-----|-------|------|--------|----|
| 1 | BK-8 | TMS-Project \| Create a project inside a workspace | BK-7 | Ready For Dev | 5 ✓ |
| 2 | BK-9 | TMS-Module \| Create modules with nested sub-modules | BK-7 | Ready For Dev | 13 ✓ ⚠ |
| 3 | BK-10 | TMS-Module \| Rename and soft-delete a module | BK-7 | Estimation | 2 ✦ |
| 4 | BK-11 | TMS-Module \| Move a module to a different parent | BK-7 | Shift-Left QA | 3 ✦ |
| 5 | BK-16 | Markdown Editor \| Write and preview Markdown safely | BK-12 | Ready For Dev | 13 ✓ ⚠ |
| 6 | BK-14 | TMS-US \| Manage user stories anchored to a module | BK-12 | Shift-Left QA | 3 ✦ |
| 7 | BK-15 | TMS-AC \| Manage criteria under a user story | BK-12 | Shift-Left QA | 3 ✦ |
| 8 | BK-17 | Jira Import \| Pull Jira issues by JQL | BK-12 | Ready For Dev | 5 ✦ |

**Part 1 total:** 8 stories · 47 SP. ⚠ BK-9 and BK-16 are human-scale 13s (split-smell); kept per user instruction (do not touch already-defined SP).

---

## Part 2 — "The Muscle" (OAuth · ATC Library · Test) — NEXT SESSION

The differentiator (one-edit-many-tests cascade) + test assembly. Depends on the Part 1 skeleton.

| # | Key | Story | Epic | Status | SP |
|---|-----|-------|------|--------|----|
| 1 | BK-3 | Authentication \| Sign up and sign in via OAuth (GitHub / Google) | BK-1 | Ready For Dev | 8 ✓ |
| 2 | BK-18 | TMS-ATC API \| Create and edit ATCs with steps and assertions | BK-13 | Ready For Dev | 5 ✓ |
| 3 | BK-19 | TMS-ATC Builder \| Build an ATC with ordered steps and assertions | BK-13 | Shift-Left QA | 5 ✦ |
| 4 | BK-20 | TMS-ATC Search \| Search and autocomplete ATCs | BK-13 | Ready For Dev | 5 ✓ |
| 5 | BK-21 | TMS-ATC Propagation \| Cascade ATC edits to all tests ★differentiator | BK-13 | Shift-Left QA | 5 ✦ |
| 6 | BK-22 | TMS-ATC Usage \| See a "Used in N tests" report | BK-13 | Ready For Dev | 3 ✓ |
| 7 | BK-23 | TMS-ATC Duplicate \| Duplicate an ATC with steps and assertions | BK-13 | Shift-Left QA | 2 ✦ |
| 8 | BK-27 | TMS-Test Builder \| Assemble a test by chaining ATCs | BK-24 | Shift-Left QA | 3 ⟳ |

**Part 2 total:** 8 stories · 36 SP.

---

## Cycle warnings
- none

## Soft dependencies (Relates To)
- none — no `Relates` links exist on any of the 20 in-sprint stories.

## Hard links present (all dependents out-of-sprint — do not delay in-sprint work)
- BK-28, BK-32, BK-33, BK-34 → `depend on` → **BK-27** (BK-27 is the in-sprint prerequisite; its dependents are future Tests-epic work outside this sprint).

## Downstream (separate scope, not in active sprint)
- **EPIC BK-44 — Coverage & Traceability**: read-side capstone, gated on BK-24/BK-30/BK-31 being Done. Its intra-epic topological order was computed in a prior run (see git history of this file). Re-run after the execution layer lands.

---
_Sequencing authored by `/product-management` workflow H against the active sprint. Story points written to Jira (site upexgalaxy69) on 2026-06-03._
