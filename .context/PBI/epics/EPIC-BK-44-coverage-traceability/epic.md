# EPIC: Coverage & Traceability

**Jira Key:** [BK-44](https://jira.upexgalaxy.com/browse/BK-44)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 29

---

## Description

Coverage & Traceability turns the test assets a team already maintains — user stories, acceptance criteria, acceptance test cases, tests, runs and defects — into a single, navigable story of quality. Today that evidence is spread across separate screens, so a QA Lead who needs to answer "what does this work actually cover, and how fast did we recover when it broke?" has to assemble the picture by hand. This epic makes that picture a first-class, read-only product surface.

It delivers four connected views: the full evidence chain from a user story down to any defect raised against it; a coverage lens that surfaces the acceptance criteria and modules with no test behind them; a cycle-time clock that measures how long quality took to go from first failure back to green; and a shareable, audit-ready evidence pack. A live activity feed keeps the whole workspace aware of what changed, by whom, and when.

***Business value:*** gives QA leadership a one-minute, data-backed answer to coverage and audit questions, strengthens the product's closed-loop promise that every story is traceable to its tests and defects, and removes the manual spreadsheet assembly that erodes trust in coverage numbers.

***Sequencing:*** this is a read-side capstone over the test-execution layer. It depends on the Tests, Manual Runs and Bugs capabilities being in place, and is scheduled to be implemented once those land — see the dependency links on this epic and its stories.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-45](https://jira.upexgalaxy.com/browse/BK-45) | TMS-Traceability | Render full US to bug evidence chain in one read | 8 | Medium | Ready For Dev |
| [BK-46](https://jira.upexgalaxy.com/browse/BK-46) | TMS-Coverage | Surface untested ACs and modules with not-run filter | 8 | Medium | Ready For Dev |
| [BK-47](https://jira.upexgalaxy.com/browse/BK-47) | TMS-Coverage | Compute time-to-green per user story from run and bug history | - | Medium | Shift-Left QA |
| [BK-48](https://jira.upexgalaxy.com/browse/BK-48) | TMS-Traceability | Filter the chain by verdict, module, and date range | 3 | Medium | Shift-Left QA |
| [BK-49](https://jira.upexgalaxy.com/browse/BK-49) | TMS-Activity | Stream a read-side feed over the existing activity log | 5 | Medium | Ready For Dev |
| [BK-50](https://jira.upexgalaxy.com/browse/BK-50) | TMS-Traceability | Export the assembled chain as a read-only snapshot | 5 | Medium | Estimation |

---

## Metadata

- **Created:** 6/1/2026
- **Updated:** 6/16/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** new-feature

---

_Synced from Jira by sync-jira-issues_
