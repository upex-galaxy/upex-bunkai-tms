# TEST: BK-9: TC12: Validate whitespace-only name is trimmed and rejected as name_too_short

**Jira Key:** [BK-77](https://jira.upexgalaxy.com/browse/BK-77)
**Status:** DEPRECATED
**Components:** None

---

## Test Description

## Test Case — TC12

Story: BK-9 | ROI: 40 | Verdict: CANDIDATE

### Gherkin Scenario

```gherkin
@medium @regression @automation-candidate @BK-9
Scenario: Validate whitespace-only name is rejected after server trim
  """
  Related Story: BK-9
  ROI: 40 | Prior bug area: BK-68 (isValid checks length > 0 not >= 2)
  Server trims the name before length check
  """
  When POST /api/v1/projects/{project_id}/modules with name "   " (spaces only)
  Then response status is 422
  And response.error.details.reason equals "name*too*short"
  # Trimmed name is empty string, length 0 < 2
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
- **Labels:** automation-candidate, functional, regression

---

_Synced from Jira by sync-jira-issues_
