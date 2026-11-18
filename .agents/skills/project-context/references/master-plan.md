# Master Implementation Plan Generator

Generate or update `.context/master-implementation-plan.md`, a business-derived implementation roadmap that answers one question: **what to build in this application, in what order, and why that order matters.**

**Target**: `$ARGUMENTS` forwarded by the alias or given in the invocation (project path, module filter, epic name, or blank for the full system)

---

## What this produces

A conversational document in a senior engineer's voice. It sits on top of the data map (`business-data-context`) and the feature map (`business-feature-context`) and turns them into a ranked implementation strategy.

The output sections (see "Output structure") run from an executive value/priority map through Master Sprint rationale, blocking features, hidden dependencies, integrations, the dependency cascade, edge cases and a pre-ship checklist, to an explicit out-of-scope list and the implementation gaps (spike candidates) to resolve before building.

This is the implementation-strategy layer above the other documents. It does not replace a story-level plan (`/sprint-development` Planning stage), a flow description (the data map), a feature inventory (the feature map), or the ticket-level execution order (`.context/dev-roadmap.md`, `/project-context dev-roadmap`).

---

## Sources

Use every source that is available.

| Source | Status | What to extract | Tool |
| ------ | ------ | --------------- | ---- |
| The data map (`business-data-context`) | **Hard requirement** | Critical flows, state machines, automatic processes, integrations, business rules. Every feature inherits one of these | `bun run context:map business-data-context` |
| The feature map (`business-feature-context`) | Optional, warn if missing | Feature catalog, CRUD matrix, feature flags, dependency tags, MVP-relevance matrix | `bun run context:map business-feature-context` |
| Existing context | If available | PRD priorities, SRS architecture, user journeys, domain glossary | `.context/PRD/`, `.context/SRS/`, `.context/business/domain-glossary.md` |
| Git history | If signals are needed | Modules already shipped (skip them) and modules touched recently (in flight) | `git log --oneline -90 --stat` |
| PBI epics | If available | Existing epic and story breakdowns, to align the plan with the current backlog | `.context/PBI/epic-tree.md`, `.context/PBI/epics/EPIC-<KEY>-<slug>/epic.md` (synced cache; `bun run context:hydrate`) |
| Issue tracker | If helpful | Backlog priorities product has already set | `[ISSUE_TRACKER_TOOL]` |

**Golden rule**: every priority claim cites evidence from the maps. "This feature is Master Sprint 0 because..." names a data-map flow (revenue, legal or blocker), a feature-map MVP-relevance row, a named external dependency, or a user-journey reference. A priority with no such source does not go in the plan.

---

## Mode detection

```
Does .context/master-implementation-plan.md exist?
  → NO:  CREATE mode: generate from scratch.
  → YES: UPDATE mode: generate a new version, show a diff summary,
         and get confirmation before overwriting.
```

UPDATE mode usually follows a scope shift, an architecture decision, a quarter or milestone boundary, or a finished feature that changes what is now unblocked downstream. The old file stays until the owner confirms the new one.

---

## Existing app (remaining-work framing)

When `.template/installer.lock.json` records `adopted: true`, the app was running before the agentic layer arrived and most of what the maps describe is already shipped. Scoring those features again would put finished work in Master Sprint 0. For an adopted app only:

- **The shipped baseline is input, not a candidate.** Features the feature map marks Stable, and flows the data map traces end to end in code, form the baseline. They are not scored and not placed in a Master Sprint. §2 lists them in one short "Baseline (already shipped)" table (`Module | Feature-map section id | Why it matters to what remains`) above the priority table.
- The candidates are what remains: Beta, Planned and WIP features, partial CRUD rows, discovery gaps the maps flag, the epics open in the tracker, and the debt the maps expose (a table with RLS off, an integration with no degradation mode).
- **Urgency reads the team's roadmap, not an MVP.** In the Phase 2 rubric, "Required for MVP" becomes "required for the next release the tracker or the PRD names". With neither, say so in §12 and score urgency from the maps alone.
- **Master Sprint 0 is the foundational remaining work**, meaning what several remaining features wait on. It is never a rebuild of the baseline. A remaining item that would change a baseline entity or flow names the section it touches and is flagged in §6 Hidden dependencies.
- **Git history marks what is in flight.** Modules touched in recent commits or open branches are "in flight" rows of the remaining work, not baseline.

A greenfield project skips this section and follows the plan below unchanged.

---

## Discovery phases

### Phase 1: Validation gate

#### 1.1 Data map check (hard)

If `bun run context:map business-data-context` prints the placeholder notice, or fails because the skill is missing, stop with:

