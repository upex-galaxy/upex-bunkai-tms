---
name: master-implementation-plan
description: Generate or update .context/master-implementation-plan.md — high-level roadmap of all features to implement in this repo, dependency-cascaded, value-prioritized. The dev-side master plan derived from business-data-map + business-feature-map. Triggers on 'master plan', 'plan maestro de implementación', 'implementation roadmap', 'what to build first', 'qué construir y en qué orden', 'plan de features high-level'. Hard gate: business-data-map.md. Soft gate: business-feature-map.md. Do NOT use for: per-story implementation planning (use /sprint-development planning stage), data entity mapping (use /business-data-map), feature inventory (use /business-feature-map), unit testing scope (use /unit-testing).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Master Implementation Plan Generator

Generate or update `.context/master-implementation-plan.md` — a business-derived implementation roadmap that answers one question: **what to build in this application, in what order, and why does that order matter?**

**Target**: $ARGUMENTS (project path, module filter, epic name, or leave blank for full system)

---

## What this produces

A conversational, senior-engineer-voice document that sits **on top of** `business-data-map.md` and `business-feature-map.md` and converts them into a ranked implementation strategy.

The output contains:

- Executive value/priority map (top features, ranked by user-value × urgency × blocking factor)
- Per-Master-Sprint implementation rationale (what unlocks revenue, what unlocks other features, what unlocks user trust)
- Features / state machines that block others (foundational work)
- Hidden dependencies — feature → feature couplings that are not obvious from the PRD
- External integrations roadmap — what to integrate, in what order, what each unlocks
- Implementation dependency cascade across features
- Edge implementation cases — features with ambiguous scope or pending technical decisions
- Pre-ship checklist that applies to every feature before it merges to main
- Explicit out-of-scope section (to stop scope creep into the master plan)
- Implementation gaps — spike candidates and unknowns to investigate before building

This is **NOT** a story-level implementation plan (→ `/sprint-development` Planning stage), a flow description (→ `business-data-map.md`), a feature inventory (→ `business-feature-map.md`), nor a per-epic ROADMAP (→ `.context/PBI/{module}/ROADMAP.md`). It is the **implementation-strategy layer** above those maps.

---

## Sources (use ALL available)

| Source                                      | Status                     | What to extract                                                                                                         | Tool                               |
| ------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `.context/business/business-data-map.md`    | **HARD REQUIREMENT**       | Critical flows, state machines, automatic processes, integrations, business rules — every feature inherits one of these | Read file                          |
| `.context/business/business-feature-map.md` | Optional — warn if missing | Feature catalog, CRUD matrix, feature flags, dependency tags, MVP-relevance matrix                                      | Read file                          |
| Existing context                            | If available               | PRD priorities, SRS architecture, user journeys, domain glossary                                                        | `.context/PRD/`, `.context/SRS/`   |
| Git history                                 | If signals needed          | Already-shipped modules (skip), recently-touched modules (in-flight)                                                    | `git log --oneline -90 --stat`     |
| PBI epics                                   | If available               | Existing epic/story breakdowns to align the plan with current backlog                                                   | `.context/PBI/{module}/ROADMAP.md` |
| Issue tracker                               | If helpful                 | Already-prioritized backlog signals from product                                                                        | `[ISSUE_TRACKER_TOOL]`             |

**Golden rule**: ground every priority claim in evidence from the maps. "This feature is Master Sprint 0 because…" must cite either a data-map flow (revenue / legal / blocker), a feature-map MVP-relevance row, a named external dependency, or an explicit user-journey reference. No hand-wave prioritization.

---

## Mode detection

```
Does .context/master-implementation-plan.md exist?
  → NO:  CREATE mode — generate from scratch.
  → YES: UPDATE mode — generate new version, show diff summary, ask
         for confirmation before overwriting. NEVER auto-overwrite.
```

In UPDATE mode, the most likely triggers are: scope shift, post-architecture-decision refresh, quarter / milestone boundary, or a major feature finished that changes what is now unblocked downstream.

---

## Discovery phases

### Phase 1 — Validation gate

#### 1.1 `business-data-map.md` check (HARD)

If `.context/business/business-data-map.md` does NOT exist → **STOP** with:

> This command needs `.context/business/business-data-map.md` to reason about dependencies, blocking factors, and value. Run `/business-data-map` first, then re-invoke `/master-implementation-plan`.

