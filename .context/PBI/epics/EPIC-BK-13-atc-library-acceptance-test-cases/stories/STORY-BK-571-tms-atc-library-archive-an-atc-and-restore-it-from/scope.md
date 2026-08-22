# BK-571 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-571)

- Archive a single ATC from the ATC surfaces that exist today inside its owning Project, behind a confirmation that names the ATC, states that archiving is reversible, and states how many Tests currently chain it
- Remove an archived ATC from every surface where ATCs are offered for reuse: its Project's default ATC list, any ATC count shown alongside that list, ATC search, the command palette, and the Test-chain step picker
- An opt-in archived view listing the workspace's archived ATCs, each showing who archived it and when, alongside its name, owning Project, Module, layer and anchored User Story / Acceptance Criterion
- Restore a single ATC from the archived view, returning it to full circulation and making it editable and chainable again
- Allow archiving an ATC that Tests chain, after an explicit warning that names those Tests — never a silent refusal, and never a silent edit of their chains
- Preserve historical evidence unchanged: past Runs, their recorded step content and results, the Traceability chain, and Defects anchored to them all keep rendering an archived ATC in full
- Freeze an archived ATC until restored — not editable, not offered as a new Test chain step
- Restrict archive and restore to members who can already write to the ATC's Project
- One workspace Activity Stream entry per archive and per restore
- Empty, loading, and named-error-with-retry states for the archived view and for both actions

---
_Synced from Jira by sync-jira-issues_
