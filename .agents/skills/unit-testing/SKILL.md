---
name: unit-testing
description: 'Design and write unit tests: TDD, test naming, mocking, coverage. Use when asked to write unit tests, TDD a function, decide what to mock, name a test or pick a coverage target; also called mid-flight by sprint-development for a TDD slice. Not for E2E or integration tests, or whole-story delivery (sprint-development).'
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: implementation
complementary_categories:
  - language
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the "Anti-patterns" section in the body below.
compact_rules: |
  - **U1.** Test public behavior and observable contracts, not implementation details (private helpers, internal state, call counts on internal methods). Implementation refactors freely and the tests should survive it. A test that breaks on a behavior-preserving refactor is a lying test (see Lying tests in `references/tdd-workflow.md`).
  - **U2.** Do not over-mock. A test that mocks every collaborator verifies the mock graph, not the code under test. Prefer real implementations plus dependency injection at the seam, and mock only true external boundaries (HTTP, DB, filesystem, time, randomness).
  - **U3.** Watch the test fail before writing the production code. A test written after the code gives no design feedback, and it must fail for the right reason (an assertion, not a setup error).
  - **U4.** Assert the exact value, shape or error. `expect(result).toBeTruthy()` and `expect(x).toBeDefined()` hide regressions when you mean a specific value (see Lying tests in `references/tdd-workflow.md`).
  - **U5.** Keep state out of the space between tests: no module-level variables, singleton caches or fixtures mutated in place. Shared state causes order-dependent flakes, so reset it in `beforeEach` or scope it inside the test.
  - **U6.** Treat coverage as a signal, not a target. 100% with brittle, mock-heavy tests is worse than 80% with behavior-driven ones. Mutation testing answers "do my tests catch bugs?" better than line coverage.
  - **U7.** Mock what you own only with a real reason. Inject a fake or stub at the seam, and reach for `jest.mock` / `vi.mock` only when the seam is unavoidable (module-level side effects, a third-party SDK).
  - **U8.** A flaky test never ships green. Fix the root cause (timing, shared state, network) or quarantine it with a tracked ticket, because ignored flakes erode trust in the whole suite.
  - **U9.** Test your own logic, not the framework's (matcher behavior, library internals, ORM mechanics). The framework has its own test suite.
  - **U10.** In a GUARD app, test a feature through its door (`@features/<x>`), never its internals; fake adapters at the port. The interface is the test surface (`agentic-dev-core/references/guard-architecture.md` §6).
  - **Runner and command come from `stack:`** (`.agents/project.yaml`): the runner is `stack.test_runner`, the command is `{{stack.package_manager}} run {{stack.scripts.test}}`, and test files live under `stack.app_root` next to their siblings. A non-null runner is the app's own: extend it, never add or swap in a second one. Only `stack.test_runner: null` (not chosen yet) opens runner setup, and the choice is recorded with `bun run agents:setup --stack`. A null `stack.scripts.test` is reported, never invented.
  - **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 and do not substitute silently (built-in `WebSearch` / `WebFetch` only when the user chooses it).
metadata:
  kind: workflow
  requires_capabilities: [library-docs]
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Unit testing

This skill designs and writes unit-level tests: TDD cycles, test names, mocking decisions and coverage strategy. It is stack-agnostic. The runner is whichever one the app already uses, read from the `stack:` block (see `## Stack parameters`). It runs standalone, or mid-flight from `/sprint-development` when a slice benefits from test-first work (pure functions, complex branching, bug reproducers).

Inside `/sprint-development` Stage 2 (Implementation), the parent invokes `/unit-testing` for one slice and takes control back when the slice is green and refactored. The hand-off is informal, and both skills understand the boundary: this one tracks no Jira, deploys nothing and runs no code review. Invoked standalone, it works on whatever code the user points at.

## Pre-requisites

- A unit test runner exists: `stack.test_runner` in `.agents/project.yaml` names it (`vitest`, `jest`, `bun`, ...).
- The app's test script exists: `stack.scripts.test` names it in the app's `package.json`.
- For TDD, the runner supports watch mode (`--watch`).
- `stack.test_runner: null` means no runner was chosen yet, so the first task is runner setup (`references/unit-testing.md` § Setup). Any other value, including `none` on an app that decided against unit tests, is the app's decision: ask before changing it.

## Stack parameters

Read the `stack:` block once per run. Every runner, command and path resolves from it. The literal examples in the references (`src/lib/...`, `jest.mock`) illustrate; they are not defaults to impose.

| Parameter | Use |
| --------- | --- |
| `{{stack.test_runner}}` | the runner whose API the tests use (`vi.*` for `vitest`, `jest.*` for `jest`, `bun:test` for `bun`). Non-null means extend it and never add or swap in a second runner. `null` means runner setup first, then `bun run agents:setup --stack` records the choice |
| `{{stack.package_manager}} run {{stack.scripts.test}}` | the command that runs the suite. A null `stack.scripts.test` is reported, never invented; adding the script is a change to the app's `package.json` the user approves |
| `{{stack.app_root}}` | where the code under test and its tests live (a monorepo app sits under e.g. `apps/web`). Test files follow the convention the sibling tests already use (colocated `*.test.ts`, a `__tests__/` folder, a top-level `tests/`), whatever the references show |
| `{{stack.conventions.import_alias}}` | the import alias tests use for app modules, when non-null |

## Inputs: read these first, in this order

Stop early when later inputs add no signal for the slice in scope.

