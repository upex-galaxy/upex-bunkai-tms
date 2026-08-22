# Mockup session prompt — six unmapped stories

> **What this is.** A paste-ready prompt for a dedicated session that authors the missing mockups for
> the six stories created between 2026-08-18 and 2026-08-19. Run it in its own worktree, like a
> routine. It is deliberately NOT part of `discovery` — that mode creates backlog definitions and one
> narrow §8 PR, never design work.
>
> **Prerequisite, already done (2026-08-20, PR #189, merge `4dea9877`).** All six stories have §8 rows
> on `origin/staging`; five carry `🔒 mockup-gated, unratified` and one is marked `⚠️ extension needed`.
> `ADR-0013` ratifies workspace-deletion semantics so BK-512 can be drawn. The prompt below assumes
> that state and starts by verifying it.
>
> **Why a separate session.** Authoring six screens across three shells is long, tool-heavy work with
> its own skill stack. Bundling it into a session doing anything else guarantees one of the two gets
> the short half.

---

## The prompt

```
You are authoring the missing Bunkai TMS mockups for six user stories that reached Backlog with no
screen to build against. You write NO application code. Your deliverables are mockup HTML files,
their BRIEF.md provenance files, the design-plan sections that describe them, and one pull request.

SET UP FIRST

Work in your own git worktree branched from `origin/staging` — this repo's working tree is shared
with other sessions and Critical Rule #13 forbids disturbing it. `git fetch origin` before you branch;
never trust the files on disk as evidence of anything.

Verify the prerequisite state before doing anything else, at `origin/staging`, not locally:
  - `.context/design/master-design-plan.md` §8 contains rows for BK-507, BK-508, BK-512, BK-513,
    BK-554 and BK-555. Five say `🔒 mockup-gated, unratified`; BK-554 says `⚠️ extension needed`.
  - `.context/ADR/ADR-0013-workspace-deletion-semantics.md` exists and is `Accepted`.
If either is missing, STOP and report — the mapping work that precedes this was not merged, and
drawing screens before the §8 rows exist reintroduces exactly the gap this session was created to close.

READ BEFORE YOU DRAW

  - `.context/design/master-design-plan.md` — §2 frozen token contract (the hard boundary), the §8
    rows above (each one states exactly what its screen is missing and why), §5 (ratified departures),
    and the §4.x sections of the neighbouring screens you will sit beside.
  - `DESIGN.md` — the frozen design system.
  - Each story, live, not from cache: `bun run jira:sync-issues get <KEY> --include-comments`, then
    read the generated files under `.context/PBI/`. The acceptance criteria are the specification;
    the mockup must be able to satisfy every scenario in them. BK-507 and BK-508 also carry attributed
    AI Tech Lead / AI Product Owner decision comments that constrain scope — read them.
  - `ADR-0013` before drawing BK-512. It is binding, not advisory.
  - An existing BRIEF.md as the format precedent:
    `.context/designs/bunkai-test-management-tool/bk-31-bug-reports/BRIEF.md`.

THE PROCEDURE — the one this project already uses, not a new one

Every existing mockup batch was generated the same way and yours must match, or the screens will not
sit beside each other:

  1. Write `BRIEF.md` FIRST, in the batch's own folder. It is the contract: mission, product context,
     one section per screen stating WHAT it must accomplish, placement notes for anything ambiguous,
     and an "Export & return" section. It describes WHAT, never HOW — layout, composition, hierarchy,
     component choice, density and micro-interactions are delegated to the generating agent.
  2. Generate through Open Design (MCP-driven, Mode A), one project per batch named
     `bunkai-<batch-slug>`, attaching the design system package `user:bunkai`. That package carries
     the tokens; use its native token names (`--bg-0..5`, `--fg-0..4`, `--accent`,
     `--pass/--fail/--blocked/--skipped/--running`). NEVER paste token values into the brief and
     NEVER invent a color, font, spacing step or radius outside the package. That is the single hard
     boundary on an otherwise delegated task.
  3. Export the screens into `.context/designs/bunkai-test-management-tool/<batch-slug>/` alongside
     their BRIEF.md, matching the naming of the existing batches.

If Open Design is unavailable in your session, say so explicitly and stop rather than substituting a
different tool silently — a screen generated outside the `user:bunkai` package will drift from the
frozen contract in ways that are expensive to find later.

THREE BATCHES, GROUPED BY SHARED SHELL — plus one extension that is not a new screen

Batch grouping is not cosmetic: screens in a batch share the App Shell and are generated together so
their chrome cannot diverge. That is why the existing batches are shaped this way.

  BATCH A — `bk-workspace-indexes` (2 screens)
    BK-513 workspace-wide run index (`/runs`) · BK-555 workspace-wide defect index (`/bugs`)
    These are the SAME promotion `atc-library-global.html` already performed for §4.9: taking a
    project-scoped index and lifting it to workspace scope. Study that screen first and stay
    consistent with it — a Project column, cross-project filtering, and whatever it does about
    project disambiguation. The project-scoped originals (`test-runs-index.html`,
    `bug-reports-index.html`) are the content precedent; do not redesign what they already solved,
    promote it.

  BATCH B — `bk-settings-data-lifecycle` (2 screens)
    BK-508 request an export of my workspace data · BK-512 delete a workspace I own
    Both sit in the §4.10 Settings hub and must reuse `SettingsNav` / `SettingsLayout` chrome
    verbatim. Note that `settings-coming-soon.html` announces four planned sections and Data export
    is not one of them — decide and record in the BRIEF whether export is a fifth section or lives
    inside an existing screen; that placement is a real decision, not a detail.
    BK-512 owes four states, per ADR-0013: sole-owner refusal, members-remain refusal, the
    confirmation treatment, and the post-request 30-day grace state with its restore affordance.
    Note `settings-workspaces.html` already draws **Leave**, which is BK-90 and a DIFFERENT,
    reversible action — the two must not read alike.

  BATCH C — `bk-atc-bulk-edit` (1 screen)
    BK-507 bulk-edit tags, Module and layer on selected ATCs
    Project-scoped ATC list with row selection and a bulk-edit bar. The real design problem is NOT
    the checkbox column — it is what the user sees when 3 of 40 updates fail. Draw the partial-failure
    surface as a first-class state, not an afterthought toast. Scope is tags + Module + layer ONLY:
    ATC `status` is an Execution Status derived from Runs and is deliberately excluded (see BK-507's
    AI Product Owner decision comment and its Out Of Scope field).

  NOT A NEW SCREEN — BK-554 see how flaky a test is across its recent runs
    The host screen already exists: `test-run-history.html` (§4.8). It contains no flakiness,
    stability or intermittency treatment of any kind. Author the metric ONTO that screen as an
    extension and update its §4.8 entry. Do not create a new screen, and do not create a new batch
    folder for it.

WHEN THE SCREENS EXIST

  1. Add or update the `§4.x` section for each batch, matching the shape of §4.6 — screen table with
     file, route(s) and spec highlights including the full states strip.
  2. **Lift the `🔒` in each §8 row**, replacing the gate text with the real mockup citation
     (`§4.x` + file). A row left `🔒` after its mockup exists is worse than one that never had a
     mockup, because it tells the implementer to stop when they should proceed.
  3. If any screen deliberately departs from what a neighbouring mockup established, ratify it in §5
     with a new `D` number and say why. Silent divergence is a defect (Critical Rule #15).
  4. Update §1's scorecard rows if a batch changes their mockup-readiness.

DELIVERY

One PR per batch, base `staging`, so a batch can be rejected without blocking the others. Each PR
body carries: which stories it unblocks, the placement decisions the BRIEF made and why, the states
each screen draws, and the `## Traceability` block including your `Session:` and `Transcript:` lines
per the PR template — this repo added session provenance on 2026-08-20 and it is how a future
investigation finds the conversation behind a screen.

Report at the end: the PR URLs, every file created, every §8 row lifted, every §5 departure ratified,
and any story whose acceptance criteria you could NOT satisfy with a screen — that last one is the
most valuable thing you can return, because it means the story needs refinement, not a mockup.
```

---

## Why the batching is what it is

Grouping by shared App Shell is the convention the existing batches already follow, and it is load
bearing: `bk-31-bug-reports`'s own BRIEF notes that both its screens "share the App Shell (sidebar
with Bug Reports active, topbar)". Two screens of one surface drawn in separate sessions drift.

Batch A is grouped for a second reason: BK-513 and BK-555 are literally the same transformation
applied to two entities, and `atc-library-global.html` already solved it once for ATCs. Drawing them
apart risks two different answers to one question.

## What this session must NOT do

- Write application code, run migrations, or touch anything under `app/`, `lib/` or `supabase/`.
- Re-decide BK-507's field scope or BK-512's deletion semantics. Both are settled and attributed —
  BK-507 in its Jira decision comments, BK-512 in `ADR-0013`.
- Invent tokens. The `user:bunkai` package is the boundary.
