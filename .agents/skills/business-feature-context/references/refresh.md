# Refresh: keeping `business-feature-map.html` honest

> Loaded by `business-feature-context` when a session observes something the map contradicts, or when someone asks whether the map is stale. The generic procedure (anatomy, the five steps, the write scope) is SYNCED doctrine in `agentic-dev-core/references/business-context-maps.md` §5-§6; this file holds only what is specific to this aspect, and it is the project's own.

## Staleness signals for this aspect

| Signal in `data-sources` | Stale when | Check |
|---|---|---|
| `route:<path>` / a page or component path | a commit touched it after `data-updated` | `git log --since=<data-updated> --oneline -- <path>` |
| a feature observed in the running app | the real UI offers an action, shows a state or takes a branch the section does not describe | the session's own evidence (screenshot path, session label) |
| a feature flag or a role gate | its definition changed | `git log` on the flag or role definition |
| a data or API flow the feature crosses | the owning section of `business-data-context` or `business-api-context` changed | that skill's `bun run context:map <slug> --list` dates |

A section with no declared sources is `unknown`, never fresh.

## Two paths, never mixed

| Situation | Who writes | How |
|---|---|---|
| one section contradicted by something a session observed | this skill, after approval | the five steps of `agentic-dev-core/references/business-context-maps.md` §6: locate, evidence, PROPOSE, apply on approval, verify |
| several sections stale, or something new the map lacks | `project-context` mode `features` UPDATE | it regenerates only the stale sections and shows a section-level diff; hand the user that mode, do not rebuild sections here |

## The proposal, in one message

```
business-feature-context · proposed edit to section <id> (updated <date>)
evidence: <what was observed, how, where: query / request / file@commit / session label>
before: <the sentence or row as the map has it>
after:  <the replacement>
figure: <unchanged | redraw: why>
apply? (yes / no)
```

Verify the edit against the running app or the route file before proposing it. Only `yes` applies it; silence is not approval.

## Never

- Edit a file outside this skill's `references/`.
- Rewrite a section that was not contradicted, or regenerate the whole map.
- Change a section id: a renamed entity, feature or route group is a new section plus one line in `discovery-gaps` for one refresh.
