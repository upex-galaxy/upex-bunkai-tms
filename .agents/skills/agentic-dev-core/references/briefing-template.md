# Subagent briefing template

> Cited by the workflow skills (`sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, `product-management`) when they delegate to a subagent.
> Every dispatch must fill the 7 components below.

A subagent starts with no memory of your session. It sees its briefing, the compact rules pasted into it and the files the briefing names, and nothing else. The briefing is therefore the whole contract: if a constraint is not in it, the subagent does not know the constraint exists.

## The 7 components

1. Goal. One sentence naming the outcome the subagent must achieve.
2. Context docs. The files the subagent reads before acting, as absolute paths.
3. Project Standards (auto-resolved). Required. The compact rules of the skills relevant to this dispatch, pulled from `.agents/skills/REGISTRY.md` (built once per session by `bun scripts/build-skill-registry.ts`). The subagent treats them as authoritative for the listed conventions and does not re-read the full SKILL.md unless told to. Context skills (`metadata.kind: context`, slug `<aspect>-context`) are included only when the dispatch touches their aspect (`skill-resolver.md`, rule 5). Protocol: `agentic-dev-core/references/skill-resolver.md`.
4. Skills to load. The skill triggers (for example `/acli`, `/git-flow-master`, `/playwright-cli`) the subagent invokes before it issues tool calls. The orchestrator does not inline tool syntax, because that lives in the owning skill.
5. Exact instructions. Numbered steps with no ambiguity, each naming the tool or skill action.
6. Report format. What the subagent returns to the orchestrator: a JSON object with named fields, or a bullet list with explicit headings, not free-form prose. It always includes the two secret-hygiene fields (`secrets_materialized`, `cleaned`, below). A stage dispatch of a stage-owning skill also appends the session-footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `dev_surfaces_touched`, `evidence_captured`) per `agentic-dev-core/references/session-footer-contract.md` §Briefing snippet, and the orchestrator unions them into one session-close footer. It also includes `tokens_used`: the tokens this dispatch measurably spent (K = input plus output, with cache reads apart) plus the source, or `unknown` when the harness shows none. Never an estimate. The orchestrator sums these into the DTU cycle at Ready For QA.
7. Rules. The constraints: the relevant Critical Rules from `AGENTS.md`, project guardrails, Git rules and env-selection rules. This component is the only place a binding prohibition reaches the executor, since a rule that lives only in a `references/*.md` the subagent does not open is not a constraint (`orchestration-doctrine.md`, "Rule reachability"). Two rules ride in component 7 of every Stage 1 and Stage 4 dispatch of `sprint-development`, and in the matching `autonomous-delivery` and fleet briefs:
   - The DTU rule. It is cumulative and optional: read the current `{{jira.development_token_usage}}`, add this cycle's measured delta and never overwrite. Post one `DTU cycle N: +x K (total y K) source=<harness or human>` comment. Write N/A with a reason when no figure exists, and never invent a number.
   - The pickup warn rule. `{{jira.ai_effort}}` High only warns: note it in the plan and the PR description. The story may split into stacked small PRs, and it is never skipped or stopped.
   - Comments (any dispatch that writes or edits code): Critical Rule #18. New and edited code carries no comments except a toolchain directive (`eslint-disable-next-line <rule> -- <reason>`, `@ts-expect-error`, `LINT.IfChange`/`LINT.ThenChange`) or one line of WHY the code cannot express and a reader would otherwise get wrong. No JSDoc blocks, section banners, narrated steps or example TODOs; a check that fires is fixed at its cause or disabled on that one line with its reason.

### Mandatory report fields (every dispatch)

```
secrets_materialized: none | <artifact kinds written to disk>
cleaned: yes | no (<reason>)
```

These follow the ephemeral-artifact contract in `orchestration-doctrine.md`. A dispatch that logs into a running app, captures traffic or holds a token must also carry the contract itself in component 7. `cleaned: no` is a blocker, and the orchestrator surfaces it to the user.

## Filled template (skeleton)

```
Goal: <one sentence>

Context docs:
  - /abs/path/file1.md
  - /abs/path/file2.ts

Project Standards (auto-resolved):
  ## Skill: <slug>
  **Purpose**: <1-line>
  **Compact Rules**:
  - DO: <imperative>
  - DO NOT: <prohibition>
  - WHEN <condition>: <action>
  **Read full SKILL.md when**: <novel scenario>

  ## Skill: <other-slug>
  ... (orchestrator pastes one block per relevant skill, max 5)

Skills to load: /acli, /playwright-cli

Exact instructions:
  1. <step>
  2. <step>
  3. <step>

Report format:
  - <field>: <type>
  - <field>: <type>
  - secrets_materialized: none | <artifact kinds>
  - cleaned: yes | no (<reason>)

Rules:
  - <Critical Rule reference>
  - <project guardrail>
  - <every binding prohibition this dispatch could trip, restated verbatim>
```

The orchestrator builds the `Project Standards (auto-resolved)` section from `.agents/skills/REGISTRY.md` (protocol in `agentic-dev-core/references/skill-resolver.md`).

---

## Examples (one per pattern)

### Parallel: download the artifacts of a CI run

When a CI run finishes, the orchestrator fans out one subagent per artifact the run uploaded. The artifacts are independent (different artifact, different output directory), so Parallel fits.

```
Goal: Download the <<ARTIFACT_NAME>> artifact of CI run <<RUN_ID>> into the local artifacts directory.

Context docs:
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.github/workflows/ci.yml

Skills to load: (none: this is a pure gh CLI task)

Exact instructions:
  1. Run: gh run download <<RUN_ID>> -n <<ARTIFACT_NAME>> -D ./artifacts/<<RUN_ID>>/<<ARTIFACT_NAME>>
  2. If the directory is empty after the download, report a download failure and STOP (do not retry).
  3. Count the files in the directory.

Report format:
  {
    "artifact": "<<ARTIFACT_NAME>>",
    "runId": "<<RUN_ID>>",
    "downloadDir": "./artifacts/<<RUN_ID>>/<<ARTIFACT_NAME>>",
    "fileCount": <number>,
    "status": "ok" | "download-failed"
  }

Rules:
  - Critical Rule #16: a zero exit code from the download describes the call, not the outcome. Verify the files exist.
  - Do not delete prior artifacts/* directories: the orchestrator may diff runs.
```

The sibling agents follow the same shape, one per remaining artifact. All of them dispatch in the same `<function_calls>` block so the network I/O overlaps.

### Background: watch a GitHub Actions run

A CI run can take tens of minutes. The orchestrator dispatches one background subagent that blocks on `gh run watch` and notifies the main thread when the run terminates. Background fits because the work is long, idle on the orchestrator's side and monitorable from outside.

```
Goal: Block on `gh run watch <<RUN_ID>>` until the workflow run reaches a terminal state, then return the verdict.

Context docs:
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.github/workflows/ci.yml

Skills to load: (none: pure gh CLI)

Exact instructions:
  1. Capture start time as ISO-8601 (date -Iseconds).
  2. Run: gh run watch <<RUN_ID>> --exit-status (this blocks until terminal).
  3. Capture exit code (0 = success, non-zero = failure).
  4. Run: gh run view <<RUN_ID>> --json conclusion,status,startedAt,updatedAt -q '.'
  5. Compute duration in seconds (updatedAt - startedAt).
  6. Run: gh run view <<RUN_ID>> --log-failed | grep -E '^FAIL' | wc -l (best-effort failed-test count; 0 if no log).

Report format:
  {
    "runId": "<<RUN_ID>>",
    "status": "completed",
    "conclusion": "success" | "failure" | "cancelled" | "timed_out",
    "exitCode": <number>,
    "durationSeconds": <number>,
    "failedTestCount": <number>
  }

Rules:
  - Critical Rule #6: do not interpret failure types here. Classification belongs to the orchestrator's analysis.
  - Do not retry the watch. If it errors, report and let the orchestrator decide.
```

### Sequential: Planning, Implementation, Code Review in sprint-development

In `sprint-development` the three stages have a strict data dependency: Implementation reads what Planning wrote, and Code Review reads what Implementation wrote. Sequential is the only correct pattern.

```
Stage 1 — Planning agent
============================

Goal: Produce an implementation plan for ticket <<ISSUE_KEY>> under .context/PBI/epics/EPIC-<<EPIC_KEY>>-<<EPIC_SLUG>>/stories/STORY-<<ISSUE_KEY>>-<<STORY_SLUG>>/implementation-plan.md.

Context docs:
  - bun run context:map business-data-context      (data map: run the reader, never read the HTML)
  - bun run context:map business-feature-context   (feature map)
  - bun run context:map business-api-context       (API map)
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.context/business/project-dev-guide.md
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.context/master-implementation-plan.md
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.context/PBI/epics/EPIC-<<EPIC_KEY>>-<<EPIC_SLUG>>/stories/STORY-<<ISSUE_KEY>>-<<STORY_SLUG>>/context.md
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.agents/skills/sprint-development/references/story-plan.md

Skills to load: /acli (to fetch the ticket if spec.md is missing fields)

Exact instructions:
  1. Load the ticket via [ISSUE_TRACKER_TOOL] Get Issue: <<ISSUE_KEY>>.
  2. Read every doc in Context docs above (the business maps through their `bun run context:map` command; a placeholder notice means no map).
  3. Map each AC to a concrete task (file to touch + change shape).
  4. Identify required new endpoints / schemas / migrations and flag pre-requisites.
  5. Author the implementation plan using the story-plan template, write it to the Jira `spec_implementation_plan` field (fallback: a comment) via [ISSUE_TRACKER_TOOL], then materialize the read-only cache with `bun run jira:sync-issues get <<ISSUE_KEY>>` (produces implementation-plan.md in the story folder).
  6. List any open questions that block coding (ambiguous AC, missing schema, etc.).

Report format:
  - implPlanPath: absolute path to implementation-plan.md (Jira-synced read-only cache)
  - tasksListed: [{ id, ac_id, files_touched, change_shape }]
  - prerequisites: [{ kind, description }]
  - openQuestions: [...]

Rules:
  - Critical Rule #2 (Plan Before Coding): no production code yet. Stop after writing the plan.
  - Critical Rule #1 (Credentials by name): if the plan needs credentials, reference .env keys, never hardcode.
  - Surgical Changes: list only files that the AC forces you to touch. Adjacent cleanup is out of scope.
```

The Implementation agent and the Code Review agent each receive the same shape with their own Goal, Skills, Instructions and Report fields. The orchestrator dispatches them one at a time and feeds Stage N's report into Stage N+1's Context docs.

### Single: one-shot file edit with verification

Sometimes there is exactly one task with no fan-out and no follow-up. Use Single when the task is non-trivial enough to deserve isolation and small enough not to need staging.

```
Goal: Add the standard Dependencies block to .agents/skills/agentic-dev-onboard/SKILL.md and verify the markdown still renders cleanly.

Context docs:
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.agents/skills/agentic-dev-core/SKILL.md
  - /home/sai/Desktop/upex/web-apps/agentic-dev-boilerplate/.agents/skills/agentic-dev-onboard/SKILL.md

Skills to load: (none)

Exact instructions:
  1. Read agentic-dev-onboard/SKILL.md.
  2. Insert the Dependencies block (per agentic-dev-core/SKILL.md §"Dependency declaration for downstream skills") immediately after the frontmatter, before the first H1.
  3. Run: bun run vars:check (must exit 0).
  4. Run: bun run types:check (must exit 0).

Report format:
  - filesChanged: [.agents/skills/agentic-dev-onboard/SKILL.md]
  - lintExitCode: <number>
  - typeCheckExitCode: <number>
  - diff: <unified diff snippet>

Rules:
  - Critical Rule #7 (File Operations): preserve existing formatting and indentation.
  - Critical Rule #6 (Quality Verification): if either verification step fails, report and STOP. Do not auto-fix.
```

---

## Anti-patterns: do not delegate

- Quick lookups (one or two file reads). An inline `Read` is faster and skips the subagent overhead.
- Memory reads and writes. The orchestrator owns memory. Subagents never read or write persistent memory and never edit `AGENTS.md` or an instruction section. `AGENTS.md` (L0) loads by itself in every session, and a subagent reads only the `.agents/instructions/` sections its briefing names.
- Task tracking (TaskCreate, TaskUpdate, progress files). The orchestrator owns tasks.
- Asking the user for input. Only the orchestrator can prompt the user. A subagent that meets a question runs `decision-protocol.md` first. A technical call inside the approved plan is decided and reported as DECIDED with the option it beat. Only the four §5 kinds (product behaviour, a new security posture, an irreversible or outward action, what the stage or the owner reserves) stop the subagent and go back to the orchestrator.
  - Supervised workers are the one exception. For a §5 question, a persistent worker launched through `/agent-orchestration` sends its conductor an `ask` over the run mailbox and ends its turn instead of stopping (Orca wakes it with the answer), and still never prompts the user, because nobody watches its terminal. Subagents keep stop-and-report for the §5 kinds.
- Planning. The orchestrator owns the plan and decides what happens next. Subagents execute the planned steps and decide only the technical calls inside them, reported as DECIDED.
- Sleeping or polling. If you would `sleep`, you wanted the Background pattern.
- Running tests on someone else's behalf. Verification belongs to the agent that made the change, so a "verify" agent for a one-step edit is waste.

---

## Error protocol (mirrors AGENTS.md §3, Orchestration Mode)

When a subagent fails:

1. Stop. Do not auto-retry.
2. Report full context to the orchestrator: which step failed, the error message and the partial output if any.
3. The orchestrator surfaces the options to the user: retry, skip or abort.
4. Do not auto-fix without approval. The user may need to fix env config, restore credentials or re-scope the task.
5. Files a failed subagent already wrote are not cleaned up automatically. The orchestrator decides whether to restore.

When in doubt, the live `AGENTS.md` is canonical.
