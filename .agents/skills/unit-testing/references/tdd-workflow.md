# TDD Workflow (Test-Driven Development)

## Overview

TDD = test before code, in tight Red-Green-Refactor cycles. Goal: fast feedback while you build, plus a safety net that lets you refactor without fear. TDD shines on pure logic and bug fixes; it's a poor fit for UI tweaks and integration glue.

## When to TDD vs after-the-fact

| Scenario                                          | TDD or after?                                             |
| ------------------------------------------------- | --------------------------------------------------------- |
| Pure functions / business logic                   | TDD strongly recommended                                  |
| Algorithms, parsers, state machines               | TDD                                                       |
| Validation / transformation utilities             | TDD                                                       |
| UI components (presentational)                    | After-the-fact (or component tests, often skipped)        |
| Integration glue (DB query wrappers, API clients) | After-the-fact (mostly covered by integration tests)      |
| Performance-critical code                         | TDD with benchmarks alongside assertions                  |
| Throwaway scripts / one-off migrations            | Skip                                                      |
| Bug fixes                                         | TDD: write the failing test that reproduces the bug FIRST |

Rule of thumb: if the function has branches, math, or string parsing — TDD it. If it's mostly orchestration of other things — write the test after, or rely on a higher-level test.

## The Red-Green-Refactor Cycle

### 1. RED — write a failing test

Write the smallest test that captures one slice of behavior. Run it. Confirm it fails for the **right reason** (assertion failure), not a setup error (import failure, undefined function). A test that's red because the file doesn't compile gives you no information.

If the test passes immediately on the first run, that's a smell — either the behavior already exists, or your test isn't actually exercising the new code. Investigate before continuing.

### 2. GREEN — make it pass with minimum code

Write the simplest code that makes the test pass. Constants and hardcoded returns are fine at this stage. Resist the urge to write the "real" implementation upfront — let it emerge across multiple cycles. Don't write code for tests that don't exist yet.

If you can't make it green in 5-10 minutes, the slice is too big. Step back, narrow the test, retry.

### 3. REFACTOR — clean up

Now that the test is green, refactor freely. Extract helpers, rename variables, deduplicate. Tests catch regressions. Stop refactoring when no obvious smell remains — perfection is not the goal.

Critical: refactor only when green. Refactoring while red means you're losing the safety net at the moment you need it most.

### Cycle pace

Aim for 5-10 minute cycles. If a cycle takes >30 minutes, the slice is too big — break it down into smaller behavioral steps. The cadence itself is part of TDD's value: short cycles = many checkpoints = low risk per change.

## Composability with sprint-development

When you're in the middle of `/sprint-development` Stage 2 (Implementation):

- Hit a function that's pure logic? → TDD it: invoke `/unit-testing` for the slice, then return.
- Bug fix? → Write the failing reproducer first (TDD), then fix.
- Complex branching logic with edge cases? → TDD instead of guessing the cases later.

The hand-off is symmetric — sprint-development's implementation prompt knows to dispatch to `/unit-testing` when TDD is appropriate, and `/unit-testing` returns control once the slice is green and refactored.

## Common TDD anti-patterns

- **Waterfall tests**: Writing all tests first, then all code. That's not TDD, that's plan-test-then-code. You miss the design feedback that small cycles provide.
- **Skipping the RED check**: A "test" that "passes" without being implemented is a false signal. Always confirm red first.
- **Refactoring while red**: You lose the safety net at the worst possible moment.
- **Implementation-detail tests**: Tests that assert on internal field names, private methods, or call counts. Refactor-hostile.
- **Not running tests after every tiny change**: Defeats the cycle. Use watch mode.
- **Big-bang green**: Writing 50 lines to pass one test. The test isn't driving the design — fix the slice size.

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

Run → green. Commit checkpoint.

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

Run → both pass. Green.

**Cycle 3 (RED → GREEN → REFACTOR)**

```typescript
it('throws on negative amount', () => {
  expect(() => applyDiscount(-1, 10)).toThrow();
});
```

Red. Add guard, run → green. Refactor: rename `percent` to `percentOff` for clarity, run tests → still green. Done.

Three cycles, three behaviors, full coverage of the cases you care about.

## Related references

- See `unit-testing.md` for general testing principles + project conventions
- See `test-naming.md` for naming the tests you'll write
- See `mocking-patterns.md` for handling dependencies during TDD
- See `test-coverage.md` for measuring what you're missing