> This command needs a generated data map (`business-data-context`) to reason about dependencies, blocking factors, and value. Run `/project-context data` first, then re-invoke `/project-context master-plan`.

A plan without an entity and flow map is a wishlist.

#### 1.2 Feature map check (soft)

If `bun run context:map business-feature-context` prints the placeholder notice, warn and continue. Log this in §12 Implementation gaps:

> The feature-map was not available at generation time. This plan reflects the data map only. Angles missed: per-feature MVP-relevance scoring, CRUD-completeness signals, feature-flag staging, third-party-dependency tagging. Run `/project-context features` and re-run `/project-context master-plan` for the complete picture.

#### 1.3 Read and extract

- From the data map: flows, state machines, automatic processes, external integrations and business rules. Every flow is a candidate implementation unit.
- From the feature map (if present): high-value features, feature flags, MVP and post-MVP segmentation, third-party dependencies, CRUD-completeness gaps.
- From PRD, SRS and user journeys (if present): explicit product priorities, persona-anchored value statements, and architectural constraints that fix the work order.
- From the git log: modules already touched. Mark them "in flight" or "shipped" so the plan covers what is still ahead.

### Phase 2: Priority scoring

Score every flow, feature and automatic process with this rubric. The rubric is internal: the output document shows conclusions, not the scoring table.

| Factor              | H (3)                                                                                 | M (2)                                       | L (1)                              |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| **User Value**      | Core revenue path, primary user job, persona-critical                                 | Secondary job, supports retention           | Polish, nice-to-have               |
| **Blocking Factor** | Many downstream features depend on this (auth, data model, schema)                    | One or two downstream features depend on it | Isolated, nothing else waits on it |
| **Urgency / Risk**  | Required for MVP, contract or legal deadline, external integration with long lead time | Should ship soon, but not MVP-blocking      | Can wait without business impact   |

The composite score is the product of the three factors:

