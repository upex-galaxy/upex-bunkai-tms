# Unit testing workflow

This is the broad workflow behind `/unit-testing`: how to turn a story's implemented code into a focused set of unit tests. Run it during implementation or right after a story's code lands. Read it first when you do not yet know which specialised reference you need (`tdd-workflow.md`, `test-naming.md`, `mocking-patterns.md`, `test-coverage.md`). The goal is a suite that covers the functions carrying real logic, edge and error cases included, so refactors stay safe.

## Inputs

### The story

Read all three when they exist:

- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/story.md`: what the story does and its acceptance criteria. Start here.
- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/implementation-plan.md`: the technical plan and the modules it creates.
- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/acceptance-test-plan.md`: acceptance test cases. Optional; present only when upstream planning produced it.

From them you need three things: what the story does, which acceptance criteria it must meet, and which files it created or changed.

### The implemented code

Take the files the story created or changed (`git diff --name-only` against the base branch) under `{{stack.app_root}}`, and within them the components, helpers, utilities and transformation or calculation functions.

The folders in the examples below (`src/lib/`, `src/utils/`) are illustrations. The adopted app may lay things out differently (a root `lib/`, monorepo packages), and its layout wins.

Sort the functions into three kinds:

1. Complex business logic: financial or mathematical calculations, data transformations, non-trivial validation, business algorithms.
2. Critical functions: helpers reused in several places, formatting and parsing utilities, data validators.
3. Functions that do not need unit tests: purely presentational React components, code that only calls APIs (that is an integration test), configuration and constants, trivial wrappers.

### The testing framework

Read the `stack:` block of `.agents/project.yaml` first:

- `stack.test_runner`: the app's runner (`vitest`, `jest`, `bun`, `playwright`, `other`, `none`; `null` means none was chosen yet).
- `stack.scripts.test`: the NAME of the test script in the app's `package.json`. The command is `{{stack.package_manager}} run {{stack.scripts.test}}`.
- `stack.app_root`: where the app and its `package.json` live.

Then check the existing setup under `{{stack.app_root}}`: the runner config (`vitest.config.*`, `jest.config.*`, `bunfig.toml` and so on) for environment, setup files, aliases and coverage, and the existing `*.test.*` / `*.spec.*` files for their location (colocated, `__tests__/`, `tests/`) and naming. Answer three questions:

1. Does the runner in `stack.test_runner` match what the repo shows? If not, say so and run `bun run setup:doctor`, which reports the drift. Do not switch runners on your own.
2. Is coverage configured?
3. Which location and naming patterns do the tests use? New tests follow them.

## Tools

Context7 (the `library-docs` capability) is strongly recommended: read the official docs before writing tests. Useful queries are "<runner from stack.test_runner> latest best practices", "<runner> setup <stack.framework>", "React Testing Library latest API" and "<runner> mock functions examples". No other MCP is needed for this phase. Locally you need the runner from `stack.test_runner` and the package manager from `stack.package_manager`.

## What the tests cover

Cover:

- functions with complex business logic, reusable helpers and utilities, data transformations and calculations;
- happy paths, edge cases (limits, empty values, nulls) and error cases (invalid input);
- every meaningful branch of the critical functions. Targets per code type are in `references/test-coverage.md` § Targets by code type, and coverage is a floor, not a goal (SKILL.md U6).

Leave out:

- React component tests (component testing is a separate, optional layer);
- API integration tests and E2E tests, which belong to other test layers;
- trivial code without logic.

The result is tested critical functions with high coverage, and confidence when refactoring.

## Outputs

- Test files such as `src/lib/[module].test.ts` and `src/utils/[function].test.ts`, one per implemented module.
- When no runner exists yet: `jest.config.js` or `vitest.config.ts`, and the test scripts in `package.json`.
- A passing suite (100% pass rate) and a coverage report whose branch coverage is read against `references/test-coverage.md` § Targets by code type.
- An updated `README.md` with the test command, when the project has one.

## Working rules

The reason for each rule is in parentheses.

- Test only functions with real logic (a suite full of trivial tests costs more than it protects). Skip simple UI components, and skip third-party code, which its authors already tested.
- Verify behavior, not implementation (a test tied to the implementation breaks on every refactor).
- Use descriptive variables instead of hardcoded values, and test names that say what is being tested.
- Cover boundary values, empty values, `null`, `undefined`, invalid input and exceptions.
- Use the AAA pattern: Arrange, Act, Assert.
- Isolate external dependencies (APIs, DB, external services): inject at the seam first, and use `jest.mock` / `vi.mock` only when the seam is unavoidable. Do not mock without a reason.
- Validate branch coverage per code type (`references/test-coverage.md`), never a global number as the goal.
- Comment a test when its purpose is not obvious.
- Run only commands that terminate (an interactive command blocks the run).

## Step 1: Analyze the implemented code

Goal: decide which functions need unit tests.

### Step 1.1: Read the story and the code

1. Read `story.md`.
2. Read `implementation-plan.md`.
3. Find the files this story implemented:
   ```bash
   # use grep/find to identify the new modules
   ```

Keep these working notes to yourself: the list of implemented files, the functions in each, and for each function whether it needs a test and why.

### Step 1.2: Classify the functions

- Critical, needs a unit test: complex business logic, financial or mathematical calculations, data transformations, complex validation, reusable helpers.
- Optional, a test is recommended but not critical: simple functions that are reused, basic formatters and parsers.
- Do not test: purely presentational React components, code that only calls APIs, configuration and constants, trivial wrappers without logic.

### Step 1.3: List the tests to write

Show the user the list and continue; it needs no approval. Write it in the user's language. An example:

```markdown
## Analysis of the implemented functions

