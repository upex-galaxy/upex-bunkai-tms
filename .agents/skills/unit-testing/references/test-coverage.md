# Test Coverage

## What coverage means (and doesn't)

Coverage is the percentage of your code's lines, branches or statements that the test suite executes. It is a **floor** indicator, not a quality measure.

- High coverage does not mean good tests. A test that calls a function and never asserts anything still gives 100% line coverage.
- Low coverage does mean missing tests, because whatever is not covered is untested.
- The diff tells you more than the total. A PR that drops coverage from 92% to 85% is the signal, and chasing one global threshold is not.

Treat coverage as a smoke alarm: it says something might be wrong, and silence does not prove everything is right.

## Types of coverage

- **Line**: % of lines executed. The most common and the weakest, since it misses branches inside a single line.
- **Branch**: % of conditional branches taken (each side of every `if`, `&&`, `||`, ternary). It catches missing edge cases most reliably.
- **Function**: % of functions called at least once. Coarse, a basic sanity check.
- **Statement**: % of statements executed. Similar to line, slightly finer.
- **Mutation**: % of injected mutations the suite catches. The best measure of test quality, and slow.

For most projects branch coverage is the most actionable metric. 90% line coverage with 50% branch coverage means half your conditionals are untested.

## Targets by code type

| Code type                          | Suggested coverage           |
| ---------------------------------- | ---------------------------- |
| Pure functions / business logic    | 90-100%                      |
| Public API methods                 | 90%+                         |
| Internal helpers                   | 70-90%                       |
| UI components (presentational)     | 60-80% (E2E covers the rest) |
| Glue / configuration / wiring code | 50%+ (or skip)               |
| Generated code (typegen, codegen)  | exclude                      |
| Throwaway scripts / migrations     | exclude                      |

These are guidelines, not contracts. A 70%-covered helper that exercises every meaningful branch beats a 95%-covered helper whose missing 5% holds the only error path.

## What to ignore from coverage

Configure the coverage tool's exclude list so noise does not drag down the numbers that matter:

- Auto-generated files (typegen, codegen, OpenAPI types)
- Vendored / third-party copies
- Type-only files (`*.d.ts`)
- Configuration files (`*.config.ts`, `*.config.js`)
- Migration scripts (database, one-shot)
- Story files (`*.stories.tsx`)
- Test files themselves and test utilities

In Jest the setting is `coveragePathIgnorePatterns`; in Vitest it is `coverage.exclude`. Keep the list tight, because if everything is excluded the metric means nothing.

## Reading a coverage report

Open the HTML report (most tools generate one) and sort by coverage **ascending**, so the worst-tested files come first. For each file ask:

1. Are the uncovered lines on **error paths**? Often yes, and often important.
2. Are they on **edge cases**? (Empty array, null input, boundary values.)
3. Are they **dead code**? If so, delete it.
4. Are they **exclusion candidates**? (Generated, configured.)

In PRs, look at the diff and not the absolute number. Most tools support `--changed-only` or a delta report.

## Coverage in CI

Coverage gates in CI help when they are not draconian. Reasonable defaults:

- **Warn** if coverage drops by more than 2% in a PR.
- **Block** if it drops by more than 5%, which is a meaningful regression.
- **Fail** if a critical path file (defined explicitly) drops below an absolute threshold.

A single hard threshold (say "must be >=90%") punishes refactors that delete tested code and rewards padding. Delta-based thresholds line up with the intent: do not degrade what we have.

## Mutation testing (advanced)

Mutation testing tools (Stryker for JS/TS, PIT for JVM, mutmut for Python) inject small mutations into your code, such as flipping a `<` to `>`, changing a constant or removing a return, then run your test suite. If the tests still pass, the mutation **survived**, which means your tests missed a real bug.

The signal to watch: a high coverage % with a low mutation score means tests that execute code without verifying behavior.

Caveats:

- Slow (each mutation is a full test re-run)
- High setup cost
- Best run weekly or nightly in CI, not per PR
- Worth it for libraries, payment and billing logic, and anything where silent bugs are catastrophic

If you have never run mutation testing, try it once on your most-trusted module. The result is often humbling.

## Practical workflow

1. Chase coverage on the parts that matter, not a global target.
2. Watch the diff in every PR, because that is where regressions hide.
3. Use branch coverage as the primary signal, not line.
4. Exclude noise so the number reflects real test gaps.
5. Try mutation testing once a quarter on critical modules to calibrate test quality.
6. Skip tests written only to hit a coverage number: they pollute the suite without adding signal.

## Related references

- `tdd-workflow.md`: TDD produces high meaningful coverage as a byproduct.
- `test-naming.md`: well-named tests make coverage gaps easier to spot.
- `mocking-patterns.md`: over-mocked tests can hit lines without verifying behavior (mutation testing exposes this).
- `unit-testing.md`: general testing principles and project conventions.
