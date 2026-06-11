# TEST: BK-9: TC22: Validate DB path materialization for nested module chain

**Jira Key:** [BK-80](https://jira.upexgalaxy.com/browse/BK-80)
**Status:** DEPRECATED
**Components:** None

---

## Test Description

## Test Case — TC22

Story: BK-9 | ROI: 10 | Verdict: CANDIDATE

### Gherkin Scenario

```gherkin
@high @regression @automation-candidate @BK-9
Scenario: Validate materialized path is correctly built for nested chain
  """
  Related Story: BK-9
  ROI: 10 | Critical data integrity — path used for subtree queries and depth enforcement
  """
  Given modules are created as a 3-level chain: root → child → grandchild
  Then database shows:
    root.path = "{slug_root}"
    child.path = "{slug*root}/{slug*child}"
    grandchild.path = "{slug*root}/{slug*child}/{slug_grandchild}"
  And array*length(string*to_array(grandchild.path, '/'), 1) equals 3
  And all paths satisfy the DB CHECK constraint depth ≤ 6
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
- **Labels:** automation-candidate, integration, regression

---

_Synced from Jira by sync-jira-issues_