Do not proceed with assumptions. An implementation plan without an entity / flow map is wishlist, not plan.

#### 1.2 `business-feature-map.md` check (SOFT)

If `.context/business/business-feature-map.md` does NOT exist → **WARN and proceed**. Log in §11 Implementation Gaps:

> The feature-map was not available at generation time. This plan reflects `business-data-map.md` only. Angles missed: per-feature MVP-relevance scoring, CRUD-completeness signals, feature-flag staging, third-party-dependency tagging. Run `/business-feature-map` and re-run `/master-implementation-plan` for the complete picture.

#### 1.3 Read and extract

From the data-map: flows, state machines, automatic processes, external integrations, business rules. Every flow becomes a candidate implementation unit.

From the feature-map (if present): high-value features, feature flags, MVP/post-MVP segmentation, third-party dependencies, CRUD-completeness gaps.

From PRD / SRS / user journeys (if present): explicit product priorities, persona-anchored value statements, architectural constraints that gate work order.

From git log: modules already touched (filter out as "in flight" or "shipped") so the plan focuses on what is genuinely ahead.

### Phase 2 — Priority scoring

Apply this rubric to every flow / feature / automatic process. The rubric is **internal** — the output document shows conclusions, not the scoring table.

| Factor              | H (3)                                                                                 | M (2)                                       | L (1)                              |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| **User Value**      | Core revenue path, primary user job, persona-critical                                 | Secondary job, supports retention           | Polish, nice-to-have               |
| **Blocking Factor** | Many downstream features depend on this (auth, data model, schema)                    | One or two downstream features depend on it | Isolated, nothing else waits on it |
| **Urgency / Risk**  | Required for MVP, contract / legal deadline, external integration with long lead time | Should ship soon, but not MVP-blocking      | Can wait without business impact   |

Composite score = product of the three. Map:

- `≥ 18` → **Master Sprint 0** (foundational — must ship first; unblocks the rest)
- `8–17` → **Master Sprint 1** (core MVP — main value delivery)
- `3–7` → **Master Sprint 2** (post-MVP enhancement)
- `< 3` → **Deferred** (log in §10, do not include in Master Sprints)

### Phase 3 — Dependency mapping

For every Master Sprint 0 and Master Sprint 1 item, trace which downstream features become possible (or required) once it ships. Two directions matter:

- **Hard dependency**: feature B cannot start without feature A (e.g. checkout needs cart needs catalog).
- **Soft dependency**: feature B is technically buildable without A, but pointless or low-value without it (e.g. push notifications without an account system).

This feeds §5 (blocking features), §6 (hidden dependencies), and §7 (cascade graph) in the output.

### Phase 4 — Hidden-dependency detection

Identify features that **share an entity** in the data-map but live in different epics in the feature-map. These are the most common source of "wait, we have to redesign the schema" surprises mid-sprint.

Examples to look for: any entity that appears in >1 feature card, any state machine consumed by >1 flow, any external integration referenced by >1 feature, any business rule (especially permission / role rules) cited in multiple places.

Score these as **always flag**, regardless of priority — they are the silent integration cost.

---

## Output structure

Write `.context/master-implementation-plan.md` with this structure.

**Tone**: conversational, senior-engineer voice, second person ("you will want to ship X before Y because…"). Assume the reader is a tech-lead onboarding to the project — guide them, do not lecture. Use the same feature / flow names as the data-map and feature-map.

**What NOT to include**: feature catalogs (live in feature-map), flow diagrams (live in data-map), per-story implementation plans (live in `/sprint-development`), API endpoint definitions (live in `business-api-map.md` or `api/openapi-types.ts`), code snippets, payloads, fixtures.

### 0. Header block

```markdown
> **Generated by**: `/master-implementation-plan` slash command
> **Last update**: YYYY-MM-DD
> **Derived from**: business-data-map.md, business-feature-map.md (if present), PRD, SRS, git log
> **Update frequency**: Re-run when scope shifts, after major architectural decisions, when a Master Sprint 0 / Master Sprint 1 feature ships, or at the start of each quarter / milestone.
```

### 1. Visual header

ASCII box with project name + one-line intent ("What to implement in this system, in what order, and why").

### 2. Executive value/priority map

Narrative paragraph (3–5 sentences) framing the system's biggest value-unlock features and the foundational work they sit on top of, followed by:

