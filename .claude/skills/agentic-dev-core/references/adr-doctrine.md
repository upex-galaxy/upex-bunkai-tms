# ADR Doctrine — detecting and authoring Architecture Decision Records

Shared reference cited by `project-foundation` (SRS architecture phase) and `sprint-development` (Stage 1 planning). It tells a workflow **when** an architectural decision deserves a permanent record, and **how** to author one without re-litigating settled decisions.

The canonical convention — template, status lifecycle, append-only rule, index — lives in `.context/ADR/README.md`. This file owns the AI-side **detection heuristic**, the **promotion rule**, and the **authoring procedure**. Read both; do not duplicate the lifecycle here.

---

## 1. The two-gate detection heuristic

A decision earns an ADR only when it passes **both** gates. One gate alone is not enough.

```
                  ┌─────────────────────────────┐
 decision made ──▶│ Gate 1: architectural?      │── no ──▶ no ADR
                  │ (structure / cross-cutting / │
                  │  system-wide invariant)      │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                  ┌─────────────────────────────┐
                  │ Gate 2: hard to reverse?    │── no ──▶ no ADR (record locally)
                  │ (many files / data migration │
                  │  / cross-team coordination)  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                          record an ADR
```

**Passes both → ADR.** Auth model, data-access pattern, error/response contract, tenancy model, state-management approach, API style, framework/library choice with lock-in, deployment topology, a cross-cutting invariant every feature must uphold.

**Fails a gate → not an ADR.** Bug fixes (→ engram + `bug-fix.md`), local refactors, naming, single-use code, and **story-local technical decisions** (→ stay in the story's `implementation-plan.md`).

When genuinely unsure, ask the user one question rather than recording silently or skipping silently: _"This looks like a hard-to-reverse architectural call — record it as an ADR?"_

---

## 2. The promotion rule (story-local vs ADR-worthy)

The story-plan and feature-plan templates already have a `## Technical Decisions` section. Most of what lands there is **story-local** and stays there. Promote a decision out of the plan and into a standalone ADR only when it passes both gates.

| Decision                                              | Lives in                                     |
| ----------------------------------------------------- | -------------------------------------------- |
| "Use `useReducer` not `useState` for this form"       | story `implementation-plan.md`               |
| "This list paginates client-side"                     | story `implementation-plan.md`               |
| "All write endpoints go through one auth gateway"     | **ADR** (+ a pointer from the plan)          |
| "Orders are event-sourced; state is never mutated"    | **ADR** (+ a pointer from the plan)          |

When you promote, leave a one-line backlink in the plan's `## Technical Decisions` (`See ADR-NNNN`) so the plan stays self-explaining and the decision is tracked where it can be superseded.

---

## 3. Authoring procedure

1. **Confirm both gates** (§1). If unsure, ask.
2. **Allocate the number.** Read `.context/ADR/README.md` → Index for the highest existing `ADR-NNNN`; the new one is the next 4-digit, zero-padded number. Numbers are never reused.
3. **Copy the template.** `.context/ADR/ADR-NNNN-template.md` → `.context/ADR/ADR-<NNNN>-<slug>.md` (`<slug>` = short kebab summary). Fill every section — Context, Decision, Consequences (positive **and** negative), Alternatives considered.
4. **Set status honestly.** Open question remaining → `Proposed`. Agreed and binding → `Accepted` **after the human approves**. An AI workflow drafts; the human accepts.
5. **Update the Index** table in `.context/ADR/README.md` (ADR / Title / Status / Supersedes / Superseded by).
6. **If it supersedes an existing ADR**, wire both directions and flip the old ADR's `Status` line to `Superseded by ADR-<NNNN>`. **Never edit the superseded decision's body** — it is the historical record.
7. **Persist to engram** (`mem_save`, type `architecture`) so the decision survives compaction, per the proactive-memory protocol.

---

## 4. Where this plugs into the workflows

- **`/project-foundation`, SRS architecture phase** — after the system architecture, tech-stack justification, and security model are defined, the big cross-cutting decisions are exactly the ADR-worthy ones. Seed the **first batch** of ADRs here (auth model, data-access pattern, error contract, tenancy, deployment topology), then reference them from `architecture-specs.md`. This is the natural origin point: foundational decisions are made once, up front, and are maximally hard to reverse.
- **`/sprint-development`, Stage 1 planning** — when a story or feature forces a decision that passes both gates (and wasn't already covered by a foundation ADR), promote it from the plan's `## Technical Decisions` to a standalone ADR before coding. Architectural rework discovered mid-review loops back here.

---

## 5. Anti-patterns — NEVER do these

- **A1.** NEVER ADR a story-local trade-off. If it changes one file and is easy to undo, it stays in the `implementation-plan.md`. Over-recording buries the decisions that matter.
- **A2.** NEVER rewrite or delete an Accepted ADR to "update" it. Write a new ADR that supersedes it. The old one stays as history (append-only).
- **A3.** NEVER record an ADR with no `Negative / trade-off` consequence. A decision with only upsides is under-examined — find the cost or it isn't a real architectural choice.
- **A4.** NEVER mark an AI-drafted ADR `Accepted` without explicit human sign-off. Draft as `Proposed`; the human flips it to `Accepted`.
- **A5.** NEVER reuse or skip ADR numbers. The Index in `.context/ADR/README.md` is the allocator — read it before assigning.
