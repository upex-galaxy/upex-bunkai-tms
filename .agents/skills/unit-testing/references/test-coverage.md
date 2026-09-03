# Test Coverage

## What coverage means (and doesn't)

Coverage = the percentage of your code's lines, branches, or statements executed by your test suite. It's a **floor** indicator, not a quality measure.

- **High coverage doesn't mean good tests.** A test that calls a function and never asserts anything still hits 100% line coverage.
- **Low coverage definitely means missing tests.** Whatever isn't covered is, by definition, untested.
- **The diff is more useful than the total.** A PR that drops coverage from 92% to 85% is the signal — chasing a single global threshold isn't.

Treat coverage as a smoke alarm: it tells you something might be wrong, not that everything is right.

## Types of coverage

- **Line**: % of lines executed. Most common, weakest. Misses branches inside a single line.
- **Branch**: % of conditional branches taken (each side of every `if`, `&&`, `||`, ternary). Catches missing edge cases the most reliably.
- **Function**: % of functions called at least once. Coarse — basic sanity check.
- **Statement**: % of statements executed. Similar to line, slightly finer.
- **Mutation**: % of injected mutations the test suite catches. Gold standard for test quality, but slow.

For most projects, **branch coverage is the most actionable metric**. Line coverage of 90% with branch coverage of 50% means half your conditionals are untested.

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

These are guidelines, not contracts. A 70%-covered helper that exercises every meaningful branch is better than a 95%-covered helper where the missing 5% includes the only error path.

## What to ignore from coverage

Configure the coverage tool's exclude list so noise doesn't drag down meaningful numbers:

- Auto-generated files (typegen, codegen, OpenAPI types)
- Vendored / third-party copies
- Type-only files (`*.d.ts`)
- Configuration files (`*.config.ts`, `*.config.js`)
- Migration scripts (database, one-shot)
- Story files (`*.stories.tsx`)
- Test files themselves and test utilities

In Jest: `coveragePathIgnorePatterns`. In Vitest: `coverage.exclude`. Keep the list tight — if everything's excluded, the metric is meaningless.

## Reading a coverage report

Open the HTML report (most tools generate one). Sort by coverage **ascending** to see your worst-tested files at the top. For each:

1. Are the uncovered lines on **error paths**? (Often yes — and often important.)
2. Are they on **edge cases**? (Empty array, null input, boundary values.)
3. Are they **dead code**? (If yes, delete them.)
4. Are they **exclusion candidates**? (Generated, configured.)

Focus on the diff in PRs, not the absolute number. Most tools support `--changed-only` or a delta report.

## Coverage in CI

Coverage gates in CI are useful but should not be draconian. Reasonable defaults:

- **Warn** if coverage drops by >2% in a PR.
- **Block** if it drops by >5% — that's a meaningful regression.
- **Fail** if a critical path file (defined explicitly) drops below an absolute threshold.

A single hard threshold (e.g. "must be >=90%") punishes refactors that delete tested code and rewards padding. Delta-based thresholds align incentives with intent: don't degrade what we have.

## Mutation testing (advanced)

Mutation testing tools (Stryker for JS/TS, PIT for JVM, mutmut for Python) inject small mutations into your code — flip a `<` to `>`, change a constant, remove a return — then run your test suite. If tests still pass, the mutation **survived**, meaning your tests didn't catch a real bug.

Key signal: a high coverage % with low mutation score = tests that execute code without verifying behavior.

Caveats:

- Slow (each mutation = full test re-run)
- High setup cost
- Best run weekly or on a nightly CI, not per-PR
- Worth it for libraries, payment / billing logic, anything where silent bugs are catastrophic

If you've never run mutation testing, try it once on your most-trusted module. The result is often humbling.

## Practical workflow

1. **Don't chase global coverage targets.** Chase coverage on the parts that matter.
2. **Watch the diff** in every PR — that's where regressions hide.
3. **Use branch coverage** as the primary signal, not line.
4. **Exclude noise** so the number reflects real test gaps.
5. **Try mutation testing** once a quarter on critical modules to calibrate test quality.
6. **Don't write tests just to hit coverage** — they pollute the suite without adding signal.

## Related references

- See `tdd-workflow.md` — TDD naturally produces high meaningful coverage as a byproduct
- See `test-naming.md` — well-named tests make coverage gaps easier to spot
- See `mocking-patterns.md` — over-mocked tests can hit lines without verifying behavior (mutation testing exposes this)
- See `unit-testing.md` for general testing principles + project conventions
