# TDD workflow

Source: https://github.com/mattpocock/skills (skills/engineering/tdd), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

## Overview

TDD means writing the test before the code, in tight red-green-refactor cycles. It gives fast feedback while you build and a safety net that lets you refactor without fear. It pays off on pure logic and bug fixes, and it is a poor fit for UI tweaks and integration glue.

## When to TDD and when to test after

| Scenario                                          | TDD or after?                                             |
| ------------------------------------------------- | --------------------------------------------------------- |
| Pure functions / business logic                   | TDD strongly recommended                                  |
| Algorithms, parsers, state machines               | TDD                                                       |
| Validation / transformation utilities             | TDD                                                       |
| UI components (presentational)                    | After-the-fact (or component tests, often skipped)        |
| Integration glue (DB query wrappers, API clients) | After-the-fact (mostly covered by integration tests)      |
| Performance-critical code                         | TDD with benchmarks alongside assertions                  |
| Throwaway scripts / one-off migrations            | Skip                                                      |
| Bug fixes                                         | TDD: write the failing test that reproduces the bug first |

Rule of thumb: if the function has branches, math or string parsing, TDD it. If it mostly orchestrates other things, write the test after, or rely on a higher-level test.

## Seams first

Before the first test, write down the seams under test and, for each, one line on what a test there catches and what it misses. No test is written at a seam you did not name. Work in vertical slices: one test, the least code that passes it, then the next, each cycle responding to what the last one showed. The first cycle is a tracer bullet through the whole path. Expected values come from a literal, a worked example or the spec, never from the code under test.

A person doing standalone TDD may confirm the seams. A worker or `/autonomous-delivery` takes them from the story plan (`## Technical Decisions` in `sprint-development/references/story-plan.md`). When the plan names none, pick the highest existing seam, record it in `progress.md` and go on. It never waits for a confirmation.

## The red-green-refactor cycle

### 1. RED: write a failing test

Write the smallest test that captures one slice of behavior. Run it and confirm it fails for the **right reason** (an assertion failure), not a setup error such as an import failure or an undefined function. A test that is red because the file does not compile tells you nothing. The first test goes through the seam you named, with its expected value taken from an independent source (see Seams first).

If the test passes on its first run, either the behavior already exists or the test does not exercise the new code. Find out which before continuing.

### 2. GREEN: make it pass with minimum code

Write the simplest code that makes the test pass. Constants and hardcoded returns are fine at this stage. Let the real implementation emerge across several cycles instead of writing it upfront, and write no code for tests that do not exist yet.

If you cannot get to green in 5 to 10 minutes, the slice is too big. Narrow the test and retry.

### 3. REFACTOR: clean up

With the test green, refactor freely: extract helpers, rename variables, deduplicate. The tests catch regressions. Stop when no obvious smell remains, because perfection is not the goal.

Refactor only on green. Refactoring on red removes the safety net exactly when you need it.

### Cycle pace

Aim for cycles of 5 to 10 minutes. A cycle that takes more than 30 minutes means the slice is too big, so break it into smaller behavioral steps. Short cycles give many checkpoints and keep the risk of each change low.

## Lying tests (LT-1 to LT-3)

A green test is evidence only if it could have been red. Check every new assertion for three lies. Other skills point here (`/sprint-development` review, `/pr-review-lead`), so the IDs and the heading stay as they are.

| ID | Check | Severity |
| --- | --- | --- |
| LT-1 | Tautological: the expected value is computed the way the code computes it (the same formula, the same helper), or compared to the input the test just set with no round trip through the product. It passes by construction. Take expected values from a literal, a worked example or the spec. A server echoing the payload you sent is a legitimate round trip, since the product produced the value. | MAJOR |
| LT-2 | Cannot fail: no product change turns it red. Examples: `toBeDefined()` as the only check, an assertion inside an `if` or swallowed by `try/catch`, a missing `await` on an assertion. Ask which product change would break it, and treat "none" as a finding. | BLOCKER |
| LT-3 | Structure-sensitive: it breaks on a refactor that keeps behavior, as with call counts, private state or a whole-object snapshot where two fields matter. Assert what a caller sees. | MAJOR |

This is a review rule, so nothing in it waits for a person.

## Composability with sprint-development

During `/sprint-development` Stage 2 (Implementation):

- A pure-logic function: TDD it by invoking `/unit-testing` for the slice, then return.
- A bug fix: write the failing reproducer first, then fix.
- Complex branching with edge cases: TDD it instead of guessing the cases later.

The hand-off is symmetric. The implementation prompt dispatches to `/unit-testing` when TDD fits, and `/unit-testing` returns control once the slice is green and refactored.

## Common TDD anti-patterns

- **Waterfall tests.** Writing all the tests first, then all the code, is plan-then-code, not TDD, and you lose the design feedback small cycles give.
- **Skipping the red check.** A "test" that passes before the feature exists is a false signal. Confirm red first.
- **Refactoring while red.** You lose the safety net at the worst moment.
- **Implementation-detail tests.** Assertions on internal field names, private methods or call counts break on refactors (LT-3).
- **Not running the tests after every small change.** It defeats the cycle, so use watch mode.
- **Big-bang green.** Fifty lines to pass one test means the test is not driving the design. Fix the slice size.

## Example walkthrough

Implementing `applyDiscount(amount, percent)`:

**Cycle 1 (RED → GREEN)**

```typescript
// test
it('returns the original amount when percent is 0', () => {
  expect(applyDiscount(100, 0)).toBe(100);
});

// minimum impl
export function applyDiscount(amount: number, percent: number) {
  return amount;
}
```

Run it: green. Commit checkpoint.

**Cycle 2 (RED → GREEN)**

```typescript
it('subtracts a 10% discount', () => {
  expect(applyDiscount(100, 10)).toBe(90);
});
```

Red. Update implementation:

```typescript
export function applyDiscount(amount: number, percent: number) {
  return amount - (amount * percent) / 100;
}
```

Run them: both pass. Green.

**Cycle 3 (RED → GREEN → REFACTOR)**

```typescript
it('throws on negative amount', () => {
  expect(() => applyDiscount(-1, 10)).toThrow();
});
```

Red. Add guard, run it: green. Refactor: rename `percent` to `percentOff` for clarity, run the tests: still green. Done.

Three cycles, three behaviors, full coverage of the cases you care about.

## Related references

- `unit-testing.md`: general testing principles and project conventions.
- `test-naming.md`: naming the tests you write.
- `mocking-patterns.md`: handling dependencies during TDD.
- `test-coverage.md`: measuring what you are missing.
