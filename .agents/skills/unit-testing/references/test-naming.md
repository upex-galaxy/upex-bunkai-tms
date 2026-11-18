# Test naming

## Why naming matters

A test name is what you see when the test fails, usually in a CI log and often six months after you wrote it. A bad name forces you to open the test, the source and a debugger before you know what broke. A good name states the failing behavior in one line, so you can decide in seconds whether the test or the code is wrong.

Naming forces clear thinking. If you cannot name a test concisely, it probably does too much.

## The two dominant patterns

### AAA (Arrange-Act-Assert)

AAA describes the **structure** of the test body, not the name. The body has three sections: set up the inputs (Arrange), invoke the unit (Act), check the outcome (Assert). The name then says what is true, in declarative form.

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

It is terse and scannable in failure logs, and less self-documenting for non-trivial behavior.

### Given-When-Then (BDD-style)

BDD names spell out the precondition, the action, and the expected outcome:

```typescript
it('given empty cart, when item added, then total reflects price + tax', () => {
  // ...
});
```

It reads like a spec, which helps stakeholders and onboarding, and it is verbose and ceremonial for trivial tests.

### Hybrid (project-recommended)

Use terse `describe` blocks for context and BDD-style `it` names for clarity. The `describe` carries the "given" implicitly:

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

This gives hierarchical context and self-documenting failure messages without repetition.

## Naming heuristics

- Start with what is true, not what the code does: `returnsZeroForEmptyArray`, not `testEmptyArray` or `testSumFunction`.
- Include the input or condition that triggers the behavior: `whenInputIsNegative`, `whenUserIsAdmin`.
- Include the expected outcome: `throws`, `returnsX`, `callsY`.
- Keep implementation details out of the name. Skip the class or function name unless it is ambiguous, since the file path already says it.
- Prefer one assertion per test, and let the name reflect it. With five assertions the name probably cannot describe them all.
- Use the present indicative: `returns`, not `should return`. Many teams allow `should`, so pick one and stay consistent.

## Anti-patterns

- `test1`, `test2`, `test3` tell you nothing. The log says "test2 failed" and you are reading source.
- `testFunctionName` names the unit, not the behavior, with the same result.
- `shouldWork`, `worksCorrectly`, `isOk` are meaningless, because "work" is undefined.
- `it('test')` and `it('something')` are filler.
- A 100-character name should split into `describe` plus `it`. If it is still too long, the test does too much.
- Negation soup such as `doesNotNotReturnInvalid` should be rephrased positively.
- A bare `throws` should say what for: `throwsOnNegativeAmount`.

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

The `describe` / `it` name states the equivalence class. The inputs are the cases.

## Related references

- `tdd-workflow.md`: naming during TDD. Write the name first, because it forces you to state the behavior.
- `unit-testing.md`: general testing principles and project conventions.
- `mocking-patterns.md`: naming tests that use mocks (avoid mock-flavored names like `callsApiOnce`).
- `test-coverage.md`: checking whether your named tests cover the cases that matter.
