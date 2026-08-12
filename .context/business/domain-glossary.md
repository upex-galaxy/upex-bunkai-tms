# Bunkai Domain Glossary

> **Single source of truth for domain terminology.** Any document, Jira issue, UI copy, or commit that uses one of these terms MUST match the definition here. When in doubt, this file wins over memory, intuition, or older docs.
>
> Canonical upstream: the `agentic-qa-boilerplate` skills (`test-automation`, `test-documentation`, `sprint-testing`) at `/Users/ely/Desktop/projects/boilerplates/agentic-qa-boilerplate/.claude/skills/`. Bunkai (the product) is the TMS materialization of that methodology.
>
> Maintained alongside: `business-data-map.md` (data model), `project-dev-guide.md` (dev guide), `.context/PRD/`.
>
> **Last full code-sync: 2026-08-12** against `origin/staging@4924f48` — every controlled vocabulary below was re-read from the live migrations, API routes and rendered UI strings, not from memory. Terms marked *(not yet shipped)* are recorded ahead of implementation per §6.1 and carry their ticket key. §5 records vocabulary that is genuinely inconsistent in shipped code and has not been ruled on yet — read it before assuming a rendered string is canonical.

---

## 0. The ATC clarification — read this first

**ATC = Acceptance Test Case.** It does NOT stand for "Atomic Test Component".

The confusion is understandable and worth recording so it never recurs:

- An ATC, when automated, has an **atomic architecture** (precondition + action bundled as one indivisible mini-flow), and
- in KATA it is implemented as a decorated method of a **Component** (Domain Component layer).

So "atomic" and "component" are *properties of how an ATC is implemented*, not its name. The acronym itself has always meant **Acceptance Test Case** — the industry-rooted term within the IQL strategy.

> Canonical sentence (test-automation skill, `references/kata-architecture.md` §6):
> "An ATC (Acceptance Test Case) is a **complete test case (mini-flow), not a single interaction**. Each ATC maps 1:1 to a ticket via `@atc('TICKET-ID')`."

Remediation status: wrong expansion corrected across Jira content and repo docs on 2026-06-10.

---

## 1. Core acronyms

| Acronym | Expansion | One-line definition |
| --- | --- | --- |
| **ATC** | Acceptance Test Case | Reusable, atomic unit of verification: precondition + action + assertions, mandatorily anchored to a User Story and ≥1 Acceptance Criterion. The heart of Bunkai. |
| **KATA** | Component Action Test Architecture | Layered test-automation architecture (TestContext → Base → Domain Components → Steps → Fixtures) where ATCs live as decorated component methods. Named after the martial-arts *kata* — Bunkai (分解) is literally "the art of breaking down a kata into its applications". |
| **IQL** | Integrated Quality Lifecycle | The professional QA methodology that integrates planning, documentation, execution, and reporting into one traceable lifecycle. KATA is its automation arm. |
| **US** | User Story | The requirement under test. Anchors all test work to product intent. |
| **AC** | Acceptance Criterion | Atomic, testable condition of a US. The provenance unit ATCs bind to (M:N). |
| **ATP** | Acceptance Test Plan | Stage-1 artifact: test analysis, risk, scenarios, AC→TC coverage map for one US. |
| **ATR** | Acceptance Test Results | Stage-3 artifact: execution outcomes, evidence, findings, per-TC status for one US. |
| **TC** | Test Case | TMS entity validating a single behavior: precondition + steps + expected results. In Bunkai, a Test is an ordered chain of ATCs. |
| **TMS** | Test Management System | The product category Bunkai belongs to. |
| **PAT** | Personal Access Token | Bearer credential a CLI or AI agent uses to call the API as a workspace member. Issued from Settings, scoped (§3), revocable. Say "PAT" or "Personal Access Token" — never bare "token", which also names magic-link and invite tokens. |
| **EP / BVA** | Equivalence Partitioning / Boundary Value Analysis | Two of the five test-design techniques an ATC may be classified by (§2, *Test-design technique*). Spell them out on first use in any document; the abbreviations are for tables and column headers. |

---

## 2. Methodology terms (IQL / KATA)

