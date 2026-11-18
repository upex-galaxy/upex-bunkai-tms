---
id: code-quickref
title: "Stack quick-reference (TypeScript + DRY)"
load_when: "writing or reviewing app code: parameters, imports, types, errors, shared utilities"
triggers: ["typescript", "\\.tsx?\\b", "\\brefactor", "\\bimports?\\b", "\\butil", "code review", "\\bDRY\\b"]
paths: ["src/", "app/", "api/", "lib/", "features/", "platform/", "adapters/"]
---

# Stack quick-reference (TypeScript + DRY)

> Section `code-quickref` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 10. STACK QUICK-REFERENCE (TypeScript + DRY)

The app's stack is the `stack:` block of `.agents/project.yaml` (framework, `app_root`, package manager, script names, database, UI, hosting, test runner, conventions). Read it and assume no Next.js, Supabase, bun or path where the block decides. An app command is `{{stack.package_manager}} run {{stack.scripts.<name>}}`, and a null script is skipped and said so.

The full TypeScript conventions live in the feature dev-guide (Discovery output via `/project-foundation`) when one exists, and otherwise in `.agents/skills/agentic-dev-core/references/typescript-patterns.md`. Load `/sprint-development` before writing or reviewing feature code.

| Pattern        | Rule                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Parameters** | Max 2 positional. 3+ → object param                                                                                                        |
| **Utilities**  | Agnostic only, no domain coupling in shared modules                                                                                        |
| **Imports**    | Always the aliases the app's `tsconfig.json` `paths` declares: `@platform/*`, `@adapters/*`, `@features/*` and `@/*` (`stack.conventions.import_alias`). An adopted app maps its own folders through `settings.guard.layers`. No deep relative imports |
| **Types**      | Declare interfaces at top of file, after imports                                                                                           |
| **Errors**     | Public methods: fail fast (throw). Utilities: silent fail (return null)                                                                    |

**DRY depends on context.**

- `api/schemas/` holds the OpenAPI type facades (`@schemas/{domain}.types`) when the app has them (scaffolded projects do), and is then the single source of truth. An app without them keeps its own type source; do not add the layer to match this line.
- Shared utilities are framework-agnostic: no React, no Next, no Bun-specific APIs.
- Domain logic stays inside its feature folder, `src/features/<name>/`, whose public door is its `index.ts`. Move it to `src/platform/` only when at least 2 features import it and the abstraction is stable.

**GUARD layout.** Code lives in four layers, `src/platform`, `src/adapters`, `src/features/<name>` and `src/app`, and a layer imports only from the layers below it. Layers, rules R1 to R6, the layer map and the example: `.agents/skills/agentic-dev-core/references/guard-architecture.md`.
