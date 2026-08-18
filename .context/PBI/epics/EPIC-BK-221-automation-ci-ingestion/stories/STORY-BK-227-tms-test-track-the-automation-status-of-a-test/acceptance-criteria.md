# BK-227 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-227)

```
Scenario: Set the automation status of a test
  Given the Test "Checkout happy path" has the default status "Manual-only"
  When Elena sets its automation status to "Automation candidate"
  Then the test shows an "Automation candidate" badge in the test library and on the test view
```

```
Scenario: Filter the test library by automation status
  Given the library contains 20 manual-only tests, 5 automation candidates, and 8 automated tests
  When Elena filters the library by status "Automated"
  Then only the 8 automated tests are listed
  And the library shows the count per status (20 / 5 / 8)
```

```
Scenario: Status history is preserved
  Given the Test "Checkout happy path" was marked "Automation candidate" by Elena on 2026-07-01
  When Mateo changes its status to "Automated" on 2026-07-10
  Then the test's status history shows both changes with author and date
  And earlier entries are never overwritten or lost
```

```
Scenario: A viewer cannot change the status
  Given a teammate with the viewer role opens the Test "Checkout happy path"
  When they look at the automation status control
  Then the status is visible but read-only for them
```

---
_Synced from Jira by sync-jira-issues_
