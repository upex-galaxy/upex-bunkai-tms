# `.context/business/` — Single Source of Business Knowledge

All "understand the business" outputs live here. Two layers in one folder:

1. **Constitution** — why the product exists (industry, segments, competition).
   Output of `/project-foundation` Phase 1.
2. **Maps** — how the product is built (entities, features, API journeys).
   Output of `/project-foundation` Phase 4 + the three `/business-*` commands.

## Expected files

| File                      | Owner                                    | Phase                              |
| ------------------------- | ---------------------------------------- | ---------------------------------- |
| `business-model.md`       | `/project-foundation` Phase 1            | Business Model Canvas, value prop  |
| `market-context.md`       | `/project-foundation` Phase 1            | Industry, competitors, positioning |
| `legacy-analysis.md`      | `/project-foundation` Phase 1 (optional) | Legacy stack + doc-gap analysis    |
| `business-data-map.md`    | `/business-data-map`                     | Entities, flows, state machines    |
| `business-feature-map.md` | `/business-feature-map`                  | Feature catalog, CRUD matrix       |
| `business-api-map.md`     | `/business-api-map`                      | Auth model, critical journeys      |
| `project-dev-guide.md`    | `/project-foundation` Phase 4 Step 4     | How to build features here         |

## When to refresh

- Constitution files (`business-model.md` / `market-context.md` / `legacy-analysis.md`):
  major product pivot, new MVP cut, market repositioning. Otherwise once-and-done.
- Maps + dev guide: re-run the matching command after architecture changes.

## Skill references that drive generation

- `.claude/skills/project-foundation/references/constitution-business-model.md`
- `.claude/skills/project-foundation/references/constitution-market-context.md`
- `.claude/commands/business-data-map.md` · `business-feature-map.md` · `business-api-map.md`
