# Mocking Patterns

## Mocks vs spies vs stubs vs fakes

People use these terms interchangeably, but they are four different tools:

| Type | Purpose                                                           | Example                                       |
| ---- | ----------------------------------------------------------------- | --------------------------------------------- |
| Mock | Pre-programmed expectation, fail if not called as expected        | `expect(api).toHaveBeenCalledWith({ id: 1 })` |
| Spy  | Wrap real implementation, observe calls without changing behavior | `jest.spyOn(obj, 'method')`                   |
| Stub | Replace implementation with a fixed return                        | `jest.fn().mockReturnValue(42)`               |
| Fake | Working but simplified implementation                             | In-memory DB instead of Postgres; fake clock  |

Most "mocks" people write are really stubs (canned returns) or spies (call observation). True mocks, whose call expectations fail the test, couple tests to the implementation, so prefer spies and stubs.

## When to mock and when not to

### Mock external dependencies

Replace these in nearly every unit test:

- HTTP calls (`fetch`, `axios`, `got`)
- Database connections / clients
- Filesystem operations (`fs.readFile`, `writeFile`)
- Time and dates: use fake timers or inject a clock
- Random sources: seed the RNG or inject one
- Environment-dependent code (`process.env`, native modules)

They make tests slow, flaky or non-deterministic, and a unit test has to be none of those, so these are not optional.

### Don't mock the unit under test

If you are mocking the function you are testing, you are testing the mock and not the code. Move that test to a higher level (integration), or rethink what the unit actually is.

### Don't mock pure functions

A pure function is deterministic: `add(1, 2)` always returns 3. Mocking it adds noise and no benefit, so call it.

### Avoid mocking what you don't own

A mock of a third-party library ties your test to that library's API shape, and when the library updates, your mocks lie. Wrap the library in a thin adapter you own and mock the adapter.

## Dependency injection makes mocking easier

Without DI you reach for monkey-patching (`jest.mock('./module')`), which is global, fragile and order-dependent. With DI you pass dependencies as arguments and the test becomes trivial.

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

A file-level mock is global to the file and can leak state between tests:

```typescript
jest.mock('./api'); // applies to every test below
```

Set mocks up per test with `beforeEach`/`afterEach` cleanup, or call `mockClear()` / `mockReset()` between tests:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

If your runner supports it, isolate mocks per `describe` block with nested setup. The default is that mocks are scoped, state is reset and nothing leaks.

## Common gotchas

- Forgetting to clear mocks between tests leaks state and produces false positives. Call `clearAllMocks` in `beforeEach`.
- Mocking the wrong path. Module resolvers are tricky: `jest.mock('./api')` and `jest.mock('@/api')` may resolve to different files. Log inside the mock factory to check.
- Mocking a class while the tests still hit the real one. Common when the class is imported as default in one place and named in another. Check the import path.
- Spying without restoring. `jest.spyOn` mutates the target, so call `mockRestore()` in `afterEach` or use `restoreAllMocks`.
- Async mocks that don't await. `mockResolvedValue` and `mockReturnValue` are not interchangeable, and the wrong one breaks silently.
- A mock that returns `undefined` while the assertion is on `undefined`. The test passes for the wrong reason. Use `expect.assertions(N)` or strict typing.

## Examples (Jest / Vitest, near-identical syntax)

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

## When mocking gets painful: move to an integration test

A function with 5 or more mocked dependencies may not be a unit at all, or it may hold orchestration logic that real (or fake) implementations verify better. The symptoms:

- Setting up the mocks takes more lines than the test itself.
- Tests break on every internal refactor (over-mocking).
- You are mocking transitive dependencies (mocks of mocks of mocks).

What to do:

- Extract the orchestration into a thin layer, unit-test the leaf functions and integration-test the orchestrator.
- Use a fake instead of a mock (an in-memory DB, for example): same interface, real behavior, no coupling to the implementation.
- Move the test up a level (integration) and accept the slower runtime.

## Related references

- `tdd-workflow.md`: when mocks block tight cycles (DI helps).
- `test-naming.md`: avoid mock-flavored names like `callsApiOnce`; name the behavior, not the interaction.
- `unit-testing.md`: general testing principles and project conventions.
- `test-coverage.md`: spotting code paths covered only by over-mocked tests.
