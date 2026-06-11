# TEST: BK-9: TC17: Validate cross-project parent_module_id returns parent_invalid

**Jira Key:** [BK-79](https://jira.upexgalaxy.com/browse/BK-79)
**Status:** DEPRECATED
**Components:** None

---

## Test Description

## Test Case — TC17

Story: BK-9 | ROI: 8 | Verdict: CANDIDATE

### Gherkin Scenario

```gherkin
@high @regression @automation-candidate @BK-9
Scenario: Validate parent from different project is rejected
  """
  Related Story: BK-9
  ROI: 8 | RLS isolation — prevents cross-project data leakage
  parent.project_id check in route.ts line 87
  """
  Given a module {cross*module*id} exists in a DIFFERENT project the user cannot access
  When POST /api/v1/projects/{project*id}/modules with parent*module*id={cross*module_id}
  Then response status is 422
  And response.error.details.reason equals "parent_invalid"
  And no module is created
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
- **Labels:** automation-candidate, e2e, regression, security

---

_Synced from Jira by sync-jira-issues_