### Files reviewed:

- src/lib/discount-calculator.ts
- src/utils/format-currency.ts
- src/components/PriceCard.tsx (UI only, no tests)

### CRITICAL functions that need unit tests:

#### 1. `calculateDiscount()` - `src/lib/discount-calculator.ts`

**Reason:** critical business logic (price calculation)
**Cases to test:**

- Happy path: discount applied correctly
- Edge case: an order of exactly $100
- Edge case: an order of $0
- Error case: negative values

#### 2. `formatCurrency()` - `src/utils/format-currency.ts`

**Reason:** helper reused across several components
**Cases to test:**

- Happy path: correct format with decimals
- Edge case: very large values
- Edge case: null/undefined
- Different currencies

### Functions that do NOT need tests:

- `PriceCard.tsx` - presentational component (only renders props)
```

## Setup (Step 2)

Goal: make sure the app has a configured runner. This step runs only when `stack.test_runner` is `null` (a new project with no runner chosen). With any other value the app has already decided: use its runner, config and script as they are, and skip this step entirely. Never install a second runner next to the existing one and never swap one for another: two runners split the suite in two.

### Step 2.1: Check the runner

```bash
# confirm in the app's package.json (under stack.app_root) that there is no runner
grep -E '"(jest|vitest)"|bun test' {{stack.app_root}}/package.json
```

When none is installed:

1. Ask the user: "Which testing framework do you prefer?", offering Jest (most common, most plugins) and Vitest (faster, better with Vite). With nobody to ask, take it as a technical call and report it as DECIDED with the option it beat (see `## With nobody at the keyboard` in SKILL.md and `agentic-dev-core/references/decision-protocol.md`).
2. Look up the setup in Context7: "Jest setup Next.js latest" or "Vitest setup Next.js latest".
3. Install it with the app's package manager:
   ```bash
   {{stack.package_manager}} add -D jest @types/jest ts-jest
   # or: {{stack.package_manager}} add -D vitest
   ```

### Step 2.2: Create the config

When neither `jest.config.js` nor `vitest.config.ts` exists:

```
IF framework = Jest:
  Create jest.config.js with:
  - preset: ts-jest
  - testEnvironment: node
  - collectCoverageFrom: src/**/*.ts (exclude .test.ts)
  - coverageThreshold: ONLY per file, for the critical paths the team names explicitly
    (no global threshold: `references/test-coverage.md` § Coverage in CI gates on the delta of each PR)

IF framework = Vitest:
  Create vitest.config.ts with:
  - test.globals: true
  - test.environment: node
  - coverage.provider: v8
  - coverage.reporter: text, html
  - coverage.thresholds: same rule as Jest (only named critical paths, no global threshold)
```

### Step 2.3: Add the scripts

Only when `stack.scripts.test` is `null`. A script the app already declares is never renamed or replaced. Add to the app's `package.json`:

```json
{
  "scripts": {
    "test": "jest", // or "vitest"
    "test:watch": "jest --watch", // or "vitest --watch"
    "test:coverage": "jest --coverage" // or "vitest --coverage"
  }
}
```

Then record the choice in the `stack:` block with `bun run agents:setup --stack`, which detects the new runner and script and proposes the values with their evidence. Setup is done when:

- the testing framework is configured;
- the test scripts exist;
- `stack.test_runner` and `stack.scripts.test` are recorded;
- coverage is configured, with thresholds only on named critical paths and delta gates in CI.

## Step 3: Write the unit tests

Goal: a test file for each critical function.

### Step 3.1: Create the test files

Use the naming convention the app's sibling tests already follow (see "The testing framework" above). With no precedent, colocate the test next to the module:

- `src/lib/discount-calculator.ts` -> `src/lib/discount-calculator.test.ts`
- `src/utils/format-currency.ts` -> `src/utils/format-currency.test.ts`

### Step 3.2: Structure each test (AAA)

