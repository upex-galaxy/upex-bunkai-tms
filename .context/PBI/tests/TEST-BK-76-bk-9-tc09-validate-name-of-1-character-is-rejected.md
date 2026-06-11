# TEST: BK-9: TC09: Validate name of 1 character is rejected with name_too_short

**Jira Key:** [BK-76](https://jira.upexgalaxy.com/browse/BK-76)
**Status:** DEPRECATED
**Components:** None

---

## Test Description

## Test Case — TC09

Story: BK-9 | ROI: 60 | Verdict: CANDIDATE

### Gherkin Scenario

```gherkin
@medium @regression @automation-candidate @BK-9
Scenario: Validate 1-char name is rejected
  """
  Related Story: BK-9
  ROI: 60 | Prior bug: BK-68 (client-side min-length missing)
  Min boundary: 2 chars (MIN*NAME*LENGTH=2 in source)
  """
  When POST /api/v1/projects/{project_id}/modules with name "A" (1 char)
  Then response status is 422
  And response.error.details.reason equals "name*too*short"
  # Note: client form also allows submitting 1-char names (BK-68 not yet fixed)
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
