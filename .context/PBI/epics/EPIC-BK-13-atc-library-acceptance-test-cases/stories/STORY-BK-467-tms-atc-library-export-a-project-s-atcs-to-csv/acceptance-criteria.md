# BK-467 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-467)

```
Scenario: Export a Project's ATC library as CSV
  Given a Project has 12 ATCs in its library
  When I export the ATC library as CSV
  Then a CSV file downloads with one row per ATC
  And each row shows the ATC ID, slug, title, Module, layer, tags, and status
```

```
Scenario: Export an empty ATC library
  Given a Project has zero ATCs in its library
  When I export the ATC library as CSV
  Then a CSV file downloads containing only the header row
  And no error is shown
```

```
Scenario: Cannot export a Project I do not have access to
  Given a Project belongs to a workspace I am not an active member of
  When I attempt to export that Project's ATC library
  Then no export is produced
  And the response gives no indication the Project exists
```

```
Scenario: Special characters in an ATC title are escaped correctly
  Given an ATC exists whose title contains a comma, a double quote, and a line break
  When I export the ATC library as CSV
  Then the exported row for that ATC opens correctly in a spreadsheet
  And the comma, quote, and line break inside the title do not break the row or column alignment
```

```
Scenario: Export a large ATC library
  Given a Project has several hundred ATCs in its library
  When I export the ATC library as CSV
  Then the exported file includes every ATC in the library
  And no row is missing or truncated
```

---
_Synced from Jira by sync-jira-issues_
