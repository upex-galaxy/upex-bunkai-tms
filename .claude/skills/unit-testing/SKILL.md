---
name: unit-testing
description: 'Focused skill for unit-test design — TDD workflow (red-green-refactor), test naming (AAA, Given-When-Then), mocking patterns (mocks/spies/stubs/fakes, dependency injection), and coverage strategy (line vs branch, mutation testing). Composable: invokable standalone (write unit tests for this function, qué mockear aquí, what to mock) or mid-flight from sprint-development for TDD slices. Triggers on: write unit tests, TDD this function, test-driven development, qué mockear aquí, what to mock, test naming, AAA pattern, Given-When-Then, test coverage, branch coverage, Jest, Vitest, unit testing. Do NOT use for: feature implementation orchestration (use /sprint-development), E2E or integration testing (out of scope, see playwright-cli skill), production deploy, or formal QA workflow.'
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
phase: implementation
complementary_categories:
  - language
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

# Unit Testing

Focused skill for designing and writing unit-level tests. Covers TDD cycles, test naming conventions, mocking decisions, and coverage strategy. TDD-friendly and stack-agnostic (Jest, Vitest, Mocha, or any runner with a similar API). Plays well as a standalone skill or as a mid-flight callee from `/sprint-development` when a slice benefits from test-first development.

## When to use

- "Write unit tests for this function/class"
- "TDD this slice" / "red-green-refactor"
- "What should I mock here?"
- "How do I name this test?"
- "What's the right coverage target for this module?"
- Mid-flight from `/sprint-development` Stage 2 (Implementation) when implementing TDD-friendly code (pure functions, complex branching, bug fix reproducers)

## Composability with sprint-development

This skill is designed to interoperate with `sprint-development`. From `sprint-development` Stage 2 (Implementation), invoke `/unit-testing` for any TDD slice, then return to the main story-level flow. The hand-off is informal — both skills understand the boundary. `unit-testing` doesn't track Jira, doesn't deploy, doesn't run code review; it just produces tested code for one slice and hands control back.

When invoked standalone (no `sprint-development` parent), it operates self-sufficiently against whatever code the user points at.

## Pre-requisites

- Project has a unit test runner configured (Jest, Vitest, Mocha, or similar)
- Test command exists in `package.json` (`bun test`, `npm test`, `vitest`, etc.)
- For TDD: test runner supports watch mode (`--watch`)
- If no runner is configured, the first task is to set one up — see `references/unit-testing.md` § Setup

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any workflow below. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter (`language`).
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. For each matched skill, classify tier per strategy doc §2.
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this unit-test work? Y/N"`. Cache the answer for the session.
5. When dispatching sub-agents (test author, mock designer, coverage auditor), inject a `## Composable Skills` block per strategy doc §6.2.

Expected matches (illustrative — actual list depends on what the user has installed):

| Category   | Likely matches                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `language` | `typescript-advanced-types` (T3) — applied when designing type-aware mocks, generic test utilities |

Skip step only if the registry cache is missing AND no session-start skill list is available. When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

## Workflow

### Standalone invocation

1. Identify the unit (function, class, module) — confirm with the user if ambiguous
2. Decide TDD or after-the-fact (see `references/tdd-workflow.md`)
3. Write tests using the project's naming convention (see `references/test-naming.md`)
4. Mock external deps cleanly (see `references/mocking-patterns.md`)
5. Run tests, confirm green
6. Verify coverage of the unit (see `references/test-coverage.md`)
7. Report: files added, tests passing, coverage delta

### Mid-flight from sprint-development (TDD)

1. `sprint-development` is implementing a feature in Stage 2
2. Encounter a slice that benefits from TDD (pure function, complex branching, bug fix reproducer)
3. Invoke `/unit-testing` with the slice in scope
4. Apply Red-Green-Refactor (see `references/tdd-workflow.md`)
5. Once green and refactored, return control to `sprint-development`'s main flow

## Specific tasks — which reference to read

| User intent                                                             | Read                             |
| ----------------------------------------------------------------------- | -------------------------------- |
| "TDD this function" / "red-green-refactor" / "test before code"         | `references/tdd-workflow.md`     |
| "name this test" / "AAA" / "Given-When-Then"                            | `references/test-naming.md`      |
| "what to mock" / "Jest mock" / "Vitest spy" / "DI for testing"          | `references/mocking-patterns.md` |
| "coverage target" / "what coverage to ignore" / "mutation testing"      | `references/test-coverage.md`    |
| "general unit testing principles" / "project conventions" / "AAA setup" | `references/unit-testing.md`     |

When in doubt, start with `references/unit-testing.md` — it covers the broad workflow and points to the specialized refs for deeper topics.

## Hand-offs

- **Implementing a feature with TDD** → return to `/sprint-development` Stage 2 once tests are green and the slice is refactored
- **Integration / E2E tests** → out of scope here; handled by a separate QA workflow
- **First-time test runner setup in a fresh repo** → `/sprint-development` Stage 4 (deploy/scaffolding) covers tooling installation; this skill assumes a runner exists
- **Bug-fix workflow with reproducer-first** → invoke this skill from `/sprint-development` for the reproducer test, then continue with the fix

## Variables consumed

- `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}` — informs which test runner conventions apply (Jest is more common with Node/React, Vitest with Vite-based projects)
- (No `{{jira.*}}` references — unit tests are pre-Jira; they're a developer concern, not a workflow artifact)

## Notes

- Unit testing is a development concern, not QA. Write them as you code. Don't outsource them to a separate phase.
- Prefer behavior-based tests over implementation-detail tests. Names like `returnsZeroForEmptyArray` beat `callsCalculateOnce`.
- Coverage is a floor, not a target. 100% coverage with brittle, mock-heavy tests is worse than 80% with robust, behavior-driven tests.
- Mocking should be reserved for true external dependencies (HTTP, DB, filesystem, time, randomness). Mocking pure functions or the unit under test is a smell.
- E2E or integration tests are out of scope here — different concerns, different tools, different skills.
