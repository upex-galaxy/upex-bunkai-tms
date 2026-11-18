---
name: jira-administration
description: "Administer Jira in two approval-gated modes: Components reconciliation and instance migration. Use when syncing or reconciling Jira components (`jira-components`); when the Jira URL changed, the site migrated or Jira must be repointed (`jira-instance-migration`)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [issue-tracker, meta-skill]
metadata:
  kind: workflow
---

# Jira Administration

Two jobs that change a live Jira or the repo's link to it. Both read first, propose a plan, and write only after approval.

## Mode routing

The first token of `$ARGUMENTS` that names a mode below is the mode, and the rest goes to the reference unchanged: `/jira-administration components BK ../bunkai` on Claude Code, `/skill:jira-administration components BK ../bunkai` on Pi, "load jira-administration, mode components" in prose on OpenCode and Codex. The former `jira-components` and `jira-instance-migration` command names are only phrases a user may still type.

| Mode | When the user says | Reference |
|---|---|---|
| `components` | `jira-components`, reconcile or sync Jira Components | `references/components.md` |
| `instance-migration` | `jira-instance-migration`, the Jira instance changed, repoint Jira | `references/instance-migration.md` |

## Compact Rules

The sealed mutation contract. It binds every run of either mode.

- Take the mode from the first token of `$ARGUMENTS`; with no match, ask, and a bare "fix Jira" or "sync Jira" picks none.
- One mode per run. Load only its reference, never combine the two or fall through into the other, and run only the selected reference's verification steps.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials is a hard stop (`AGENTS.md` Critical Rule #9). Name the exact env var, point at `.env` and `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read the live state before authoring any plan. Nothing is created, applied, deleted or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect, author the plan file, dry-run, wait for explicit approval, then `--apply`.
- `instance-migration`: resolve and confirm both instances, audit and verify reachability, wait for explicit approval, then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global, so a re-login repoints every repo on the host, not only this one.
- The Atlassian host lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and nowhere else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination: delete it, never update it, because a second copy is what goes stale.
- Template-repo carve-out: when `.agents/project.yaml` has `project.project_name` set to `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` as `null`, say so in the report, and do not create a commit to hide the emptiness.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.

## With nobody at the keyboard

Every approval gate in both references follows `agentic-dev-core/references/decision-protocol.md`. A person present holds the gate. A supervised worker reports the plan or audit to its conductor and waits for the answer. A routine counts the delegating brief as approval only when it names this exact change: the mode, the project key and, for a migration, both hosts. Otherwise it does the read-only work (derive, list, dry-run, audit), puts the plan or findings in the report, and stops before any Jira write, credential login, push or message. A worker or routine whose brief names no mode reports that and stops; it does not guess one.

## Composable Skills (auto-resolved at skill entry)

Run once at skill entry, before the selected mode's Phase 0, following `agentic-dev-core/references/skill-composition-strategy.md` §3.

1. Read `complementary_categories` from this skill's frontmatter (`issue-tracker`, `meta-skill`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each match's tier (§2) and apply the threshold rule (§3.2). T1 and T3 matches load silently and are cached for the session. A T4 match is asked once, `"Detected <skill> (T4). Apply for this run? Y/N"`, and the answer is cached; with nobody to ask, skip it and say so in the report.
4. Inject a `## Composable Skills` block per §5.2 into every sub-agent prompt.

Expected matches in this repo:

| Category | Skill | Why it composes |
|---|---|---|
| `issue-tracker` | `/acli` | Owns `[ISSUE_TRACKER_TOOL]`: auth status, site switching, every Jira read this skill performs. Load it before any Jira operation, in both modes. |
| `meta-skill` | `/git-flow-master` | Owns the commit, branch and push contract for the migration mode's Phase 5. Push only with explicit confirmation. |

`acli` cannot create, rename or delete Components, so the components mode drives `scripts/sync-jira-components.ts` against the REST API and not `[ISSUE_TRACKER_TOOL]`. That is a documented limit of the tool, not a bypass of the composition contract.