- `≥ 18`: **Master Sprint 0** (foundational, ships first, unblocks the rest)
- `8–17`: **Master Sprint 1** (core MVP, the main value delivery)
- `3–7`: **Master Sprint 2** (post-MVP enhancement)
- `< 3`: **Deferred** (log it in §11's "Deferred / won't-do" list and keep it out of the Master Sprints)

### Phase 3: Dependency mapping

For every Master Sprint 0 and Master Sprint 1 item, trace which downstream features become possible (or required) once it ships. Two kinds of dependency matter:

- **Hard dependency**: feature B cannot start without feature A (checkout needs cart, cart needs catalog).
- **Soft dependency**: feature B is buildable without A but pointless or low-value without it (push notifications without an account system).

This feeds §5 (blocking features), §6 (hidden dependencies) and §8 (cascade graph) in the output.

### Phase 4: Hidden-dependency detection

Find features that share an entity in the data map but live in different epics in the feature map. These couplings cause the "we have to redesign the schema" surprises in the middle of a sprint.

Look for an entity that appears in more than one feature card, a state machine consumed by more than one flow, an external integration referenced by more than one feature, and a business rule (especially a permission or role rule) cited in several places. Flag every one of them whatever its priority, because each is a silent integration cost.

---

## Output structure

Write `.context/master-implementation-plan.md` with the sections below, in this order.

**Tone**: conversational, senior engineer, second person ("you will want to ship X before Y because..."). The reader is a tech lead onboarding to the project, so guide them. Use the same feature and flow names as the data map and the feature map.

**Leave out**: feature catalogs (they live in the feature map), flow diagrams (the data map), per-story implementation plans (`/sprint-development`), API endpoint definitions (the API map in `business-api-context`, or `api/openapi-types.ts`), code snippets, payloads and fixtures.

### 0. Header block

```markdown
> **Generated by**: skill `project-context` mode `master-plan`
> **Last update**: YYYY-MM-DD
> **Derived from**: data map (`business-data-context`), feature map (`business-feature-context`, if generated), PRD, SRS, git log
> **Update frequency**: Re-run when scope shifts, after major architectural decisions, when a Master Sprint 0 / Master Sprint 1 feature ships, or at the start of each quarter / milestone.
```

### 1. Visual header

An ASCII box with the project name and a one-line intent ("What to implement in this system, in what order, and why").

### 2. Executive value/priority map

A narrative paragraph (3 to 5 sentences) that frames the system's biggest value-unlock features and the foundational work under them, followed by:

```markdown
| Priority        | Feature                        | Why it matters                              | Unlocks / Depends on                    |
| --------------- | ------------------------------ | ------------------------------------------- | --------------------------------------- |
| Master Sprint 0 | Auth & account model           | Every gated feature waits on this           | Unlocks: checkout, profile, billing     |
| Master Sprint 0 | Catalog / domain core entities | Schema for the main domain object           | Unlocks: search, listing, checkout      |
| Master Sprint 1 | Checkout & payment             | Primary revenue path                        | Depends on: auth, catalog, payments API |
| Master Sprint 1 | Notifications (email)          | Closes the loop on every transactional flow | Depends on: auth, checkout              |
```

Keep it to 7 to 10 rows. Anything below Master Sprint 1 goes to §11's "Deferred / won't-do" list, or to §12 if it needs a spike first.

### 3. What to implement first and why

One subsection per Master Sprint 0 and Master Sprint 1 feature, each with:

- **Why it matters**: the user or business value, and what stays blocked without it. Use product-facing wording, not technical.
- **What it unblocks**: the concrete downstream features that become possible (or pointless) once it ships.
- **Dependencies**: what must exist before it can start (entities, integrations, architectural decisions).
- **How an experienced engineer would scope it**: 3 to 5 prose bullets on the smallest credible MVP slice, the most likely scope creep, and the boundary with the next Master Sprint.

Write prose. No payloads, schemas or endpoint shapes.

### 4. Master Sprint structure (Master Sprint 0 → Master Sprint 1 → Master Sprint 2)

A short prose summary of each Master Sprint: what is in it, what "done" means for it (for example, "Master Sprint 0 is done when an authenticated user can see an empty dashboard backed by real data"), and a rough size signal (number of features, number of weeks, or small / medium / large when estimates are unavailable).

This section shows the shape of the roadmap without committing to dates.

### 5. Features / state machines that block others

Include only items where shipping them unblocks two or more other features, or where shipping them late rots downstream work. For each item:

- Why the dependency is real (a technical reason, not a preference)
- Which downstream features will rework if this lands wrong
- The smallest version that still unblocks the rest (a Master Sprint 0 feature gets no extras)
- How a partial or temporary version (feature flag, stub, mock provider) could unblock parallel work

This is where most of the leverage hides: a tight Master Sprint 0 ships the rest faster.

### 6. Hidden dependencies

Features that share an entity, a state machine, an external integration or a business rule but live in different epics. For each coupling:

- The shared element (entity, machine, integration or rule)
- The features on each side
- What goes wrong if they are designed in isolation (schema rework, double source of truth, permission drift, eventual-consistency races)
- The cheapest coordination point (a shared schema review, one team owning the entity, a contract test)

This section saves the most rework cost, so be specific.

### 7. External integrations roadmap

For each third-party service (Stripe, SendGrid, Auth0, Twilio and so on):

- Which feature first requires it
- What it unlocks once integrated (often more than the feature that triggered it)
- Lead-time concerns (account approval, KYC, sandbox-versus-production drift, rate limits)
- The recommended order: which integration to wire first, which can wait
- An acceptable stand-in during early Master Sprints (mock provider, manual workaround, env-flag stub)

Often the right move is to integrate a service one Master Sprint before the feature that needs it, so the integration is debugged in isolation.

### 8. Implementation dependency cascade

An ASCII cascade graph plus a narrative of the 2 or 3 most critical chains:

```
Auth ──► Account profile ──► Catalog ──► Cart ──► Checkout ──► Payment ──► Order ──► Notifications
  │             │                │         │           │            │          │            │
  └ gates every authenticated flow downstream of this point
```

A Master Sprint 1 feature shipped alone demos well, but the chain ships the value. Spell out the 2 or 3 chains that matter.

### 9. Edge implementation cases

Features with ambiguous scope, pending technical decisions or competing approaches, grouped by theme rather than by feature:

- **Pending architectural decisions** (sync vs async, SQL vs NoSQL for a sub-domain, in-process vs queue, monolith vs split)
- **Scope-ambiguous features** (admin UI vs API-only, multi-tenant vs single-tenant per feature, hard delete vs soft delete)
- **Competing approaches** (build vs buy, framework primitive vs custom, polling vs webhooks)
- **Permission and role boundaries** (which features need RBAC from day one, which can hardcode roles)

For each item, name the project feature most at risk, the cheapest way to defer the decision, and the cheapest way to lock it down.

### 10. Pre-ship checklist (applies to every feature before merging to the production branch, `git_strategy.branches.production` in `.agents/project.yaml`)

Short and action-oriented, 12 items at most, ordered with the most-often-skipped first. Each line is one check phrased as "Verify X is true before merging Y". Examples, to adapt to the project:

```markdown
- Verify the feature's critical paths have automated tests (`/unit-testing`; targets by code type in its `references/test-coverage.md`), or document why they do not.
- Verify env vars consumed by the feature are documented in `.env.example` and `.agents/project.yaml`.
- Verify the feature is wired behind a feature flag if it is part of a partial-Master-Sprint rollout.
- Verify the implementation matches the entity definition in the data map (`business-data-context`; no schema drift).
- Verify external integrations have a documented degradation mode.
- Verify the feature has been demoed against staging before requesting review.
```

No test-case IDs (those live in the TMS, on the QA side) and no code review checklist (that lives in `/sprint-development`'s Code Review stage).

### 11. What is NOT in scope

Name where each excluded topic lives, so the plan does not absorb it:

```markdown
- Per-story implementation plan, file-by-file design → `/sprint-development` Planning stage, written to `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md`
- Feature catalog, CRUD matrix, feature flags → the feature map (`bun run context:map business-feature-context`)
- Flow diagrams and state-machine transitions → the data map (`bun run context:map business-data-context`)
- API endpoint inventory / contracts → `bun run api:sync` + `/project-context api` (when available)
- Formal QA test strategy → out of scope here; a separate QA workflow picks up from `Ready For QA`
- Ticket-level execution order → `.context/dev-roadmap.md` (`/project-context dev-roadmap`)
- Definite delivery dates → out of scope; this plan only orders work, it does not estimate it
- Deferred / won't-do features → list here at the end of this section, do not promote them into Master Sprints
```

Finish §11 with a short "Deferred / won't-do" subsection listing anything explicitly excluded from the MVP, with a one-line reason each (for example, "social login: deferred to Master Sprint 3 after primary auth is hardened"). Making the deferral visible stops it from re-entering scope discussions.

### 12. Implementation gaps

Mandatory. List everything you could not ground in evidence. These are spike candidates:

- Features mentioned in the PRD but missing from the data map (no entity or flow yet)
- Integrations without a documented provider choice
- Architectural decisions implied but never recorded (sync vs async, transport, deployment unit)
- Capacity or performance targets that affect the implementation choice but have no number attached
- If §1.2 triggered the feature-map warning, the same limitation, restated

Phrase each gap as a one-line spike: "Spike: choose payment provider (Stripe vs Adyen) before Master Sprint 1, because it affects checkout, refund, and webhook design."

"I could not verify X" is a better entry than an invented answer.

---

## After generation

- **Cascade to `/project-context dev-roadmap`** (strategy to sequence). After the Master Sprint structure changes, invoke `/project-context dev-roadmap` so the ticket-level roadmap reconciles against the new grouping. The two documents sit at different altitudes: this one says why the epics run in this order, `dev-roadmap.md` says which ticket is next and what unblocks it. Skip the cascade only when no stories or links exist yet.
- **Key paths pointer.** The shared Key paths in `.agents/instructions/agent-context-map.md` already name `.context/master-implementation-plan.md`. Only when this project's copy lacks it, add it to `.agents/instructions/agent-project.md` (`## Key paths (this project)`). Do not write it into `AGENTS.md`, a shared section or the `CLAUDE.md` shim.
- **UPDATE mode.** Show the diff summary and wait for explicit confirmation before overwriting. Highlight changes that promote or demote a feature across Master Sprints, since those deserve the most attention.
- Report:
  - Master Sprint 0 features identified: N
  - Master Sprint 1 features identified: N
  - Hidden dependencies flagged: N
  - External integrations mapped: N
  - Implementation gaps / spikes open: N
  - Adopted app only: baseline modules recognized as shipped: N
- If §1.2 warned, remind the user to run `/project-context features` and re-run this command.
- If any §12 spike is rated "blocks Master Sprint 0", call it out in the report. It needs a decision before the plan is actionable.

---

## With nobody at the keyboard

The data map gate (§1.1) and the UPDATE confirmation are the two points where this command waits for a person. Decision rules live in `agentic-dev-core/references/decision-protocol.md`.

- Data map missing: stop and report. Generating the data map is a separate mode, and a plan without it is not allowed.
- UPDATE mode: write the candidate next to the existing file (never over it), include the diff summary in the report, and leave the overwrite to the owner. A delegating brief that already approves the overwrite replaces that wait.

---

## Rules / constraints

- Keep this plan strategic: file-level detail goes to `/sprint-development`, and dates stay out because order matters here and estimates do not belong.
- Prose first, tables when they help, ASCII when narrative cannot carry the structure. The only code blocks are the cascade graph and the markdown examples shown above.
- Every other rule of this command (evidence for each priority, the data map gate, the UPDATE confirmation) sits in the section that applies it.
