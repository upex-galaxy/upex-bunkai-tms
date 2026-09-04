# Mocking Patterns

## Mocks vs spies vs stubs vs fakes

These terms get used interchangeably, but they're distinct tools:

| Type | Purpose                                                           | Example                                       |
| ---- | ----------------------------------------------------------------- | --------------------------------------------- |
| Mock | Pre-programmed expectation, fail if not called as expected        | `expect(api).toHaveBeenCalledWith({ id: 1 })` |
| Spy  | Wrap real implementation, observe calls without changing behavior | `jest.spyOn(obj, 'method')`                   |
| Stub | Replace implementation with a fixed return                        | `jest.fn().mockReturnValue(42)`               |
| Fake | Working but simplified implementation                             | In-memory DB instead of Postgres; fake clock  |

Practical rule: most "mocks" people write are actually stubs (canned returns) or spies (call observation). True mocks (call expectations that fail the test) tend to over-couple tests to implementation. Prefer spies and stubs.

## When to mock vs not

### Mock external dependencies (almost always)

- HTTP calls (`fetch`, `axios`, `got`)
- Database connections / clients
- Filesystem operations (`fs.readFile`, `writeFile`)
- Time and dates — use fake timers or inject a clock
- Random sources — seed the RNG or inject one
- Environment-dependent code (`process.env`, native modules)

These make tests slow, flaky, or non-deterministic. Mocking them is non-negotiable for unit tests.

### Don't mock the unit under test

If you find yourself mocking the function you're testing, you're testing the mock, not the code. Move that test to a higher level (integration), or rethink what the unit actually is.

### Avoid mocking pure functions

Pure functions are deterministic — `add(1, 2)` always returns 3. Mocking them adds noise without benefit. Just call them.

### Avoid mocking what you don't own (when possible)

Mocking a third-party library couples your test to that library's API shape. When the library updates, your mocks lie. Prefer wrapping third-party libs in a thin adapter you own, then mock the adapter.

## Dependency injection makes mocking easier

Without DI, you reach for monkey-patching (`jest.mock('./module')`), which is global, fragile, and order-dependent. With DI, you pass dependencies as arguments — testing is trivial.

**Before (hard to test):**

```typescript
// service.ts
import { db } from './db';
export async function getUser(id: string) {
  return db.users.findOne({ id });
}
```

**After (easy to test):**

```typescript
// service.ts
export async function getUser(id: string, db = defaultDb) {
  return db.users.findOne({ id });
}

// service.test.ts
it('returns the user', async () => {
  const fakeDb = { users: { findOne: async () => ({ id: '1', name: 'A' }) } };
  expect(await getUser('1', fakeDb)).toEqual({ id: '1', name: 'A' });
});
```

No `jest.mock`, no module-resolution gymnastics. The function declares what it needs.

## Mock placement: top of file vs per-test

File-level mocks are global to the file and risk pollution between tests:

```typescript
jest.mock('./api'); // applies to every test below
```

Prefer per-test mock setup with `beforeEach`/`afterEach` cleanup, or use `mockClear()` / `mockReset()` between tests:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

If your test runner supports it, isolate mocks per `describe` block using nested setup. The default should be: mocks are scoped, state is reset, no leakage.

## Common gotchas

- **Forgetting to clear mocks** between tests → state leakage, false positives. Use `clearAllMocks` in `beforeEach`.
- **Mocking the wrong path**. Module resolvers are tricky — `jest.mock('./api')` and `jest.mock('@/api')` may resolve to different files. Verify by logging in the mock factory.
- **Mocking a class but tests still hit the real one**. Common when the class is imported as default vs named. Check the import path.
- **Spying without restoring**. `jest.spyOn` mutates the target — call `mockRestore()` in `afterEach` or use `restoreAllMocks`.
- **Async mocks that don't await**. `mockResolvedValue` vs `mockReturnValue` — using the wrong one causes silent breakage.
- **Mock returns `undefined` and the assertion is on `undefined`**. The test passes for the wrong reason. Prefer `expect.assertions(N)` or strict typing.

## Examples (Jest / Vitest — syntax is near-identical)

```typescript
// Pure stub: fixed return
const formatter = jest.fn().mockReturnValue('formatted');
expect(formatter(123)).toBe('formatted');

// Spy: observe a real method
const spy = jest.spyOn(logger, 'info');
doWork();
expect(spy).toHaveBeenCalledWith('work done');
spy.mockRestore();

// Mock module
jest.mock('./api', () => ({
  fetchUser: jest.fn().mockResolvedValue({ id: '1' }),
}));

// Fake timer
jest.useFakeTimers();
setTimeout(callback, 1000);
jest.advanceTimersByTime(1000);
expect(callback).toHaveBeenCalled();
jest.useRealTimers();

// Vitest equivalents: vi.fn(), vi.spyOn(), vi.mock(), vi.useFakeTimers()
```

## When mocking gets painful → integration test

If a function takes 5+ mocked dependencies, the unit might not really be a unit — or the unit is testing orchestration logic that's better verified with real (or fake) implementations. Symptoms:

- Setting up mocks takes more lines than the test itself
- Tests break every time you refactor internals (over-mocking)
- You're mocking transitive dependencies (mocks of mocks of mocks)

Solutions:

- Extract the orchestration into a thin layer; unit-test the leaf functions, integration-test the orchestrator
- Use a fake instead of a mock (e.g., in-memory DB) — same interface, real behavior, no implementation coupling
- Move the test up a level (integration test) and accept the slower runtime

## Related references

- See `tdd-workflow.md` for when mocks block tight cycles (DI helps)
- See `test-naming.md` — avoid mock-flavored names like `callsApiOnce` (test behavior, not interactions)
- See `unit-testing.md` for general testing principles + project conventions
- See `test-coverage.md` for spotting code paths that are only covered by over-mocked tests