1. The function or module under test. Its public interface is the contract the tests lock in.
2. Existing tests for the same module (sibling `*.test.ts` / `*.spec.ts`). Extend them, do not duplicate.
3. The function's callers (search by symbol). They show which collaborators are external (mock) and which are internal (use real).
4. The test framework config (`vitest.config.ts` / `jest.config.ts` or equivalent): env vars, setup files, coverage thresholds, path aliases.
5. Helpers and fixtures the sibling tests use. Reuse the project's seams instead of inventing parallel ones.

## Composable Skills (auto-resolved at skill entry)

Run this once, before any workflow below. The contract is `agentic-dev-core/references/skill-composition-strategy.md`.

1. Read `complementary_categories` from this skill's frontmatter (`language`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each matched skill by tier (strategy doc §2).
4. Apply the threshold rule (strategy doc §3.2). T1 and T3 matches load silently and are cached for the session. For a T4 match, ask the user once, `"Detected <skill> (T4). Apply for this unit-test work? Y/N"`, and cache the answer. With nobody to ask, skip the T4 skill and say so in the report.
5. When dispatching sub-agents (test author, mock designer, coverage auditor), inject a `## Composable Skills` block per strategy doc §5.2.

Skip the step only when neither the session skill list nor the `.agents/skills/` folder can be read. Then log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (strategy doc §3.4).

Expected matches (the real list depends on what is installed):

| Category   | Likely matches                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `language` | `typescript-advanced-types` (T3), applied when designing type-aware mocks and generic test utilities |

## Workflow

### Standalone invocation

1. Identify the unit (function, class, module). Confirm with the user when it is ambiguous.
2. Decide TDD or after-the-fact (`references/tdd-workflow.md`).
3. Write the tests with the project's naming convention (`references/test-naming.md`).
4. Mock external dependencies cleanly (`references/mocking-patterns.md`).
5. Run the tests and confirm green.
6. Check coverage of the unit (`references/test-coverage.md`).
7. Report the files added, the tests passing and the coverage delta.

### Mid-flight from sprint-development (TDD)

1. `sprint-development` is implementing a feature in Stage 2.
2. It meets a slice that benefits from TDD (pure function, complex branching, bug reproducer).
3. It invokes `/unit-testing` with the slice in scope and the seams the plan named.
4. Apply red-green-refactor (`references/tdd-workflow.md`).
5. Once the slice is green and refactored, return control to `sprint-development`'s main flow.

## Specific tasks: which reference to read

| User intent                                                             | Read                             |
| ----------------------------------------------------------------------- | -------------------------------- |
| "TDD this function" / "red-green-refactor" / "test before code"         | `references/tdd-workflow.md`     |
| "name this test" / "AAA" / "Given-When-Then"                            | `references/test-naming.md`      |
| "what to mock" / "Jest mock" / "Vitest spy" / "DI for testing"          | `references/mocking-patterns.md` |
| "coverage target" / "what coverage to ignore" / "mutation testing"      | `references/test-coverage.md`    |
| "general unit testing principles" / "project conventions" / "AAA setup" | `references/unit-testing.md`     |

When in doubt, start with `references/unit-testing.md`. It covers the broad workflow and points to the specialized references.

## Hand-offs

- Implementing a feature with TDD: return to `/sprint-development` Stage 2 once the tests are green and the slice is refactored.
- Integration or E2E tests: out of scope here, handled by a separate QA workflow.
- First-time runner setup in a fresh repo: set the runner up first per `references/unit-testing.md` § Setup. The rest of this skill assumes a runner exists.
- Bug fix with a reproducer first: `/sprint-development` invokes this skill for the reproducer test, then continues with the fix.

## With nobody at the keyboard

Every step above that asks a person has a path for a worker or a routine. The ruling rules are in `agentic-dev-core/references/decision-protocol.md`.

| Step that asks | Person present | Worker or routine |
| --- | --- | --- |
| Which unit is meant | ask | take the unit the plan or brief names, else the one the changed code points to, and say so in the report |
| Seams under test (`references/tdd-workflow.md` § Seams first) | may confirm the list | take the seams from the story plan. With none named, pick the highest existing seam, record it in `progress.md` and go on |
| Runner setup on `stack.test_runner: null` | ask which runner | decide it as a technical call, report it as DECIDED with the option it beat, and record it with `bun run agents:setup --stack` |
| Changing a runner set to `none` | ask first | leave it and report |
| A T4 skill match | ask once | skip it and report |

## Anti-patterns

These are the frontmatter `compact_rules` in short form (the rules carry the reasons), kept in sync by hand. Lying tests (a green test that could not have been red) are defined in `references/tdd-workflow.md`.

- **U1.** Testing implementation details (private helpers, internal state, call counts). See Lying tests.
- **U2.** Over-mocking: the test verifies the mock graph. Mock only HTTP, DB, filesystem, time and randomness.
- **U3.** Skipping the red phase.
- **U4.** Weak assertions (`toBeTruthy()`, `toBeDefined()`) where an exact value is meant. See Lying tests.
- **U5.** Shared mutable state between tests.
- **U6.** Chasing 100% line coverage.
- **U7.** Mocking what you own when a fake or stub at the seam would do.
- **U8.** Letting a flaky test ship green.
- **U9.** Testing framework code.
- **U10.** Reaching into a feature's internals instead of its door.

## Variables consumed

- `{{stack.test_runner}}`, `{{stack.package_manager}}`, `{{stack.scripts.test}}`, `{{stack.app_root}}`, `{{stack.conventions.import_alias}}`: the runner, the command and the paths (`## Stack parameters`).
- No `{{jira.*}}` references. Unit tests come before Jira and belong to the developer, not to a workflow artifact.

## Notes

Unit testing is a development concern, not a QA phase. Write the tests as you code. Prefer names that state behavior (`returnsZeroForEmptyArray`) over names that state calls (`callsCalculateOnce`).