| Term | Definition | Source |
| --- | --- | --- |
| **KATA layers** | 1 — TestContext (global utilities); 2 — Base Components (`ApiBase`, `UiBase`); 3 — Domain Components (business logic holding ATCs); 3.5 — Steps (reusable precondition chains); 4 — Fixtures (DI entry points). Higher layers may use lower layers, never the reverse. | `test-automation/references/kata-architecture.md` §1 |
| **Component (KATA)** | A Domain-layer class bundling related ATCs: `{Resource}Api extends ApiBase` or `{Page}Page extends UiBase`. One component per file; max ~15–20 ATCs per component. | `kata-architecture.md` §5 |
| **TC Identity rule** | A TC is defined by exactly two elements: precondition (state) + action (trigger). Every expected result from the same precondition + action is an assertion of the *same* TC. This is the "atomic" property. | `kata-architecture.md` §2 |
| **Steps (layer 3.5)** | Reusable chains of 3+ ATCs used as preconditions. Not `@atc`-decorated, not reported to the TMS individually. | `kata-architecture.md` §8 |
| **Fixture** | Dependency-injection entry point exposing components to tests (`ApiFixture`, `UiFixture`, `StepsFixture`, `TestFixture`). Lazy: API tests never open a browser. | `kata-architecture.md` §7 |
| **Traceability (methodology sense)** | Bidirectional linkage US ↔ ATP ↔ ATR ↔ TC: given any one artifact you can navigate to the other three. Broken traceability renders a TC unmaintainable. **Not the same chain as the shipped Traceability screen** — see *Traceability chain (product sense)* in §3, and the disambiguation row in §4. | `tms-architecture.md` §3–4 |
| **Test-design technique** | The analysis method that produced a test case, and therefore the argument for why it exists. Bunkai's controlled set is exactly five: **Equivalence Partitioning**, **Boundary Value Analysis**, **State Transition**, **Decision Table**, **Pairwise**. Recording it is what lets coverage be *assessed* rather than merely counted — "this module has forty cases but not one boundary case" is a question a case count cannot answer. Always write the full name in specs, ACs and Jira content; `EP` / `BVA` (§1) are for table headers only. *(not yet shipped — vocabulary introduced by BK-399, which adds the field to `atcs`; see §3.)* | BK-399 decision comment `12298`; IQL test-analysis practice |
| **Workflow Status (TC)** | Where a TC sits in its documentation/automation lifecycle: Draft → In Design → Ready → Manual / In Review → Candidate → In Automation → Pull Request → Automated → Deprecated. Persists across runs. | `tms-conventions.md` §4 |
| **Execution Status (Run)** | Did the TC pass its last run: TODO / EXECUTING / PASS / FAIL / ABORTED / BLOCKED. Per-run, independent from Workflow Status ("Automated" + "FAIL" is a valid combination). | `tms-conventions.md` §4 |
| **ROI (automation)** | `(Frequency × Impact × Stability) / (Effort × Dependencies)`. Drives the Candidate / Manual / Deferred verdict for each TC. | `tms-conventions.md` §9 |
| **Smoke test** | Rapid Go/No-Go gate run first in execution: env health + critical paths (~10–20% of suite). Smoke failure is a hard blocker. | `sprint-testing/SKILL.md` gotcha #4 |
| **TC naming** | `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>` — e.g. `BK-101: TC1: Validate successful login with valid credentials`. | `tms-conventions.md` §2 |
| **End-to-End (E2E) Test** | An *assembled* test artifact: a continuous chain of ATCs that traverses a complete user journey from point A to point B (positive, alternative, or negative path). Think LEGO: each brick is an ATC; the built model is the E2E test. In Bunkai it materializes as a **Test** (ordered chain of ATC references). Lives in `tests/e2e/**` in KATA. | `kata-architecture.md` §1 (Tests layer); user clarification 2026-06-10 |
| **Integration Test** | Same assembled nature as an E2E test (a chain of ATCs), but its objective is validating the interaction *between* components/services (API ↔ DB, service ↔ service) rather than a full user journey. Lives in `tests/integration/**` in KATA. | `kata-architecture.md` §1; user clarification 2026-06-10 |
| **Path semantics (positive / alternative / negative)** | Every assembled test (E2E or integration) walks one path toward its objective: the happy route (positive), a valid detour (alternative), or a failure route (negative). The ATCs chosen are the "stepping stones" that realize that specific path. | user clarification 2026-06-10 |
| **Defect vs Bug** | Defect = any deviation from specification (formal artifact). Bug = a defect discovered during test execution; triaged (severity, root cause) before filing. Blocking bugs pause execution; non-blocking are logged and the pass continues. | `sprint-testing/SKILL.md` gotcha #10 |

