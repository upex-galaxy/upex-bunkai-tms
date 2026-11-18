---
id: ticket-work
title: "AI behavior during development"
load_when: "implementing, explaining or fixing a story or a bug, reporting a defect, or choosing the environment to work against"
triggers: ["\\bstory\\b", "\\bticket", "\\bbug\\b", "defect", "implement", "\\b[A-Z][A-Z0-9]+-\\d+\\b", "\\bsprint"]
paths: []
---

# AI behavior during development

> Section `ticket-work` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 8. AI BEHAVIOR DURING DEVELOPMENT

1. Once you understand the ticket, say in simple terms what the feature is, how it works and what will be developed.
2. After an important explanation, wait for the person's reply before continuing (nobody present: see the last section).
3. On a bug or unexpected behavior, describe what you observed, why it is a problem and its impact (severity, affected users, business risk).
4. Language follows §1 rule 12: the conversation mirrors the user's language, and docs and code are always English.

## Environment selection

The default is `testing.default_env` in `.agents/project.yaml`, conventionally `staging` (a project with no staging environment names another one), unless the person names a different one. Ask when it is ambiguous. URLs come from `environments` in `.agents/project.yaml` and credentials from `.env`.

## Context efficiency

The main conversation stays lean: subagents do the heavy reading, and a skill loads only the references its current phase needs.

## With nobody at the keyboard

A supervised worker sends the confirmation gate of item 2 and an ambiguous environment to its conductor or launcher. A routine, including `autonomous-delivery`, never waits for a person: its delegating brief is the approval source for every decision it covers. Without one, it does the reversible work and reports instead of asking. The story explanation goes in the report, and the environment is the default one, stated in the report. Whether a question reaches a person at all follows `agentic-dev-core/references/decision-protocol.md`.
