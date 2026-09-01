---
name: jira-components
description: Reconcile a Jira project's Components against the target application's real functional modules, driving `scripts/sync-jira-components.ts` through a plan file the user approves before anything is written. Derives the module map from two inputs — the app's source (what exists) and the backlog's Epics/Stories (what is coming) — then renames or creates components, never deleting. Triggers on 'jira components', 'sync jira components', 'reconciliar componentes de jira', 'crear componentes', 'component map', 'módulos funcionales en Jira', 'los componentes de Jira están desactualizados'. Do NOT use for: setting a component on an individual issue (use /acli), Jira field / workflow / link-type catalogs (run `bun run jira:sync-*`), or repointing the Atlassian instance (use `/jira-instance-migration`).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
argument-hint: [project-key] [target-source]
---

Invoke skill `jira-administration` in mode `components`.
Load only `references/components.md`. Forward `$ARGUMENTS` unchanged.
