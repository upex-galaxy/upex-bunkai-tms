# Test Naming Conventions

## Why naming matters

A test name is what you see when it fails — usually in a CI log, often six months after you wrote it. A bad name forces you to open the test, the source, and a debugger before you understand what broke. A good name tells you the failing behavior in one line, so you can decide in seconds whether the test is wrong or the code is wrong.

Naming is a forcing function for clear thinking: if you can't name a test concisely, the test is probably doing too much.

## The two dominant patterns

### AAA (Arrange-Act-Assert)

AAA describes the **structure** of the test body, not the name. The test body has three sections: set up the inputs (Arrange), invoke the unit (Act), check the outcome (Assert). The name then describes "what is true" in declarative form.

```typescript
it('returnsZeroForEmptyArray', () => {
  // Arrange
  const items: number[] = [];
  // Act
  const result = sum(items);
  // Assert
  expect(result).toBe(0);
});
```

Pros: terse, scannable in failure logs. Cons: less self-documenting for non-trivial behavior.

### Given-When-Then (BDD-style)

BDD names spell out the precondition, the action, and the expected outcome:

```typescript
it('given empty cart, when item added, then total reflects price + tax', () => {
  // ...
});
```

Pros: reads like a spec, useful for stakeholders or onboarding. Cons: verbose, can feel ceremonial for trivial tests.

### Hybrid (project-recommended)

Use terse `describe` blocks for context and BDD-style `it` for clarity. The describe carries the "given" implicitly:

```typescript
describe('cart with items', () => {
  it('returns total including tax when item added', () => { ... });
  it('returns 0 when all items removed', () => { ... });
});

describe('cart with no items', () => {
  it('returns 0 for total', () => { ... });
  it('throws when attempting checkout', () => { ... });
});
```

This is the sweet spot: hierarchical context, self-documenting failure messages, no repetition.

## Naming heuristics

- **Start with what's true**, not what the code does. `returnsZeroForEmptyArray`, not `testEmptyArray` or `testSumFunction`.
- **Include the input/condition** that triggers the behavior. `whenInputIsNegative`, `whenUserIsAdmin`.
- **Include the expected outcome**. `throws`, `returnsX`, `callsY`.
- **Avoid implementation details** in the name. Don't reference the class/function name unless ambiguous — the file path already says it.
- **One assertion per test when possible** — the name reflects that one assertion. If you have 5 assertions, the name probably can't describe them all.
- **Use present-tense, indicative voice**. `returns` not `should return`. (Many teams allow `should` — pick one and stay consistent.)

## Anti-patterns

- `test1`, `test2`, `test3` — useless. Failure log says "test2 failed". You're now reading source.
- `testFunctionName` — describes the WHAT, not the BEHAVIOR. Same problem.
- `shouldWork`, `worksCorrectly`, `isOk` — meaningless. What does "work" mean?
- `it('test')`, `it('something')` — pointless filler.
- 100-character names — split into describe + it. If still too long, the test does too much.
- Negation soup: `doesNotNotReturnInvalid` — rephrase positively.
- `throws` without saying what for: `throws` → `throwsOnNegativeAmount`.

## Examples by category

| Category          | Bad              | Good                                                 |
| ----------------- | ---------------- | ---------------------------------------------------- |
| Simple function   | `testAdd`        | `addsTwoNumbers` / `returnsSumOfInputs`              |
| Class method      | `testGetUser`    | `returnsUserWhenIdExists`                            |
| Async operation   | `testFetch`      | `resolvesWithUserDataOn200`                          |
| Error case        | `testError`      | `throwsValidationErrorOnEmptyEmail`                  |
| Edge case         | `testEdge1`      | `returnsZeroWhenArrayIsEmpty`                        |
| Boundary          | `testBoundary`   | `appliesDiscountAtExactly100Threshold`               |
| State transition  | `testTransition` | `movesFromPendingToActiveOnApproval`                 |
| Side effect       | `testSideEffect` | `writesAuditLogWhenUserDeleted`                      |
| Configuration     | `testConfig`     | `usesDefaultLocaleWhenLocaleParamMissing`            |
| Equivalence class | `testManyValues` | `returnsTrueForAllValidEmailFormats` (parameterized) |

## Parameterized tests

When the same behavior holds across many inputs, parameterize and name the **rule**, not each case:

```typescript
it.each([
  [0, 'zero'],
  [1, 'one'],
  [21, 'twenty-one'],
])('formats %i as "%s"', (input, expected) => {
  expect(formatNumber(input)).toBe(expected);
});
```

The describe/it name describes the equivalence class. The inputs themselves are the cases.

## Related references

- See `tdd-workflow.md` — naming during TDD: write the name first, it forces you to articulate the behavior
- See `unit-testing.md` for general testing principles + project conventions
- See `mocking-patterns.md` for naming tests with mocks (avoid mock-flavored names like `callsApiOnce`)
- See `test-coverage.md` for measuring whether your named tests cover the cases that matter