```markdown
| Priority        | Feature                        | Why it matters                              | Unlocks / Depends on                    |
| --------------- | ------------------------------ | ------------------------------------------- | --------------------------------------- |
| Master Sprint 0 | Auth & account model           | Every gated feature waits on this           | Unlocks: checkout, profile, billing     |
| Master Sprint 0 | Catalog / domain core entities | Schema for the main domain object           | Unlocks: search, listing, checkout      |
| Master Sprint 1 | Checkout & payment             | Primary revenue path                        | Depends on: auth, catalog, payments API |
| Master Sprint 1 | Notifications (email)          | Closes the loop on every transactional flow | Depends on: auth, checkout              |
```

Cap at 7–10 rows. Anything below Master Sprint 1 goes to §10 as a short list or §11 if it needs a spike first.

### 3. What to implement first and why

One subsection per Master Sprint 0 / Master Sprint 1 feature. For each:

- **Why it matters** — user/business value + what is blocked if it does not exist (product-facing wording, not technical)
- **What it unblocks** — concrete downstream features that become possible (or pointless) once this ships
- **Dependencies** — what must already exist before this can start (entities, integrations, architectural decisions)
- **How an experienced engineer would scope it** — 3–5 prose bullets covering the smallest credible MVP slice, the most likely scope creep, and the boundary with the next Master Sprint

Prose, not code. No payloads, no schemas, no endpoint shapes.

### 4. Master Sprint structure (Master Sprint 0 → Master Sprint 1 → Master Sprint 2)

A short prose summary of each Master Sprint: what is in it, what defines "done" for the Master Sprint (e.g. "Master Sprint 0 is done when an authenticated user can see an empty dashboard backed by real data"), and the rough size signal (number of features, number of weeks, or "small / medium / large" if estimates are unavailable).

This section gives the reader the **shape of the roadmap** without committing to dates.

### 5. Features / state machines that block others

Only the items where shipping them unblocks ≥ 2 other features, or shipping them late actively rots downstream work. Per item:

- Why the dependency is real (technical reason, not preference)
- Which downstream features will rework if this lands wrong
- Smallest version of this item that still unblocks the rest (do not gold-plate a Master Sprint 0 feature)
- How a partial / temporary version (feature flag, stub, mock provider) could unblock parallel work

This is usually where the most leverage hides — a tight Master Sprint 0 ships the rest faster.

### 6. Hidden dependencies

Features that share an entity, a state machine, an external integration, or a business rule but live in different epics. Per coupling:

- The shared element (entity / machine / integration / rule)
- The features on each side of the coupling
- What goes wrong if they are designed in isolation (schema rework, double-source-of-truth, permission drift, eventual-consistency races)
- The cheapest coordination point (shared schema review, one team owns the entity, contract test, etc.)

This section is the section that saves the most rework cost. Be specific.

### 7. External integrations roadmap

Per third-party service (Stripe, SendGrid, Auth0, Twilio, etc.):

- Which feature first requires it
- What it unlocks once integrated (often more than the feature that triggered it)
- Lead-time concerns (account approval, KYC, sandbox-vs-prod drift, rate limits)
- Recommended order (which integration to wire first, which can wait)
- Acceptable stand-in during early Master Sprints (mock provider, manual workaround, env-flag stub)

Often the right move is to integrate a service one Master Sprint **before** the feature that needs it, so the integration is debugged in isolation.

### 8. Implementation dependency cascade

ASCII cascade graph plus narrative of the 2–3 most critical chains:

```
Auth ──► Account profile ──► Catalog ──► Cart ──► Checkout ──► Payment ──► Order ──► Notifications
  │             │                │         │           │            │          │            │
  └ gates every authenticated flow downstream of this point
```

Point is: shipping a Master Sprint 1 feature in isolation is fine for the demo, but the **chain** is what ships value. Spell out the 2–3 chains that matter.

### 9. Edge implementation cases

Features with ambiguous scope, pending technical decisions, or competing approaches. Grouped by theme, not by feature:

- **Pending architectural decisions** (sync vs async, sql vs nosql for a sub-domain, in-process vs queue, monolith vs split)
- **Scope-ambiguous features** (admin UI vs API-only, multi-tenant vs single-tenant per-feature, hard delete vs soft delete)
- **Competing approaches** (build vs buy, framework primitive vs custom, polling vs webhooks)
- **Permission / role boundaries** (which features need RBAC from day one vs which can hardcode roles)

