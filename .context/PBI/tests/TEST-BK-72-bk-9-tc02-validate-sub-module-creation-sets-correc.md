# TEST: BK-9: TC02: Validate sub-module creation sets correct path and parent

**Jira Key:** [BK-72](https://jira.upexgalaxy.com/browse/BK-72)
**Status:** DEPRECATED
**Components:** None

---

## Test Description

## Test Case — TC02

Story: BK-9 | ROI: 25 | Verdict: CANDIDATE

### Gherkin Scenario

```gherkin
@critical @regression @automation-candidate @BK-9
Scenario: Validate sub-module creation sets correct path and parent
  """
  Related Story: BK-9
  ROI: 25
  """
  Given a root module exists with path "login" and id {root_id}
  When POST /api/v1/projects/{project*id}/modules with name "OAuth" and parent*module*id={root*id}
  Then response status is 201
  And response.module.path equals "login/oauth"
  And response.module.parent*module*id equals {root_id}
```

### Variables

{project*id} — UUID of the test project | {root*id} — dynamically obtained from prior TC step

### Related

Story: BK-9 | Regression Epic: BK-70 | Bugs: BK-67, BK-68 (if applicable)

---

## Metadata

- **Created:** 6/6/2026
- **Updated:** 6/8/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** automation-candidate, critical, e2e, regression

---

_Synced from Jira by sync-jira-issues_
