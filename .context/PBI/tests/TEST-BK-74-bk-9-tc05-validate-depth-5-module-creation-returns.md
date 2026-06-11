# TEST: BK-9: TC05: Validate depth 5 module creation returns 201 with warning

**Jira Key:** [BK-74](https://jira.upexgalaxy.com/browse/BK-74)
**Status:** DEPRECATED
**Components:** None

---

## Test Description

## Test Case — TC05

Story: BK-9 | ROI: 6 | Verdict: CANDIDATE

### Gherkin Scenario

```gherkin
@high @regression @automation-candidate @BK-9
Scenario: Validate depth 5 module returns 201 plus warning
  """
  Related Story: BK-9
  ROI: 6 | Depth state machine enforcement
  """
  Given a 4-level deep module chain (path depth 4) exists
  When POST /api/v1/projects/{project_id}/modules with valid name and parent = depth-4 module
  Then response status is 201
  And response.module is present
  And response.warning equals "This module is nested deeply — consider keeping the tree shallow."
  And response.warning type is string (not boolean)
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
- **Labels:** automation-candidate, e2e, regression

---

_Synced from Jira by sync-jira-issues_
