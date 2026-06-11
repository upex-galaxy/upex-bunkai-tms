# Bunkai Domain Glossary

> **Single source of truth for domain terminology.** Any document, Jira issue, UI copy, or commit that uses one of these terms MUST match the definition here. When in doubt, this file wins over memory, intuition, or older docs.
>
> Canonical upstream: the `agentic-qa-boilerplate` skills (`test-automation`, `test-documentation`, `sprint-testing`) at `/Users/ely/Desktop/projects/boilerplates/agentic-qa-boilerplate/.claude/skills/`. Bunkai (the product) is the TMS materialization of that methodology.
>
> Maintained alongside: `business-data-map.md` (data model), `project-dev-guide.md` (dev guide), `.context/PRD/`.

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

---

## 2. Methodology terms (IQL / KATA)

| Term | Definition | Source |
| --- | --- | --- |
| **KATA layers** | 1 — TestContext (global utilities); 2 — Base Components (`ApiBase`, `UiBase`); 3 — Domain Components (business logic holding ATCs); 3.5 — Steps (reusable precondition chains); 4 — Fixtures (DI entry points). Higher layers may use lower layers, never the reverse. | `test-automation/references/kata-architecture.md` §1 |
| **Component (KATA)** | A Domain-layer class bundling related ATCs: `{Resource}Api extends ApiBase` or `{Page}Page extends UiBase`. One component per file; max ~15–20 ATCs per component. | `kata-architecture.md` §5 |
| **TC Identity rule** | A TC is defined by exactly two elements: precondition (state) + action (trigger). Every expected result from the same precondition + action is an assertion of the *same* TC. This is the "atomic" property. | `kata-architecture.md` §2 |
| **Steps (layer 3.5)** | Reusable chains of 3+ ATCs used as preconditions. Not `@atc`-decorated, not reported to the TMS individually. | `kata-architecture.md` §8 |
| **Fixture** | Dependency-injection entry point exposing components to tests (`ApiFixture`, `UiFixture`, `StepsFixture`, `TestFixture`). Lazy: API tests never open a browser. | `kata-architecture.md` §7 |
| **Traceability** | Bidirectional linkage US ↔ ATP ↔ ATR ↔ TC: given any one artifact you can navigate to the other three. Broken traceability renders a TC unmaintainable. | `tms-architecture.md` §3–4 |
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
| **User Story (US)** | Markdown-bodied requirement, optional `external_id` (Jira key). Has 1..N ACs. |
| **Acceptance Criterion (AC)** | Atomic, sortable, Markdown-bodied testable behavior of a US. |
| **ATC** | Acceptance Test Case: title, layer (`UI \| API \| Unit`), tags, ordered `atc_steps`, ordered `atc_assertions`, plus `atc_acceptance_criteria` M:N join binding it to ≥1 AC. Orphan ATCs are rejected at the schema-constraint level. Unit of *authorship*. |
| **Test** | Named container owning an **ordered chain of ATC references** (`test_steps`: test_id + atc_id + position). References, not copies → "one-edit-many-tests". Unit of *execution*. |
| **Run** | One execution instance of a Test against an environment (executor: human / agent / ci). Snapshots step content (`run_atcs`, `run_steps`) so editing an ATC later never corrupts history. |
| **Bug** | Native defect record anchored to Module + ATC + Run — lives inside the test cycle, not delegated to Jira (optional one-way Jira sync). |

---

## 4. Anti-glossary — terms to never use

| Wrong | Right | Why it's wrong |
| --- | --- | --- |
| "Atomic Test Component" | **Acceptance Test Case** | Misexpansion of ATC. Atomicity and component-hood are implementation properties (see §0). |
| "Komponent Action Test Architecture" | **Component Action Test Architecture** | Spelling drift from an early design chat (`.context/designs/.../chats/chat1.md`, 2026-05-11). The boilerplate skill — the canonical source — spells it "Component"; the K in KATA comes from the martial-arts term *kata*, mirrored by the brand name Bunkai. |
| "test case" for an ATC chain | **Test** | In Bunkai a Test is the chain; the chained units are ATCs. Keep the two words distinct. |
| "test component" | **ATC**, **end-to-end test**, or **integration test** — by context | Ambiguous and generic ("a component of testing" says nothing). If the sentence means the minimal atomic unit that satisfies an AC → **ATC**. If it means the assembled chain walking a journey → **end-to-end test** or **integration test**. Never leave "test component" in specs, ACs, or Jira content. |

---

## 5. Change protocol

1. New domain term or changed meaning → update this file FIRST, in the same PR.
2. Term used in Jira content (summary, description, custom fields) → keep Jira wording aligned with §1–§3.
3. Disagreement between docs → this glossary wins; if the glossary itself is wrong, fix it via PR with an entry in §4 documenting the deprecated usage.
