# ADR doctrine: detecting and authoring Architecture Decision Records

Shared reference cited by `project-foundation` (SRS architecture phase) and `sprint-development` (Stage 1 planning). It tells a workflow when an architectural decision deserves a permanent record, and how to write one without re-litigating settled decisions.

The canonical convention (template, status lifecycle, append-only rule, index) lives in `.context/ADR/README.md`. This file owns the detection test, the promotion rule and the authoring procedure. Read both, and keep the lifecycle there.

The goal is a short list of decisions a future reader would otherwise "fix" by mistake, so over-recording is as much a failure as under-recording. Source: the three-gate test is the one in the `domain-modeling` skill (`ADR-FORMAT.md`), stated in full here; nothing loads that skill.

---

## 1. The three-gate detection test

Screen first for scope: a decision about structure, a cross-cutting concern or a system-wide invariant is architectural. A story-local choice stays in the story's `implementation-plan.md` under `## Technical Decisions`.

An architectural decision then earns an ADR only when it passes all three gates. One or two gates are not enough.

```
                  ┌─────────────────────────────┐
 decision made ──▶│ Gate 1: hard to reverse?    │── no ──▶ no ADR (you will just reverse it)
                  │ (many files / data migration │
                  │  / cross-team coordination)  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                  ┌─────────────────────────────┐
                  │ Gate 2: surprising without  │── no ──▶ no ADR (nobody will wonder why)
                  │ context? (a future reader    │
                  │  would ask "why this way?")  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                  ┌─────────────────────────────┐
                  │ Gate 3: a real trade-off?   │── no ──▶ no ADR (the obvious thing, nothing to record)
                  │ (genuine alternatives, one   │
                  │  picked for stated reasons)  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                          record an ADR
```

Passes all three: auth model, data-access pattern, error/response contract, tenancy model, state-management approach, API style, a framework or library choice with lock-in, deployment topology, a cross-cutting invariant every feature must uphold.

Fails a gate: bug fixes (they go to engram and `bug-fix.md`), local refactors, naming, single-use code, and story-local technical decisions (A1 below).

When you are unsure, ask the user one question instead of recording or skipping silently: _"This looks like a hard-to-reverse architectural call, record it as an ADR?"_ A supervised worker asks its conductor. With nobody to ask, `./decision-protocol.md` applies: record the ADR as `Proposed` and report it. `autonomous-delivery` is the nobody case, so an ADR it writes is `Proposed` unless the decision was a recorded human approval.

---

## 2. The promotion rule (story-local vs ADR-worthy)

The story-plan and feature-plan templates already have a `## Technical Decisions` section. Most of what lands there is story-local and stays there. Promote a decision into a standalone ADR only when it passes all three gates.

| Decision                                              | Lives in                                     |
| ----------------------------------------------------- | -------------------------------------------- |
| "Use `useReducer` not `useState` for this form"       | story `implementation-plan.md`               |
| "This list paginates client-side"                     | story `implementation-plan.md`               |
| "All write endpoints go through one auth gateway"     | **ADR** (+ a pointer from the plan)          |
| "Orders are event-sourced; state is never mutated"    | **ADR** (+ a pointer from the plan)          |

When you promote, leave a one-line backlink in the plan's `## Technical Decisions` (`See ADR-NNNN`) so the plan stays self-explaining and the decision is tracked where it can be superseded.

---

## 3. Authoring procedure

1. Confirm all three gates (§1). If unsure, ask as §1 says.
2. Allocate the number. Read `.context/ADR/README.md`, Index table, for the highest existing `ADR-NNNN`; the new one is the next 4-digit, zero-padded number. Numbers are never reused.
3. Copy the template `.context/ADR/ADR-NNNN-template.md` to `.context/ADR/ADR-<NNNN>-<slug>.md` (`<slug>` is a short kebab summary). Fill every section: Context, Decision, Consequences (positive and negative), Alternatives considered.
4. Set the status honestly. When the ADR records a decision the human already made (a decision deck, a chat answer, an approved plan, a PRD or SRS choice they signed off), write it `Accepted` and let the `Deciders` line name where it was approved. A question still open is `Proposed`, and the ADR says what is unresolved. Do not ask the human to "accept" an ADR that only records a decision they already took, because the approval happened when they decided.
5. Update the Index table in `.context/ADR/README.md` (ADR / Title / Status / Supersedes / Superseded by).
6. If it supersedes an existing ADR, wire both directions and flip the old ADR's `Status` line to `Superseded by ADR-<NNNN>`. Leave the superseded decision's body as it is, since it is the historical record.
7. Persist to engram (`mem_save`, type `architecture`) so the decision survives compaction, per the proactive-memory protocol.

---

## 4. Where this plugs into the workflows

- `/project-foundation`, SRS architecture phase: once the system architecture, tech-stack justification and security model are defined, the big cross-cutting decisions are the ADR-worthy ones. Seed the first batch here (auth model, data-access pattern, error contract, tenancy, deployment topology), then reference them from `architecture-specs.md`. Foundational decisions are made once, up front, and are the hardest to reverse.
- `/sprint-development`, Stage 1 planning: when a story or feature forces a decision that passes all three gates and no foundation ADR covers it, promote it from the plan's `## Technical Decisions` to a standalone ADR before coding. Architectural rework found mid-review loops back here.

---

## 5. Anti-patterns

- **A1.** A story-local trade-off is not an ADR. If it changes one file and is easy to undo, it stays in the `implementation-plan.md`.
- **A2.** Do not rewrite or delete an `Accepted` ADR to "update" it. Write a new ADR that supersedes it; the old one stays as history (append-only).
- **A3.** Do not record an ADR with no `Negative / trade-off` consequence. A decision with only upsides is under-examined: find the cost, or it was not a real architectural choice.
- **A4.** Do not mark an ADR `Accepted` when no human approved the decision. An ADR that records an approved decision is `Accepted` from the start, citing the approval; `Proposed` is for a decision still open.
- **A5.** Do not reuse or skip ADR numbers. The Index in `.context/ADR/README.md` is the allocator, so read it before assigning.
