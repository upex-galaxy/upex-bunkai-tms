---
id: ticket-work
title: "AI behavior during development"
load_when: "implementing, explaining or fixing a story or a bug, reporting a defect, or choosing the environment to work against"
triggers: ["\\bstory\\b", "historia", "\\bticket", "\\bbug\\b", "defect", "defecto", "implement", "\\b[A-Z][A-Z0-9]+-\\d+\\b", "\\bsprint"]
paths: []
---

# AI behavior during development

> Section `ticket-work` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 8. AI BEHAVIOR DURING DEVELOPMENT

1. **EXPLAIN STORY**: once ticket understood, briefly state: what feature is, how works (simple terms), what will be developed.
2. **WAIT FOR CONFIRMATION**: after important explanations, WAIT for user response before continuing.
3. **EXPLAIN DEFECTS**: bug / unexpected behavior → describe observed, explain why problem, suggest impact (severity, affected users, business risk).
4. **LANGUAGE**: default English. User writes other language → mirror in user-facing communication. Docs + code ALWAYS English.

**ENVIRONMENT SELECTION**: default = `testing.default_env` in `.agents/project.yaml` (conventionally `staging`; a project with no staging environment names another one) unless user specifies otherwise. Ask when ambiguous. URLs from `.agents/project.yaml` → `environments`. Credentials from `.env`.

**CONTEXT EFFICIENCY**: main conversation stays lean (no large file reads). Subagents do heavy reading. Skills load only references current phase needs.
