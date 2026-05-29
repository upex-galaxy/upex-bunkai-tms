# BK-16 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-16)

```gherkin
Scenario: Write and preview a Markdown description
  Given I am editing a User Story description
  When I type "## Steps" followed by a bullet list
  Then the live preview shows a heading and a bulleted list
  And saving keeps that formatting when the Story is reopened
```

```gherkin
Scenario: A table renders in preview and in the saved content
  Given I am editing a description
  When I write a Markdown table
  Then the preview shows it as a table
  And the saved content renders the same table later
```

```gherkin
Scenario: A pasted script is stripped on save
  Given I paste a description that contains a script snippet
  When I save the description
  Then the saved and rendered content contains no executable script
  And the surrounding text is preserved
```

```gherkin
Scenario: Unsafe links are dropped while safe links are kept
  Given a description containing one mailto link and one javascript link
  When I save and view the description
  Then the mailto link still works
  And the javascript link has been removed
```

```gherkin
Scenario: A body over the size limit is rejected
  Given I am editing a description
  When I submit a body larger than 50 KB
  Then it is not saved
  And I see a message that the description exceeds the maximum size
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:46.779Z_