Per item, name the specific project feature most at risk and the cheapest way to **defer the decision** vs the cheapest way to **lock it down**.

### 10. Pre-ship checklist (applies to every feature before merging to main)

Short, action-oriented. No more than 12 items. Ordered by what is most often skipped first. Each line is one check phrased as "Verify X is true before merging Y". Examples (adapt to the project):

```markdown
- Verify the feature is covered by the master-test-plan's risk map (or document why it is not).
- Verify env vars consumed by the feature are documented in `.env.example` and `.agents/project.yaml`.
- Verify the feature is wired behind a feature flag if it is part of a partial-Master-Sprint rollout.
- Verify the implementation matches the entity definition in `business-data-map.md` (no schema drift).
- Verify external integrations have a documented degradation mode.
- Verify the feature has been demoed against staging before requesting review.
```

No TC IDs (those live in the TMS / QA side). No code review checklist (that lives in `/sprint-development`'s Code Review stage).

### 11. What is NOT in scope

Explicit delegation to stop scope creep into this plan:

```markdown
- Per-story implementation plan, file-by-file design → `/sprint-development` Planning stage, written to `.context/PBI/{module}/{ticket}/implementation-plan.md`
- Feature catalog, CRUD matrix, feature flags → `.context/business/business-feature-map.md`
- Flow diagrams and state-machine transitions → `.context/business/business-data-map.md`
- API endpoint inventory / contracts → `bun run api:sync` + `/business-api-map` (when available)
- Test strategy and risk map → `.context/master-test-plan.md` (sister repo: `/master-test-plan`)
- Sprint-level execution order → `.context/PBI/{module}/ROADMAP.md` (per-epic) or sprint planning artifacts
- Definite delivery dates → out of scope; this plan only orders work, it does not estimate it
- Deferred / won't-do features → list here at the end of this section, do not promote them into Master Sprints
```

Finish §11 with a short "Deferred / won't-do" subsection listing anything explicitly **excluded** from the MVP plus a one-line reason (e.g. "social login — deferred to Master Sprint 3 after primary auth is hardened"). The point is to make the deferral **visible** so it stops re-entering scope discussions.

### 12. Implementation gaps

MANDATORY. List anything you could not ground in evidence — these are spike candidates, not unknowns to ignore:

- Features mentioned in the PRD but missing from `business-data-map.md` (no entity / flow yet)
- Integrations without a documented provider choice
- Architectural decisions implied but never recorded (sync vs async, transport, deployment unit)
- Capacity / performance targets that affect implementation choice but have no number attached
- If §1.2 triggered the feature-map warning, restate the limitation here

Each gap should be phrased as a one-line spike: "Spike: choose payment provider (Stripe vs Adyen) before Master Sprint 1 — affects checkout, refund, and webhook design."

"I could not verify X" is better than inventing an answer.

---

## After generation

- Update `CLAUDE.md` Context System section to reference `.context/master-implementation-plan.md` if not already present.
- In UPDATE mode: show diff summary, wait for explicit confirmation before overwriting. Highlight changes that promote / demote a feature across Master Sprints — those are the high-attention deltas.
- Report:
  - Master Sprint 0 features identified: N
  - Master Sprint 1 features identified: N
  - Hidden dependencies flagged: N
  - External integrations mapped: N
  - Implementation gaps / spikes open: N
- If §1.2 warned, remind the user to run `/business-feature-map` and re-run this command.
- If any §12 spike is rated as "blocks Master Sprint 0", call it out explicitly in the report — these need a decision before the plan is actionable.

---

## Rules / constraints

- Never auto-overwrite an existing `.context/master-implementation-plan.md`. UPDATE mode always pauses for confirmation.
- Never invent priorities. Every Master Sprint 0 / Master Sprint 1 claim cites a data-map flow, a feature-map row, a PRD priority, or a named integration constraint.
- Never collapse this plan into a story-level plan. If the reader needs file-level detail, point them at `/sprint-development`.
- Never include dates. Order matters; estimates do not belong here.
- If neither `business-data-map.md` nor `business-feature-map.md` are present, STOP — the hard gate is non-negotiable.
- Prose first, tables when they help, ASCII when narrative cannot carry the structure. No code blocks beyond the cascade graph and the markdown table examples shown above.
