# BK-337 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

```gherkin
Scenario: Open a defect filed from a failing run step
  Given Elena is viewing the defects list for project "Storefront"
  And defect "BUG-101" was filed from a failing step in run "RUN-451"
  When she opens "BUG-101"
  Then she sees its id, severity, status, title, and full module path in the header
  And she sees who filed it and when
  And the description, steps to reproduce, and Expected vs Actual are all shown
  And the steps to reproduce are numbered, with the step that failed visually highlighted
  And the Origin panel links to the originating ATC and to run "RUN-451"
```

```gherkin
Scenario: Open a standalone defect with no linked run
  Given defect "BUG-112" was filed directly from the defects area, with no run involved
  When Elena opens "BUG-112"
  Then she sees its full record exactly as filed
  And the Origin panel shows a quiet notice that it was filed manually
  And no run or ATC link is offered
```

```gherkin
Scenario: Evidence list shows the count against the attachment cap
  Given defect "BUG-101" has 6 evidence items attached
  When Elena opens "BUG-101"
  Then the evidence panel reads "6 / 10"
  And each evidence row can be opened
```

```gherkin
Scenario: The defect record carries no edit or status controls
  When Elena opens any defect's detail record
  Then no field on the page can be edited
  And no status-transition or assignment control is offered
```

```gherkin
Scenario: The defects list links into the detail record
  Given Elena is viewing the defects list for project "Storefront"
  And it includes defect "BUG-101" linked to run "RUN-451"
  When she clicks the "BUG-101" cell
  Then she lands on the detail record for "BUG-101"
  When she instead clicks the "RUN-451" cell on that same row
  Then she also lands on the detail record for "BUG-101"
```

---
_Synced from Jira by sync-jira-issues_
