# Plan template: `.context/reports/project-adoption-plan.md`

> Written in Phase 2 by `project-adoption`, approved by the user, executed in Phases 3-7, closed in Phase 9. The file is COMMITTED (`.context/reports/` is tracked) so the team reviews the adoption in the same PR as its writes. Never under `.context/PBI/`: that tree is the Jira cache.
> Values below in `<angle brackets>` are filled from the Phase 1 facts; every fact carries its evidence path. A credential VALUE never appears in this file, only variable names.

---

```markdown
# Project adoption plan: <project_name or repo folder>

> Generated: <YYYY-MM-DD>
> Status: PENDING APPROVAL
> Approved by: <name>, <YYYY-MM-DD>        (filled on approval)
> Skill: project-adoption, mode adopt
> Adoption install: .template/installer.lock.json adopted: true, commit <sha>

## 1. Summary

<Three to five sentences: what the app is (framework, database family, hosting), which app root this
adoption covers, what this run will write, and what it deliberately leaves to other skills.>

## 2. Stack descriptor (proposed `stack:` block)

| Path | Proposed value | Evidence | Value in the yaml |
|---|---|---|---|
| app_root | <.> | <apps/web/package.json declares next> | <value> |
| framework | <nextjs-app-router> | <app/ directory> | <value> |
| package_manager | <bun> | <bun.lock> | <value> |
| scripts.<role> | <name or null> | <package.json scripts> | <value> |
| database.* | ... | ... | ... |
| ui.* · hosting · ci · test_runner · conventions.* | ... | ... | ... |

v1 gate (`V1_SUPPORTED`, `cli/lib/stack-descriptor.ts`): <pass | STOP: field, value, evidence>.

## 3. Identity + environments

| Leaf | Value | Source |
|---|---|---|
| project.project_name / project_key / webapp_domain | ... | questionnaire |
| backend.* / frontend.* / database.db_type | ... | stack fingerprint |
| issue_tracker.* | ... | questionnaire |
| testing.default_env | ... | questionnaire |
| environments.<env>.web_url / api_url / db_project_ref | ... | questionnaire |

Environments removed from the yaml (the project does not run them): <list or none>.

## 4. Protected paths

Every file the app already owned that the adoption install found with different content. Each stays the
app's and is added to `updater.protected_paths`:

| Path | Why it collided | Already protected |
|---|---|---|

Framework skills the app had copied in by hand (`take upstream` rows; upstream's copy saved under
`.agents/prompts/adopt-upstream/<name>/`). One approval line each, after reading the row's detail:

| Skill | Files that differ | Only in the app's copy | Decision (take upstream / keep, with why) | Approved |
|---|---|---|---|---|

## 5. Credentials (.env slots, names only)

| Variable | Needed by | Who supplies it |
|---|---|---|

The env file the APP reads (`.env.local` or other) is not touched: <note>.

## 6. Issue tracker

Instance <host> · project <key> · admin permission <yes | no: workflow sync skips>.
Catalog sync: `jira:sync-fields`, `jira:sync-workflows`, `jira:sync-link-types` (never the UPEX reference flag).
Required fields missing on the instance (never created here; fallback per `.agents/jira-required.yaml`):

| Field slug | Fallback | Owner |
|---|---|---|

## 7. Instructions

<None pending | `.agents/prompts/adopt-instructions.md` saved by the adoption run: apply verbatim (Phase 6). The app's own text already sits, verbatim, in `.agents/skills/<app>-context/references/app-instructions.md`.>

- [ ] Apply the saved instruction merge (own approval line: `AGENTS.md` becomes upstream's plus one
      router row to the `<app>-context` skill, `CLAUDE.md` becomes the shim, originals backed up)
- [ ] Legacy layout only: move the `## 0. Project instructions (pre-adoption)` block verbatim into the
      `<app>-context` skill (own approval line, coverage proven before the block is removed)
- [ ] Rewrite the `<app>-context` skill's `description` from the analysis (the preserved text is never touched)

## 8. API contract

<Spec at <url/path>, `api/openapi*` absent before adoption -> `bun run api:sync ...` | skipped: <reason>.>

## 9. App baseline (Phase 1)

| Script (stack.scripts) | Command | Exit code | Duration | First error |
|---|---|---|---|---|
| build | <bun run build> | <0> | ... | ... |
| lint | ... | ... | ... | ... |
| types | ... | ... | ... | ... |
| test | <run | not measured: reason> | ... | ... | ... |

## 10. Team decisions and team-owed prerequisites (never done by this skill)

| Item | Why it matters | Skill that needs it | Proposal |
|---|---|---|---|
| script collision `<name>` | <tooling entry never runs> | <tooling gates> | <composition from parity-plan.md> |
| testing.automation_identity | fail-closed login identity | /sprint-development, /testability-guide | dedicated non-production account |
| autonomous_delivery.automation_gh_account | unattended pushes | /autonomous-delivery | bot account |
| app config reaching the tooling (`tsconfig.json`, ESLint config) | the app's own `tsc` / `next build` / lint judge `cli/` + `scripts/` and fail | the app's own scripts | the snippet in `.agents/prompts/adopt-tooling-isolation.md`, applied by hand |
| foreign hook manager (lefthook, simple-git-hooks, ...) | the framework gates never run until it calls them | tooling gates, commit trailers | the wiring snippet in `.agents/prompts/adopt-tooling-isolation.md` |
| CI / branch protection | ... | ... | ... |

## 11. Questions answered (verbatim)

<Question -> answer, exactly as given in the Phase 1 questionnaire.>

## 12. Discovery Gaps

<Everything unverified: undetected stack fields, a test suite not run, no tracker, no OpenAPI spec.
A missing PRD / SRS is not a gap here: the business maps, dev guide and glossary replace them for an adopted app.>

## 13. Baseline snapshot (Phase 0 signals)

| Subsystem | Signal | State |
|---|---|---|

## 14. Write phases

| Phase | Rows of this plan it executes | Files it may touch |
|---|---|---|
| 3 | §2, §3, §4 | .agents/project.yaml |
| 4 | §5 | .env, harness credential files |
| 5 | §6 | .agents/jira-*.json |
| 6 | §7 | AGENTS.md, CLAUDE.md (+ backups), `.agents/skills/<app>-context/`, the `agent-project.md` pointer |
| 7 | §8 | api/openapi.json, api/openapi-types.ts |

## 15. Approval checklist

- [ ] §2 stack values match the app (or I corrected them above)
- [ ] §3 identity and environments are right
- [ ] §4 every protected path stays the app's
- [ ] §4 each framework skill row carries its own decision and approval
- [ ] §7 instruction merge: apply / leave pending (tick the box in §7 to apply)
- [ ] §10 team items are understood as NOT done by this run
- [ ] Nothing in this plan touches app code, the database, dependencies, CI, git history or Jira configuration
```

---

## Results (appended in Phase 9, header switched to `Status: COMPLETED`)

```markdown
## Results (<YYYY-MM-DD>)

- Files written: <list, agentic surfaces only>
- Verification (Phase 8): <step -> exit code>, app scripts <equal to baseline | difference named>
- Final signals: <table>
- Gaps remaining: <list>
- Team-owed items: <list from §10>
- Next: /project-context refresh-all (fresh session) · /project-foundation Discovery-only (dev guide + glossary) · /git-flow-master Strategy Setup · optional /design-system extract, /testability-guide
```

A later drift run (`Status: COMPLETED` and some signal `PENDING` again) appends `## Drift run <YYYY-MM-DD>` with its own small table and approval line; the closed sections above are never rewritten.
