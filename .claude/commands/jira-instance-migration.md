---
name: jira-instance-migration
description: Repoint this repo at a new Atlassian/Jira instance after a site migration, and regenerate the `.agents/` catalogs whose custom-field IDs the migration invalidated. Takes two inputs (source instance, target instance); detects the source from the repo and asks for whatever is missing before touching anything. Triggers on 'jira instance migration', 'migrar la instancia de jira', 'cambió la URL de Jira', 'jira site migration', 'we moved Jira workspaces', 'repoint jira', 'nuevo site de jira', 'actualizar ATLASSIAN_URL', 'the jira URL changed'. Do NOT use for: first-time Jira setup (see docs/setup/jira-setup-guide.md), routine catalog refresh with no instance change (run `bun run jira:sync-*` directly), Jira Components reconciliation (use `/jira-components`), or Jira ticket operations (use /acli).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
argument-hint: [source-host] [target-host]
---

Invoke skill `jira-administration` in mode `instance-migration`.
Load only `references/instance-migration.md`. Forward `$ARGUMENTS` unchanged.
