# Evidence and Doctrine Lookup

> Read at Step 1 (before gathering the PR) and applied throughout Step 3 of `SKILL.md`.

## The rule

Every finding either points at a line of code, points at a line of doctrine, or is explicitly labeled as opinion. There is no fourth option. "This is generally considered bad practice" with no citation is not a finding: either find the citation or relabel it as your own opinion before it reaches the user.

## Citation format

- **Code evidence**: `<file>:<line>` from the diff; quote or closely paraphrase the actual line(s). Without a local checkout, cite it as it appears in the patch (the `+` line, or the surrounding context when the line itself is unchanged).
- **Doctrine evidence**: `<doctrine file> §<Section>` or `AGENTS.md §N` / `Critical Rule #N`; quote the specific sentence that backs the claim, not "per our conventions." A reader must be able to open that file and find the line you mean. Cite a section heading, never a line number of a doctrine file: those shift on every edit (Critical Rule #17).
- **Opinion, no doctrine backing**: say so in plain words: "this is general engineering opinion, not something this repo's doctrine states" / "esto es una opinión general de buenas prácticas, no está en la documentación de este repo." Never dress an opinion up as a repo rule; it erodes trust in every other citation once the user catches one.

## Doctrine map (this repo)

Load `AGENTS.md` and the sections its router names for this review (`.agents/instructions/`, at least `agent-critical-rules.md` and `agent-code-quickref.md`), then the files the PR actually touches. Widen or narrow per PR; do not load the whole set for a three-line fix.

| The PR touches | Read |
|---|---|
| any code | `AGENTS.md` §1 (Critical Rules), §2 (SIMPLICITY FIRST, SURGICAL CHANGES), §10; `agentic-dev-core/references/typescript-patterns.md`; `sprint-development/references/code-standards.md`; `sprint-development/references/review-pr.md` §"CHECKLIST DE REVIEW" |
| a story's scope | the synced PBI for the story key (`story.md`, `acceptance-criteria.md`, `implementation-plan.md`) via `bun run jira:sync-issues get <KEY>` |
| error paths, API handlers | `sprint-development/references/error-handling.md` |
| backend structure, new modules | `project-bootstrap` SKILL.md rule B1 (layer boundaries `api/` / `schemas/` / `db/`) |
| Postgres functions, RLS, migrations | `sprint-development/references/rpc-authorization.md`; the data map (`bun run context:map business-data-context`) when generated |
| UI | `DESIGN.md`; `.context/design/master-design-plan.md` §2 / §4 / §5 / §8 when present; `AGENTS.md` Critical Rule #14 (incl. LIVE-UI-FIRST); `sprint-development/references/data-testid-standards.md` |
| an architectural choice | `.context/ADR/` (the `Accepted` records it touches); `agentic-dev-core/references/adr-doctrine.md` |
| unit tests | `unit-testing` SKILL.md `## Compact Rules` |
| deploy, env, CI | `sprint-development/references/{pre-deploy-checklist,environment-config,ci-cd-setup}.md` |

## External repo

Never assume an external repo mirrors this one, even if it was visibly scaffolded from the same boilerplate (an `.agents/skills/sprint-development/` folder or a `.context/PBI/` tree is a strong signal, not proof: the fork may have diverged, been partially updated, or never committed `AGENTS.md`). Probe before assuming:

```bash
# Root AGENTS.md (CLAUDE.md may only be a one-line import of it)
gh api "repos/<owner>/<repo>/contents/AGENTS.md" -q '.content' 2>/dev/null | base64 -d

# Its own skill tree
gh api "repos/<owner>/<repo>/contents/.agents/skills" -q '.[].name' 2>/dev/null

# Its .context/ doctrine (ADRs, design plan, business maps)
gh api "repos/<owner>/<repo>/contents/.context" -q '.[].name' 2>/dev/null
```

Any of these returning content (not a 404) means the target repo has its own doctrine: read it and treat it as authoritative for this review, citing its paths, not this repo's. When a doctrine file you would expect is missing but the code clearly follows the same shape, say so instead of silently substituting this repo's copy: "their repo has no `rpc-authorization.md`, so I'm grading the new function against `agentic-dev-boilerplate`'s version; say if you'd rather I skip that check, since it's not something their repo states."

When the external repo has **no** doctrine of any kind, fall back to this repo's doctrine as the reference standard, and say so once, up front, in the Step 4 presentation, not buried in a footnote per finding.

## Reading the PR itself

Commands used in external-repo reviews (adapt owner, repo and number):

```bash
# PR metadata, body, commit list
gh pr view <N> --repo <owner>/<repo> --json title,body,author,commits,files,additions,deletions,state,createdAt,url

# Full file list when the PR has more files than gh pr view's default page returns
gh api "repos/<owner>/<repo>/pulls/<N>/files?per_page=100" --paginate -q '.[].filename' | sort

# One file's patch
gh api "repos/<owner>/<repo>/pulls/<N>/files?per_page=100" --paginate \
  -q '.[] | select(.filename=="<path>") | .patch'

# Whole-PR diff (smaller PRs only; very large ones fail with "PullRequest.diff too_large")
gh pr diff <N> --repo <owner>/<repo> --patch

# Full file content at a commit, when the patch hides the context you need
gh api "repos/<owner>/<repo>/contents/<path>?ref=<commit-sha>" -q '.content' | base64 -d

# Base / head refs and SHAs (confirms base branch and stacked-PR relationships)
gh pr view <N> --repo <owner>/<repo> --json baseRefName,headRefName,baseRefOid,headRefOid

# CI state, so a "CI green" claim can be checked rather than repeated
gh pr checks <N> --repo <owner>/<repo>
```

When a commit message or PR body claims something ("all tests pass", "deployed to staging and verified", "CI green"), treat it as a claim to note, not evidence you verified, unless you can point at the CI run, the deployment, or the test output. A well-evidenced claim earns a Positive ("the author attached the staging deployment URL for the exact SHA, not just 'it works'"); an unverified one is never presented as your own finding.