Template for each critical function. Test names use the present indicative, `returns` and not `should return` (`references/test-naming.md` § Naming heuristics):

```typescript
import { functionName } from './module';

describe('functionName', () => {
  // Happy path tests
  describe('when input is valid', () => {
    it('returns expected result for typical case', () => {
      // Arrange
      const input = validInput;
      const expected = expectedOutput;

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('handles boundary value X', () => {
      // ...
    });

    it('handles empty/null/undefined', () => {
      // ...
    });
  });

  // Error cases
  describe('error handling', () => {
    it('throws for invalid input Y', () => {
      expect(() => functionName(invalidInput)).toThrow();
    });
  });
});
```

### Step 3.3: A complete example

Show the user a complete example when it helps:

```typescript
// src/lib/discount-calculator.test.ts
import { calculateDiscount } from './discount-calculator';

describe('calculateDiscount', () => {
  describe('when order is over $100', () => {
    it('applies 10% discount', () => {
      // Arrange
      const orderAmount = 150;

      // Act
      const result = calculateDiscount(orderAmount);

      // Assert
      expect(result).toBe(135); // 150 - 15 = 135
    });

    it('applies 10% discount for $1000 order', () => {
      expect(calculateDiscount(1000)).toBe(900);
    });
  });

  describe('when order is under $100', () => {
    it('does not apply discount', () => {
      expect(calculateDiscount(50)).toBe(50);
    });

    it('does not apply discount for $99.99', () => {
      expect(calculateDiscount(99.99)).toBe(99.99);
    });
  });

  describe('edge cases', () => {
    it('applies discount at exactly $100 (boundary)', () => {
      expect(calculateDiscount(100)).toBe(90);
    });

    it('returns 0 for a $0 order', () => {
      expect(calculateDiscount(0)).toBe(0);
    });

    it('applies discount to very large orders', () => {
      expect(calculateDiscount(1_000_000)).toBe(900_000);
    });
  });

  describe('error handling', () => {
    it('throws for negative amounts', () => {
      expect(() => calculateDiscount(-50)).toThrow('Order amount must be positive');
    });

    it('throws for NaN', () => {
      expect(() => calculateDiscount(NaN)).toThrow();
    });
  });
});
```

### Step 3.4: Tests with external dependencies

When the function depends on an external service, inject the dependency at the seam first (SKILL.md U7, `references/mocking-patterns.md` § Dependency injection makes mocking easier). The function takes the client as a parameter, and the test passes an explicit fake.

```typescript
// src/lib/user-service.ts
import { supabase as defaultClient } from '@/lib/supabase/client';

export async function getUserById(id: string, client = defaultClient) {
  const { data, error } = await client.from('users').select('id, name').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

// src/lib/user-service.test.ts
import { getUserById } from './user-service';

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => result }) }) }),
  } as unknown as Parameters<typeof getUserById>[1];
}

describe('getUserById', () => {
  it('returns the user row', async () => {
    const client = fakeClient({ data: { id: '123', name: 'John' }, error: null });
    expect(await getUserById('123', client)).toEqual({ id: '123', name: 'John' });
  });

  it('throws the Supabase error message', async () => {
    const client = fakeClient({ data: null, error: { message: 'not found' } });
    await expect(getUserById('123', client)).rejects.toThrow('not found');
  });
});
```

Explain the approach to the user in four points:

- When to replace a dependency: APIs, DB, filesystem, time and randomness, which are the real boundaries of the system.
- How, in order: first dependency injection at the seam with an explicit fake; then `jest.mock()` / `vi.mock()` only when the seam is unavoidable (module-level side effects, a third-party SDK that cannot be injected).
- What to assert: the observable result and error, not the chain of calls on the client (SKILL.md U1).
- Why: fast unit tests that need no external services and are not coupled to the implementation.

## Step 4: Validate the tests

Goal: the tests pass and the coverage is adequate.

### Step 4.1: Run the tests

```bash
[package-manager] run test
```

Check that every test passes (100% pass rate), that there are no import errors and that there are no critical warnings. When a test fails, read the error message, identify which test failed, and decide whether the test is wrong or the function has a bug. Fix it and run again.

### Step 4.2: Validate coverage

```bash
[package-manager] run test:coverage
```

Read the report:

```
----------------------|---------|----------|---------|---------|
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
lib/discount-calculator.ts | 100    | 100      | 100     | 100     |
utils/format-currency.ts   | 95     | 87.5     | 100     | 95      |
----------------------|---------|----------|---------|---------|
```

Check three things:

- Critical functions: branch coverage within the range for their code type (`references/test-coverage.md` § Targets by code type), and no error path left untested.
- Branch coverage: every if/else is covered.
- Function coverage: every exported function is tested.

