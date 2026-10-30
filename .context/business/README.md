# `.context/business/` — Single Source of Business Knowledge

The authored "understand the business" files live here. Two layers:

1. **Constitution** — why the product exists (industry, segments, competition).
   Output of `/project-foundation` Phase 1.
2. **Maps** — how the product is built (entities, features, API journeys).
   Output of `/project-foundation` Phase 4 through `/project-context data` / `features` / `api`.
   They live as HTML maps inside the `business-data-context`, `business-feature-context` and
   `business-api-context` skills, not in this folder; read one with `bun run context:map <slug>`.

## Expected files

| File                                 | Owner                                        | Phase                                                                                                                                |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `business-model.md`                  | `/project-foundation` Phase 1                | Business Model Canvas, value prop                                                                                                    |
| `market-context.md`                  | `/project-foundation` Phase 1                | Industry, competitors, positioning                                                                                                   |
| Business maps (data / feature / API) | `/project-context data` / `features` / `api` | HTML maps inside `business-data-context`, `business-feature-context`, `business-api-context`; read with `bun run context:map <slug>` |
| `project-dev-guide.md`               | `/project-foundation` Phase 4 Step 4         | How to build features here                                                                                                           |

On an existing app (adopted) the Constitution files are not written: `business-model.md` and `market-context.md` stay absent, and the maps, `project-dev-guide.md` and `domain-glossary.md` are produced from the code (`/project-context refresh-all`, then `/project-foundation` Discovery-only).

## When to refresh

- Constitution files (`business-model.md` / `market-context.md`):
  major product pivot, new MVP cut, market repositioning. Otherwise once-and-done.
- Maps + dev guide: re-run the matching `/project-context <mode>` (maps) or `/project-foundation` step (dev guide) after architecture changes.

## Skill references that drive generation

- `.agents/skills/project-foundation/references/constitution-business-model.md`
- `.agents/skills/project-foundation/references/constitution-market-context.md`
- `.agents/skills/project-context/references/data.md` · `features.md` · `api.md` (modes of the `project-context` skill, invoked as `/project-context <mode>`)
