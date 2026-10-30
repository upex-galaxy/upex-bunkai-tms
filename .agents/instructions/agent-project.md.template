---
id: project
title: "Project instructions"
load_when: "anything specific to this project: its own rules, conventions, exceptions and its reading of shared doctrine"
triggers: []
paths: []
---

# Project instructions

> Section `project` of the project instructions: the PROJECT-OWNED overlay. Every other file in `.agents/instructions/` is shared doctrine that `bun sync` keeps in step with the boilerplate; this one holds what is true only for this repository, and no sync ever touches it. A rule here may narrow a shared rule for this project and must say which one; it never silently contradicts a Critical Rule.

<!-- Add one `##` heading per topic. Name the source of truth for any value that changes (Critical Rule #17); keep values themselves in `.agents/project.yaml` or the tracker. -->

## Git Strategy (this repository)

None recorded yet. `git-flow-master` reads the strategy and its policy from the `git_strategy:` block of `.agents/project.yaml`; an exception this project accepts on purpose (a host rule it bypasses, a divergence it keeps) is written here, with its reason, by the people who decided it.

## Project context skills

The `<aspect>-context` skills this project created (`/project-context context-skill`), one row each. The prompt hook routes a prompt that matches a row's Triggers to that skill's `SKILL.md`, and `bun run docs:check` counts a skill listed here as rostered. This file survives `bun sync`, so a row here keeps routing after every update; the shared skills section does not. Triggers are backticked, case-insensitive regexes separated by commas; write a `|` inside one as `\|`.

<!-- project-skills:start -->
| Skill | Load when | Triggers | Loaded by |
| --- | --- | --- | --- |
<!-- project-skills:end -->
