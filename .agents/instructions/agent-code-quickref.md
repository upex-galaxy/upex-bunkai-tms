---
id: code-quickref
title: "Stack quick-reference (TypeScript + DRY)"
load_when: "writing or reviewing app code: parameters, imports, types, errors, shared utilities"
triggers: ["typescript", "\\.tsx?\\b", "\\brefactor", "\\bimports?\\b", "\\butil", "code review", "c[oó]digo", "\\bDRY\\b"]
paths: ["src/", "app/", "api/", "lib/"]
---

# Stack quick-reference (TypeScript + DRY)

> Section `code-quickref` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 10. STACK QUICK-REFERENCE (TypeScript + DRY)

> The app's stack is the `stack:` block of `.agents/project.yaml` (framework, `app_root`, package manager, script names, database, UI, hosting, test runner, conventions): read it, never assume Next.js, Supabase, bun or a path where the block decides. An app command is `{{stack.package_manager}} run {{stack.scripts.<name>}}`; a null script is skipped and said so. Full TS conventions live in feature dev-guide (Discovery output via `/project-foundation`) if present, else fallback `.agents/skills/agentic-dev-core/references/typescript-patterns.md`. LOAD `/sprint-development` before writing or reviewing feature code.

| Pattern        | Rule                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Parameters** | Max 2 positional. 3+ → object param                                                                                                        |
| **Utilities**  | Agnostic only, no domain coupling in shared modules                                                                                        |
| **Imports**    | Always the aliases the app's `tsconfig.json` `paths` declares (`stack.conventions.import_alias`, e.g. `@/`; per-layer `@api/`, `@schemas/`, `@utils/` on a scaffolded project). No deep relative imports |
| **Types**      | Declare interfaces at top of file, after imports                                                                                           |
| **Errors**     | Public methods: fail fast (throw). Utilities: silent fail (return null)                                                                    |

**DRY: context matters**:

- `api/schemas/` = OpenAPI type facades (`@schemas/{domain}.types`), when the app has them (scaffolded projects do). Single source of truth. An app without them keeps its own type source; never add the layer to match this line.
- Shared utilities = framework-agnostic only. No React, no Next, no Bun-specific APIs.
- Domain logic stays inside feature folder. Move to `shared/` only when ≥2 features import AND abstraction stable.
