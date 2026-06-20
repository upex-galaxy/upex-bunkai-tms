# BK-148 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-148)

## Uniqueness and naming

- An environment name MUST be unique within its project, compared case-insensitively after trimming. "Staging" and "staging " are the same name.
- An environment name is trimmed of leading and trailing whitespace before it is saved.
- An environment name MUST be between 1 and 50 characters after trimming. An empty name is rejected.

## Seeded defaults

- Every project starts with two environments, "Staging" and "Production", created with the project.

## Delete guard (PO-CONFIRM — proposed safer default)

- ***Proposed default******:****** BLOCK deletion*** when at least one Run references the environment. The environment cannot be removed while run history depends on it; the user is told how many runs reference it.
- Alternative considered: soft-archive (hide the environment from new-run selection but keep it for history). Recommended only if the team wants to retire environments without losing the ability to remove them later.
- Decision pending PO confirmation. Until confirmed, build the BLOCK behavior — it is non-destructive and preserves run history integrity.

## Default environment (PO-CONFIRM — proposed, optional)

- ***Proposed (optional)******:****** allow marking one environment as the project default***, pre-selected when starting a run. Out of scope for this story unless the PO confirms it should be included; if confirmed, the default cannot be a removed environment and exactly one default exists per project.

---
_Synced from Jira by sync-jira-issues_
