# TypeScript patterns: full reference

Loaded on demand. `.agents/instructions/agent-code-quickref.md` §10 holds the 5-row quick reference and the 3-bullet DRY block; the full conventions and reasons live here. When a feature dev-guide (from `/project-foundation` Discovery) exists, prefer it: this file is the fallback.

---

## Core patterns

| Pattern        | Rule                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parameters** | At most 2 positional. With 3 or more, use an object parameter                                                                                     |
| **Utilities**  | Agnostic utilities only, with no domain coupling in shared modules                                                                                |
| **Imports**    | Use the aliases `tsconfig.json` `paths` declares (GUARD: `@platform/`, `@adapters/`, `@features/`, `@/`). No deep relative imports          |
| **Types**      | Define interfaces at the top of the file, after imports                                                                                           |
| **Errors**     | Public methods fail fast. Utilities fail silently (return null)                                                                                   |

---

## Parameters: at most 2 positional

With three or more inputs, switch to an object parameter. It survives reordering, allows optional fields, and documents itself at the call site.

```ts
// ❌ too many positional
function createUser(name: string, email: string, role: string, plan: string) { … }

// ✅ object param
function createUser({ name, email, role, plan }: CreateUserInput) { … }
```

Established conventions are the exception (`map((item, index) => …)`, `reducer(state, action)`).

---

## Utilities: agnostic only

Shared utility modules (`utils/`, `lib/`) import no domain types. A utility that needs a domain shape takes it through a generic or a callback, since domain coupling creates circular dependencies and painful refactors.

- ✅ `formatCurrency(amount: number, locale: string)` goes in `utils/`
- ❌ `formatInvoiceTotal(invoice: Invoice)` belongs in `features/invoicing/`

---

## Imports: aliases, not deep relative paths

```ts
// ❌
import { UserRepo } from '../../../api/repos/user-repo';

// ✅
import { UserRepo } from '@api/repos/user-repo';
```

Deep relative imports break under refactor and hide module boundaries; aliases keep the dependency graph readable. Use the ones `tsconfig.json` `paths` declares. A GUARD app declares `@platform/*`, `@adapters/*`, `@features/*` and the root `@/*` (`references/guard-architecture.md`). An adopted app may keep its own prefixes, mapped to layers through `settings.guard.layers`. Do not invent a prefix the config lacks.

---

## Types: declare at the top

Order inside a file:

1. External imports
2. Internal imports (aliases)
3. Type and interface declarations
4. Constants
5. Functions, classes and exports

A reader then sees the contract before the implementation.

---

## Errors: fail fast or fail silently

| Layer                                                   | Style                                          | Why                                                                      |
| ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Public API methods (route handlers, exported functions) | **Fail fast**: throw with a clear message      | The caller learns what is wrong at once, and the stack trace points to the source |
| Internal utilities (helpers, parsers, formatters)       | **Silent fail**: return `null` or `undefined`  | A utility does not decide policy; the caller decides whether absence is fatal |

```ts
// ✅ public: throw
export async function getUser(id: string): Promise<User> {
  const user = await db.users.find(id);
  if (!user) throw new NotFoundError(`User ${id} not found`);
  return user;
}

// ✅ utility: return null
export function parseIsoDate(input: string): Date | null {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}
```

Do not catch and ignore. A catch logs and rethrows, or converts to a typed error, because swallowed errors hide production bugs for weeks.

---

## DRY: context matters

Where shared code belongs:

- `api/schemas/` holds the OpenAPI type facades (`@schemas/{domain}.types`), the single source of truth for API contracts.
- Shared utilities (`utils/`, `lib/`) stay framework-agnostic: no React, no Next, no Bun-specific APIs.
- Domain logic stays inside its feature folder (`src/features/{domain}/`, public door `index.ts`). Move it to `src/platform/` only when two or more features import it and the abstraction is stable.

Three similar lines are better than a premature abstraction. Wait for the third occurrence rather than extracting on the second, and extract only when the duplicates share the same _reason to change_. Code that looks alike but changes for different reasons stays duplicated.