---

## 3. Bunkai product entities (data model)

Authoritative detail: `business-data-map.md`. Short forms here for terminology consistency.

| Entity | Definition |
| --- | --- |
| **Workspace** | Multi-tenant root. Owns Projects and membership. |
| **Project** | Container of Modules, Stories, ATCs, Tests, Runs, Bugs inside a Workspace. |
| **Module** | First-class tree node (depth ≤ 6) partitioning features. Coverage rollups and defect heatmaps aggregate by Module — it is *not* a folder name. |
| **User Story (US)** | Markdown-bodied requirement, optional `external_id` (Jira key). Has 1..N ACs. Carries the **Ready-to-Test gate** (`user_stories.status`: `draft` \| `ready_to_test`) — the explicit signal that the story's ACs are settled enough to author ATCs against. Rendered as the "Draft" / "Ready to test" badge with a "Mark ready to test" action. It is a *gate*, not a workflow: there are exactly two states and no intermediate. |
| **Acceptance Criterion (AC)** | Atomic, sortable, Markdown-bodied testable behavior of a US. |
| **ATC** | Acceptance Test Case: title, layer (`UI \| API \| Unit`), tags, ordered `atc_steps`, ordered `atc_assertions`, plus `atc_acceptance_criteria` M:N join binding it to ≥1 AC. Orphan ATCs are rejected at the schema-constraint level. Unit of *authorship*. |
| **Test** | Named container owning an **ordered chain of ATC references** (`test_steps`: test_id + atc_id + position). References, not copies → "one-edit-many-tests". A chain is a *sequence, not a set*: the same ATC may appear at more than one position, so each chain row carries its own surrogate **step_id** (see *Chain step*). Unit of *execution*. |
| **Chain step (`test_step`)** | One position in a Test's ATC chain: a surrogate `step_id` (`test_steps.id`) + the referenced `atc_id` + its `position`. The **step_id is the stable per-row handle** — the identifier used to reorder, address, or key a chain row — *not* the `atc_id`, because the same `atc_id` may legally repeat at several positions. "Reorder the chain" means permuting `step_id`s; the run order is the resulting sequence of `atc_id`s. |
| **Run** | One execution instance of a Test against an environment (executor: human / agent / ci). Snapshots step content (`run_atcs`, `run_steps`) so editing an ATC later never corrupts history. |
| **Project Environment** | A named deployment target a Run executes against (e.g. Staging, Production), scoped to a single Project (`project_environments`). Names are unique per Project (case-insensitive), 1–50 chars after trim; seeded **Staging** + **Production** per Project. Managed (add / rename / remove) from the project explorer rail (BK-148); removal is blocked while any Run references it, preserving run history. Prose form "environment" / "Project environment"; code form `project_environments` / `environment_id`. |
| **Bug** | Native defect record anchored to Module + ATC + Run — lives inside the test cycle, not delegated to Jira (optional one-way Jira sync). Carries a **Severity** and a **Status lifecycle**, both below. |
| **Bug Severity** | Stored as `P1` \| `P2` \| `P3` \| `P4` (`bugs.severity`), but **rendered everywhere as words**: `P1` = **Critical**, `P2` = **Major**, `P3` = **Minor**, `P4` = **Trivial**. Both forms are canonical in their own layer — use the `P`-codes in API contracts, schema talk and Jira field values; use the words in UI copy, ACs and anything a reader reads as prose. Never invent a third scale (no "Blocker", no "High"). |
| **Bug Status lifecycle** | `open` → `in_progress` → `resolved` → `closed` (`bugs.status`). **One stage forward at a time, never backward** — enforced procedurally, not by a CHECK constraint, so it is a rule a reviewer must hold rather than one the database refuses. Rendered "Open" / "In progress" / "Resolved" / "Closed", with exactly one forward action offered per state ("Start progress" / "Mark resolved" / "Close"). Distinct from the *Run* statuses (§2, and the grain split below) — a Bug is not a run outcome. |
| **Traceability chain (product sense)** | The evidence chain the shipped Traceability screen assembles for one User Story: **AC → ATC → Test → Run → Defect**. This is a *different chain* from the methodology-sense Traceability in §2 (US ↔ ATP ↔ ATR ↔ TC); both are correct, they answer different questions, and neither is a typo for the other. When the word could mean either, name the chain explicitly. Gap states it renders: **Uncovered** (an AC with zero bound ATCs), **No test written yet**, **No run recorded yet** — three distinct absences that must not be collapsed into one "missing". |
| **Coverage: "uncovered" vs "not run"** | The load-bearing distinction on the Coverage screen and the Home coverage KPI. **Uncovered** = an AC with nothing bound to it at all (an authoring gap). **Not run** = an AC that *is* bound to an ATC, but no Run has ever executed it (an execution gap). They have different owners and different fixes, so a report that merges them into "not covered" is wrong. Third state is fully covered: bound and executed. |
| **Recovery Cycle** | Per-User-Story elapsed time from its first failing terminal Run to the first subsequent all-passing terminal Run — how long a broken story stayed broken. Reported as `median_recovery_seconds` on the project Metrics screen ("Recovery cycle by user story"). It measures *repair latency*, not defect count: a project can have few bugs and terrible recovery cycles. Never shorten to "recovery" alone. |
| **Defect Heatmap** | Per-Module defect density over a rolling window (`7d` \| `30d` \| `90d`, default `30d`) with a week-over-week trend. Density is classified into four **heat buckets**: **Clean** (0), **Low** (≤2), **Elevated** (≤4), **Hotspot** (>4 defects in the window). Trend renders as **Rising** / **Falling** / **Flat**. The heatmap is why Module is a first-class tree node rather than a folder name (§3, *Module*). |
| **Reserved suite tag** | A Test's tag set has a closed, case-normalized reserved vocabulary of exactly three values — `smoke`, `sanity`, `regression` — which are lowercased on write and surfaced as the "Suites:" quick-add control. Free custom tags coexist with them and preserve their casing. The reserved three name *when a suite runs*; they are not a general taxonomy, and `e2e` / `integration` / `functional` are deliberately NOT among them (those describe an assembled test's nature — see §2). Distinct from the methodology term **Smoke test** in §2, which is the practice; this is the product's tag. |
| **Personal Access Token (PAT)** | Bearer credential for CLI and AI-agent access, issued and revoked from Settings. Scoped to a closed set of four: `atc:read`, `atc:write`, `run:execute`, `workspace:admin`. A PAT acts as the issuing member and can never exceed that member's own permissions. |
| **Import Job** | An asynchronous one-way import of Jira issues into a Project, polled rather than awaited. Lifecycle: `queued` → `running` → `completed` \| `failed`. One-way by design — Bunkai reads from Jira here; it never writes back through this path (defect sync to Jira is a separate, also one-way, capability under BK-371/372/373). |
| **Activity event** | An entry in the workspace Activity Stream, named with a dotted `entity.verb` vocabulary (`module.renamed`, `module.moved`, `module.archived`, `atc.created`, `test.created`, `test.reordered`, `run.finished`, `run.aborted`, `bug.assigned`, `bug.reassigned`, `bug.unassigned`, `bug.status_changed`, …). **Finer-grained than, and not reconciled with, the Notification *Event Type*** (below), which groups events into three coarse categories for delivery preferences. Two vocabularies, two purposes: Activity events are the audit record, Event Types are the subscription unit. |
| **Command Palette** | The keyboard-driven overlay (⌘K) for searching and jumping across the workspace from any screen. First cut spans the six entity types with shipped routes: ATCs, Tests, Projects, Modules, Bugs, Runs. It is an *overlay on the app shell*, not a screen — it has no route and no mockup of its own. Say "command palette", never "search bar" (which names the ATC Library's in-page filter) and never "omnibox". *(shipped today only as a non-functional stub; BK-398 makes it work.)* |
| **ATC Priority** | Per-ATC importance: **Critical** \| **High** \| **Medium** \| **Low**, optional (an unset ATC displays an explicit "not specified", never a default). Answers "which cases must run when there is no time to run them all". **Not** Bug Severity (§3) and **not** Jira's own priority field — three different scales that must never be cross-quoted. *(not yet shipped — BK-399.)* |

Post-MVP entities (epics BK-201 / BK-208 / BK-210 / BK-221 / BK-224), added 2026-07-11:

| Entity | Definition |
| --- | --- |
| **Test Plan** | Named grouping of Tests inside a Project for a goal, cycle, or release. Membership is curated — a Test may belong to multiple plans. Progress is derived from members' latest run outcomes. Closing a plan captures an outcome summary and makes it read-only. **Not the ATP** (Acceptance Test Plan, §1) — the ATP is the per-US QA documentation artifact; a Test Plan is the TMS grouping entity. Never shorten either to bare "plan" (see §4). |
| **Milestone** | Named goal with a target date inside a Project. Intended to aggregate Test Plans, with readiness derived from plan progress — **that aggregation is not built yet** (it arrives with BK-206), so a shipped Milestone today shows "No test plans attached". Its date chip renders **"Due today" / "N days left" / "N days past target"**, deliberately **not** "Overdue": readiness cannot be computed until Test Plans exist, so the UI states the date fact rather than asserting a judgement it cannot support. This is a ratified departure from the mockup (master-design-plan §5, D25) — do not "fix" it back to "Overdue". |
| **Notification** | Record of a workspace event delivered to a member's inbox. Respects entity visibility (RLS) — a member is never notified about entities they cannot see. |
| **Notification Inbox** | Per-user list of Notifications with unread state. |
| **Event Type** | Category of notifiable event: run lifecycle, bug lifecycle, mention. |
| **Email Digest** | Periodic email summarizing a member's unread Notifications. |
| **Channel** | Real-time conversation space scoped to a Workspace or a Project. Visibility follows membership. |
| **Message** | Single chat entry authored by a member inside a Channel. Editable by its author for 15 minutes; deletion leaves a deleted-message placeholder. |
| **Mention** | @-reference to a member inside a Message. Triggers a Notification. |
| **Rich Link** | Entity reference (ATC / Test / Run) rendered in chat as a card with title + status. Permission-aware: resolves only for members who can see the entity. |
| **Execution Mode** | How a Run was executed: `manual` \| `automated`. |
| **Automation Status** | Per-Test attribute: `manual-only` \| `candidate` \| `automated`. Deliberately **simpler than the Workflow Status (TC)** lifecycle (§2, Draft → In Design → … → Deprecated) — that lifecycle governs the QA-side documentation/automation process of a TC; Automation Status is the coarse product-layer flag on a Test. Do not conflate the two. |
| **CI Results File** | Machine-readable test-results report produced by a CI pipeline (e.g. JUnit XML), uploadable to create an automated Run. |
| **Billing Plan (Tier)** | Workspace subscription level. The **shipped** value set on `workspaces.plan` is `community` \| `cloud` \| `enterprise` — those are the literals in the schema and the API contract, and they are what any code or spec must use. The names "Free / Team / Enterprise" appear nowhere in the product and were an earlier naming idea recorded here in error until 2026-08-12; do not reintroduce them. Always say "Billing Plan" or "Tier" — never bare "Plan", which collides with **Test Plan** (see §4). |
| **Seat** | One active workspace member counted against the Tier limit. |
| **Subscription** | The workspace's active paid arrangement: renewal date, payment method. |
| **Invoice** | Billing document for one charge period, downloadable. |
| **status_dot** | Design/mockup term for the coloured dot that renders a row's Execution Status (§2) in tree, list, and autocomplete surfaces. Its values are the execution set `pass \| fail \| blocked \| skipped \| running \| unrun`. It is a presentation affordance, not a data field: it names a dot, not a lifecycle, and it does not appear as an API field name — APIs expose the underlying value as `status`. No documentation-maturity lifecycle exists on `atcs` or `tests`. Recorded 2026-08-06 with the BK-187 decision. |
| **Run-status grain split** | Three distinct run-status enumerations coexist at three different grains, and none of them is wrong — the defect was that the split was never labelled. **Run grain** (`runs.status`, the whole execution): `running \| passed \| failed \| aborted`. **Position grain** (`run_atcs.status`, one chain step within a run): `pending \| passed \| failed \| blocked \| skipped`. **Derived traceability state** (the chain-view's rendered chip, combining both): `in_flight \| aborted \| passed \| failed \| blocked \| skipped`. Invariant: `aborted` is a **run-grain terminal outcome only** — it names the whole execution's anomalous termination and never appears at the position grain (a step is `skipped`, never `aborted`). §2's "Execution Status (Run)" and this table's `status_dot` row each describe one grain correctly on their own terms; neither is a typo needing to converge with the other. Do not attempt to harmonise the KATA/IQL methodology vocabulary (`tms-conventions.md`'s `TODO \| EXECUTING \| PASS \| FAIL \| ABORTED \| BLOCKED`) with this product-schema split — that is a separate, larger question, out of scope here. Recorded 2026-08-08 with the BK-317 decision (root cause of BK-45 AC-01 shipping an incomplete run-status list). |

---

## 4. Anti-glossary — terms to never use

| Wrong | Right | Why it's wrong |
| --- | --- | --- |
| "Atomic Test Component" | **Acceptance Test Case** | Misexpansion of ATC. Atomicity and component-hood are implementation properties (see §0). |
| "Komponent Action Test Architecture" | **Component Action Test Architecture** | Spelling drift from an early design chat (`.context/designs/.../chats/chat1.md`, 2026-05-11). The boilerplate skill — the canonical source — spells it "Component"; the K in KATA comes from the martial-arts term *kata*, mirrored by the brand name Bunkai. |
| "test case" for an ATC chain | **Test** | In Bunkai a Test is the chain; the chained units are ATCs. Keep the two words distinct. |
| "test component" | **ATC**, **end-to-end test**, or **integration test** — by context | Ambiguous and generic ("a component of testing" says nothing). If the sentence means the minimal atomic unit that satisfies an AC → **ATC**. If it means the assembled chain walking a journey → **end-to-end test** or **integration test**. Never leave "test component" in specs, ACs, or Jira content. |
| "reorder a Test by ATC" / "reorder the `atc_id`s" | **reorder the chain by step_id** (chain-step handle) | A Test chain may hold the same `atc_id` at several positions, so an `atc_id` cannot identify a single row. Reorder addresses rows by **step_id** (`test_steps.id`). Speak of `atc_id` only for the resulting *run order*, never as the reorder handle. Recorded during BK-28 (chain reorder). |
| bare "plan" / "Plan" | **Test Plan**, **Billing Plan (Tier)**, or **ATP** — by context | Three distinct concepts collide on the word: the TMS grouping of Tests (Test Plan, §3), the workspace subscription level (Billing Plan / Tier, §3), and the per-US QA artifact (ATP, §1). Bare "plan" in specs, ACs, or Jira content is ambiguous — always use the full term. Recorded 2026-07-11 with the post-MVP entities (BK-201/208/210/221/224). |
| `status_dot` as an ATC lifecycle enum (`draft` / `ready` / `automated` / `deprecated`) | **Execution Status**, exposed in APIs as `status` | No ATC documentation-lifecycle column exists in the schema, and `status_dot` appears in zero lines of shipped code. The four-value set originated in a BK-20 refinement comment (2026-06-01, T4) that mis-attributed it to the 8-state **Workflow Status (TC)** (§2). It blocked BK-20 for five weeks. Recorded 2026-08-06 with the BK-187 decision. |
| Billing tiers "Free / Team / Enterprise" | **`community` / `cloud` / `enterprise`** | The shipped `workspaces.plan` CHECK constraint and the API contract both use the second set; the first appears in zero lines of the product. This glossary itself carried the wrong set until 2026-08-12 — quoting it from an old copy of this file is the likely way it comes back. Recorded 2026-08-12 with the full code-sync. |
| bare "Traceability" where the chain matters | **"Traceability chain (AC → ATC → Test → Run → Defect)"** or **"US ↔ ATP ↔ ATR ↔ TC traceability"** — by context | Two real, different chains share the headword: the methodology linkage (§2) and the chain the shipped Traceability screen assembles (§3). Neither is wrong and neither is a typo for the other, so a sentence that just says "traceability" leaves the reader to guess which evidence path is meant. Recorded 2026-08-12. |
| "Overdue" on a Milestone | **"N days past target"** (or "Due today" / "N days left") | Readiness cannot be computed until Test Plans ship (BK-206), so the UI states the date fact instead of asserting a judgement it cannot support. This is a ratified departure (master-design-plan §5, D25), not a defect to correct back toward the mockup. Recorded 2026-08-12. |
| "not covered" as a single coverage state | **"uncovered"** (nothing bound) or **"not run"** (bound, never executed) — they are different | An authoring gap and an execution gap have different owners and different fixes. Merging them produces a report nobody can act on. Recorded 2026-08-12. |
| bare "token" | **PAT**, **magic-link token**, or **invite token** — by context | Three unrelated credentials in this product answer to "token", two of them security-sensitive in different ways. Recorded 2026-08-12. |
| "priority" without a subject | **ATC Priority**, **Bug Severity**, or **Jira priority** — by context | Three distinct scales: `Critical/High/Medium/Low` on an ATC (§3), `P1–P4` rendered `Critical/Major/Minor/Trivial` on a Bug (§3), and the tracker's own field. "Critical" alone is ambiguous across the first two. Recorded 2026-08-12 with BK-399. |

---

## 5. Known UI vocabulary drift — measured, not yet ruled on

Recorded 2026-08-12 from a full read of shipped UI strings at `origin/staging@4924f48`. These are cases where **the same concept renders as different words on different screens**. None is a §4 violation — no wrong term is in use — so none is listed above as banned. They are here so nobody "fixes" one side into the other without noticing it is a two-sided choice, and so a future ruling has the inventory it needs.

| Concept | Renders as | Where |
| --- | --- | --- |
| `runs.executor_mode = 'human'` | **"Human"** vs **"Manual"** | "Human" in Run History and the project Run report; "Manual" on the Home active-runs panel. Note "Manual" additionally collides with **Execution Mode** (§3, `manual` \| `automated`), which is a different field — so "Human" is the safer of the two, but the call has not been made. |
| Terminal run/step verdicts | **"Passed" / "Failed"** vs **"Pass" / "Fail"** | Long form on the runner and in activity copy; short form on the traceability chain chip and the per-step mark buttons. Arguably correct as-is: the buttons are imperatives ("Pass" = *do this*), the badges are states ("Passed" = *this happened*). |
| `run_atcs.status = 'pending'` | **"Unrun"** | The verdict badge renders "Unrun" for the stored value `pending`. This is deliberate and it matches how a QA engineer actually speaks ("that step is unrun"), but it means the spoken word and the stored literal differ — quote `pending` in schema and API talk, "Unrun" in UI copy. |
| An AC bound to an ATC but never executed | **"awaiting execution"** vs **"Never run"** | "awaiting execution" on the Home coverage summary; "Never run" on the project Coverage screen. The code itself carries a comment flagging this pair as unreconciled. |

**Rule while these stand unruled**: in *new* specs, ACs and Jira content, use the term this glossary defines in §3 (`uncovered` / `not run`, Execution Status values, PAT, and so on), not whichever string a particular screen happens to render. Do not change shipped UI copy to match this table without a ticket — that is a product decision with its own ACs.

---

## 6. Change protocol

1. New domain term or changed meaning → update this file FIRST, in the same PR. A term introduced by a story that has not shipped yet still belongs here, marked *(not yet shipped)* with its ticket key — that is what makes the story's own ACs checkable against a definition.
2. Term used in Jira content (summary, description, custom fields) → keep Jira wording aligned with §1–§3.
3. Disagreement between docs → this glossary wins; if the glossary itself is wrong, fix it via PR with an entry in §4 documenting the deprecated usage.
4. **A controlled vocabulary quoted here is quoted from the live schema, verbatim.** Every value set in §2–§3 was read from a migration or an API contract, not paraphrased. When you add one, cite where you read it; when you doubt one, re-read the migration rather than this file. The "Free / Team / Enterprise" billing tiers sat wrong in §3 for months precisely because nobody re-derived them.
5. Shipped UI copy that disagrees with itself goes in §5, not §4 — §4 is for terms that are *wrong*, §5 is for terms that are merely *inconsistent*. Promoting a §5 row to §4 means a ruling was made; say who made it and when.
