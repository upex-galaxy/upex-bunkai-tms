
# Master Implementation Plan Generator

Generate or update `.context/master-implementation-plan.md` — a business-derived implementation roadmap that answers one question: **what to build in this application, in what order, and why does that order matter?**

**Target**: `$ARGUMENTS` forwarded by the alias or given in the invocation (project path, module filter, epic name, or leave blank for full system)

---

## What this produces

A conversational, senior-engineer-voice document that sits **on top of** the data map (`business-data-context`) and the feature map (`business-feature-context`) and converts them into a ranked implementation strategy.

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

This is **NOT** a story-level implementation plan (→ `/sprint-development` Planning stage), a flow description (→ the data map in `business-data-context`), a feature inventory (→ the feature map in `business-feature-context`), nor the ticket-level execution order (→ `.context/dev-roadmap.md`, `/project-context dev-roadmap`). It is the **implementation-strategy layer** above those maps.

---

## Sources (use ALL available)

| Source                                      | Status                     | What to extract                                                                                                         | Tool                               |
| ------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| The data map (`business-data-context`)      | **HARD REQUIREMENT**       | Critical flows, state machines, automatic processes, integrations, business rules — every feature inherits one of these | `bun run context:map business-data-context` |
| The feature map (`business-feature-context`) | Optional — warn if missing | Feature catalog, CRUD matrix, feature flags, dependency tags, MVP-relevance matrix                                      | `bun run context:map business-feature-context` |
| Existing context                            | If available               | PRD priorities, SRS architecture, user journeys, domain glossary                                                        | `.context/PRD/`, `.context/SRS/`, `.context/business/domain-glossary.md` |
| Git history                                 | If signals needed          | Already-shipped modules (skip), recently-touched modules (in-flight)                                                    | `git log --oneline -90 --stat`     |
| PBI epics                                   | If available               | Existing epic/story breakdowns to align the plan with current backlog                                                   | `.context/PBI/epic-tree.md`, `.context/PBI/epics/EPIC-<KEY>-<slug>/epic.md` (synced cache; `bun run context:hydrate`) |
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

## Existing app (remaining-work framing)

When `.template/installer.lock.json` records `adopted: true`, the app was running before the agentic layer arrived, and most of what the maps describe is already shipped. A plan that scores those features again puts finished work in Master Sprint 0. So, for an adopted app only:

- **The shipped baseline is input, not a candidate.** Features the feature map marks Stable, and flows the data map traces end to end in code, form the baseline. They are never scored and never placed in a Master Sprint; §2 names them in one short "Baseline (already shipped)" table (`Module | Feature-map section id | Why it matters to what remains`) above the priority table.
- **The candidates are what remains**: Beta, Planned and WIP features, partial CRUD rows, discovery gaps the maps flag, the epics open in the tracker, and the debt the maps expose (a table with RLS off, an integration with no degradation mode).
- **Urgency reads the team's roadmap, not an MVP.** In the Phase 2 rubric, "Required for MVP" becomes "required for the next release the tracker or the PRD names"; with neither, say so in §12 and score urgency from the maps alone.
- **Master Sprint 0 is the foundational REMAINING work** (what several remaining features wait on), never a rebuild of the baseline. A remaining item that would change a baseline entity or flow says which section it touches and is flagged in §6 Hidden dependencies.
- **Git history marks what is in flight**: modules touched in recent commits or open branches are "in flight" rows of the remaining work, not baseline.

A greenfield project never takes this path; its plan is the one below unchanged.

---

## Discovery phases

### Phase 1 — Validation gate

#### 1.1 Data map check (HARD)

If `bun run context:map business-data-context` prints the placeholder notice (or fails: the skill is missing) → **STOP** with:

> This command needs a generated data map (`business-data-context`) to reason about dependencies, blocking factors, and value. Run `/project-context data` first, then re-invoke `/project-context master-plan`.

Do not proceed with assumptions. An implementation plan without an entity / flow map is wishlist, not plan.

#### 1.2 Feature map check (SOFT)

If `bun run context:map business-feature-context` prints the placeholder notice → **WARN and proceed**. Log in §12 Implementation gaps:

