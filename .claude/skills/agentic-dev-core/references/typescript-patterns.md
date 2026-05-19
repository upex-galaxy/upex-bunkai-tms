# TypeScript Patterns — Full Reference

> Loaded on demand. CLAUDE.md §10 holds the 5-row quick-reference + 3-bullet DRY block. Full conventions and rationale live here. If a feature dev-guide (produced by `/project-foundation` Discovery) exists, prefer that — this file is the always-present fallback.

---

## Core patterns

| Pattern        | Rule                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| **Parameters** | Max 2 positional. 3+ → use object parameter                                    |
| **Utilities**  | Agnostic utilities only — no domain coupling in shared modules                 |
| **Imports**    | Always use aliases (`@api/`, `@schemas/`, `@utils/`). No deep relative imports |
| **Types**      | Define interfaces at top of file, after imports                                |
| **Errors**     | Public methods: fail fast. Utilities: silent fail (return null)                |

---

## Parameters — `max 2 positional`

If a function needs three or more inputs, switch to an object parameter. Object params survive reordering, allow optional fields, and self-document at call sites.

```ts
// ❌ too many positional
function createUser(name: string, email: string, role: string, plan: string) { … }

// ✅ object param
function createUser({ name, email, role, plan }: CreateUserInput) { … }
```

Exception: well-established conventions (`map((item, index) => …)`, `reducer(state, action)`).

---

## Utilities — agnostic only

Shared utility modules (`utils/`, `lib/`) MUST NOT import domain types. If a utility needs a domain shape, accept it via generic or callback. Coupling utilities to domain creates circular dependencies and makes refactors painful.

- ✅ `formatCurrency(amount: number, locale: string)` → goes in `utils/`
- ❌ `formatInvoiceTotal(invoice: Invoice)` → belongs in `features/invoicing/`

---

## Imports — aliases, never deep relative

```ts
// ❌
import { UserRepo } from '../../../api/repos/user-repo';

// ✅
import { UserRepo } from '@api/repos/user-repo';
```

Deep relative imports break under refactor and hide module boundaries. Aliases (`@api/`, `@schemas/`, `@utils/`, `@db/`, `@features/`) make the dependency graph readable.

---

## Types — declare at top

Order inside a file:

1. External imports
2. Internal imports (aliases)
3. Type / interface declarations
4. Constants
5. Functions / classes / exports

Keeping types at the top means a reader sees the contract before the implementation.

---

## Errors — fail fast vs silent fail

| Layer                                                   | Style                                          | Why                                                                      |
| ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Public API methods (route handlers, exported functions) | **Fail fast** — throw with a clear message     | Caller knows immediately what's wrong; stack trace points to the source  |
| Internal utilities (helpers, parsers, formatters)       | **Silent fail** — return `null` or `undefined` | Utility shouldn't decide policy; caller decides whether absence is fatal |

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

Never catch-and-ignore. If you catch, log + rethrow or convert to a typed error. Swallowed errors mask production bugs for weeks.

---

## DRY — context matters

Three rules of thumb for where shared code belongs:

- `api/schemas/` — OpenAPI type facades (`@schemas/{domain}.types`). Single source of truth for API contracts.
- Shared utilities (`utils/`, `lib/`) — framework-agnostic only. No React, no Next, no Bun-specific APIs.
- Domain logic stays inside its feature folder (`features/{domain}/`). Move it to `shared/` only when ≥2 features import it AND the abstraction is stable.

Three similar lines is better than a premature abstraction. Don't extract on the second occurrence — wait for the third, and only if the duplicate has the same _reason to change_. Coincidentally-similar code with different reasons to change should stay duplicated.