When coverage is low, list the uncovered branches, add tests for the ones that have behavior of their own (no filler tests to raise the number: SKILL.md U6), and run coverage again.

### Step 4.3: Check test quality

Before moving on, confirm:

- [ ] Tests have descriptive names.
- [ ] The AAA pattern is used.
- [ ] Happy paths and edge cases are tested.
- [ ] Error cases are tested.
- [ ] External dependencies are replaced by injection at the seam, with `jest.mock` / `vi.mock` only where the seam is unavoidable.
- [ ] Tests are independent (no order dependence).
- [ ] Tests are fast (under 1 second each).

## Step 5: Document how to run the tests

When the project has a `README.md`, add a section like this one:

````markdown
## 🧪 Running Tests

### Unit Tests

```bash
# Run all tests (the app's own script: stack.scripts.test)
{{stack.package_manager}} run {{stack.scripts.test}}

# Watch / coverage: the app's own scripts when it declares them; otherwise pass the runner flag
{{stack.package_manager}} run {{stack.scripts.test}} --watch
{{stack.package_manager}} run {{stack.scripts.test}} --coverage
```

### Coverage Requirements

- Coverage is a floor, not a target: CI gates on the coverage delta of each PR, not on a global number
- All critical paths must be tested
````

## Final report

Show the user a report like this one, in the user's language:

````markdown
# Unit tests completed

## Tests created:

### 1. `src/lib/discount-calculator.test.ts`

- 8 test cases
- 100% coverage
- Happy paths, edge cases and error cases covered

### 2. `src/utils/format-currency.test.ts`

- 6 test cases
- 95% coverage
- Different currencies tested

## Metrics:

- **Total tests:** 14
- **Pass rate:** 100% (14/14 passing)
- **Coverage:** 97.5% average
  - Statements: 98%
  - Branches: 95%
  - Functions: 100%
  - Lines: 97%

## Commands:

```bash
# Run tests
{{stack.package_manager}} run {{stack.scripts.test}}

# Watch mode (useful during development)
{{stack.package_manager}} run {{stack.scripts.test}} --watch

# Coverage report
{{stack.package_manager}} run {{stack.scripts.test}} --coverage
```

## Next steps:

1. Unit tests are done.
2. Continue with the implementation of features.
3. Integration / E2E tests are handled separately (out of scope for this skill)
````

## Before you finish

- [ ] The story and the implemented code were read, the critical functions identified and the trivial ones dropped.
- [ ] A runner is configured (set up only when `stack.test_runner` was `null`), and the test scripts exist in `package.json`.
- [ ] Test files exist, follow the naming convention, use AAA and cover happy, edge and error cases, with mocks only where needed.
- [ ] Every test passes, branch coverage of the critical functions was read against `references/test-coverage.md` (a floor, not a goal), there are no critical warnings and each test runs in under 1 second.
- [ ] The README is updated when it applies, and the final report was shown to the user.

## Best practices

### 1. Descriptive test names

Bad:

```typescript
it('test 1', () => { ... })
```

Good:

```typescript
it('applies 10% discount for orders over $100', () => { ... })
```

### 2. AAA pattern (Arrange, Act, Assert)

```typescript
it('formats USD amount with thousands separator', () => {
  // Arrange - Setup
  const amount = 1234.56;
  const currency = 'USD';

  // Act - Execute
  const result = formatCurrency(amount, currency);

  // Assert - Verify
  expect(result).toBe('$1,234.56');
});
```

### 3. Test isolation

Bad (tests depend on order):

```typescript
let user;
it('creates user', () => {
  user = createUser();
});
it('deletes user', () => {
  deleteUser(user.id);
});
```

Good (each test is independent):

```typescript
it('creates user', () => {
  const user = createUser({ name: 'Ana' });
  expect(user).toEqual({ id: expect.any(String), name: 'Ana' });
});

it('deletes user', () => {
  const user = createUser();
  deleteUser(user.id);
  expect(getUser(user.id)).toBeNull();
});
```

### 4. Mock only what you need

Bad (mocking the unit under test):

```typescript
jest.mock('./discount-calculator'); // do NOT mock the unit under test
```

Good (inject the external dependency at the seam):

```typescript
const client = fakeClient({ data: { id: '1', name: 'Ana' }, error: null });
expect(await getUserById('1', client)).toEqual({ id: '1', name: 'Ana' });
```

`jest.mock('@/lib/supabase/client')` is for when the seam is unavoidable (SKILL.md U7).

## References

Jest documentation:

- https://jestjs.io/docs/getting-started
- https://jestjs.io/docs/expect

Vitest documentation:

- https://vitest.dev/guide/
- https://vitest.dev/api/

Testing best practices:

- https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
- https://testingjavascript.com/

Unit tests give confidence when refactoring, and they double as living documentation of the expected behavior.