> The feature-map was not available at generation time. This plan reflects the data map only. Angles missed: per-feature MVP-relevance scoring, CRUD-completeness signals, feature-flag staging, third-party-dependency tagging. Run `/project-context features` and re-run `/project-context master-plan` for the complete picture.

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
- `< 3` → **Deferred** (log in §11's "Deferred / won't-do" list, do not include in Master Sprints)

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

**What NOT to include**: feature catalogs (live in feature-map), flow diagrams (live in data-map), per-story implementation plans (live in `/sprint-development`), API endpoint definitions (live in the API map in `business-api-context` or `api/openapi-types.ts`), code snippets, payloads, fixtures.

### 0. Header block

```markdown
> **Generated by**: skill `project-context` mode `master-plan`
> **Last update**: YYYY-MM-DD
> **Derived from**: data map (`business-data-context`), feature map (`business-feature-context`, if generated), PRD, SRS, git log
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

Cap at 7–10 rows. Anything below Master Sprint 1 goes to §11's "Deferred / won't-do" list, or to §12 if it needs a spike first.

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

### 10. Pre-ship checklist (applies to every feature before merging to the production branch, `git_strategy.branches.production` in `.agents/project.yaml`)

Short, action-oriented. No more than 12 items. Ordered by what is most often skipped first. Each line is one check phrased as "Verify X is true before merging Y". Examples (adapt to the project):

```markdown
- Verify the feature's critical paths have automated tests (`/unit-testing`; targets by code type in its `references/test-coverage.md`), or document why they do not.
- Verify env vars consumed by the feature are documented in `.env.example` and `.agents/project.yaml`.
- Verify the feature is wired behind a feature flag if it is part of a partial-Master-Sprint rollout.
- Verify the implementation matches the entity definition in the data map (`business-data-context`; no schema drift).
- Verify external integrations have a documented degradation mode.
- Verify the feature has been demoed against staging before requesting review.
```

No TC IDs (those live in the TMS / QA side). No code review checklist (that lives in `/sprint-development`'s Code Review stage).

### 11. What is NOT in scope

Explicit delegation to stop scope creep into this plan:

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

Finish §11 with a short "Deferred / won't-do" subsection listing anything explicitly **excluded** from the MVP plus a one-line reason (e.g. "social login — deferred to Master Sprint 3 after primary auth is hardened"). The point is to make the deferral **visible** so it stops re-entering scope discussions.

### 12. Implementation gaps

MANDATORY. List anything you could not ground in evidence — these are spike candidates, not unknowns to ignore:

- Features mentioned in the PRD but missing from the data map (no entity / flow yet)
- Integrations without a documented provider choice
- Architectural decisions implied but never recorded (sync vs async, transport, deployment unit)
- Capacity / performance targets that affect implementation choice but have no number attached
- If §1.2 triggered the feature-map warning, restate the limitation here

Each gap should be phrased as a one-line spike: "Spike: choose payment provider (Stripe vs Adyen) before Master Sprint 1 — affects checkout, refund, and webhook design."

"I could not verify X" is better than inventing an answer.

---

## After generation

- **Cascade to `/project-context dev-roadmap`** (strategy → sequence): after the Master Sprint structure changes, invoke `/project-context dev-roadmap` so the ticket-level execution roadmap re-reconciles against the updated Master Sprint grouping. This is the strategy→sequence handoff — the two docs live at different altitudes (this one = "why this epic order"; `dev-roadmap.md` = "what ticket next + what unblocks it"). Skip only if no stories/links exist yet (nothing to sequence).
- Key paths pointer: the shared Key paths in `.agents/instructions/agent-context-map.md` already name `.context/master-implementation-plan.md`. Only when this project's copy lacks it, add it to `.agents/instructions/agent-project.md` (`## Key paths (this project)`); never write it into `AGENTS.md`, a shared section or the `CLAUDE.md` shim.
- In UPDATE mode: show diff summary, wait for explicit confirmation before overwriting. Highlight changes that promote / demote a feature across Master Sprints — those are the high-attention deltas.
- Report:
  - Master Sprint 0 features identified: N
  - Master Sprint 1 features identified: N
  - Hidden dependencies flagged: N
  - External integrations mapped: N
  - Implementation gaps / spikes open: N
  - Adopted app only: baseline modules recognized as shipped: N
- If §1.2 warned, remind the user to run `/project-context features` and re-run this command.
- If any §12 spike is rated as "blocks Master Sprint 0", call it out explicitly in the report — these need a decision before the plan is actionable.

---

## Rules / constraints

- Never auto-overwrite an existing `.context/master-implementation-plan.md`. UPDATE mode always pauses for confirmation.
- Never invent priorities. Every Master Sprint 0 / Master Sprint 1 claim cites a data-map flow, a feature-map row, a PRD priority, or a named integration constraint.
- Never collapse this plan into a story-level plan. If the reader needs file-level detail, point them at `/sprint-development`.
- Never include dates. Order matters; estimates do not belong here.
- If the data map is not generated, STOP — the hard gate is non-negotiable.
- Prose first, tables when they help, ASCII when narrative cannot carry the structure. No code blocks beyond the cascade graph and the markdown table examples shown above.
