# BK-18 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-18)

```gherkin
Scenario: Create ATC with valid payload
Given an authenticated member of the workspace
And a User Story US-100 in module M-10 with acceptance criteria AC-1 and AC-2
When the user POSTs to /atcs with title "Login with valid email", module*id M-10, user*story*id US-100, acceptance*criterion_ids [AC-1], layer "UI", and 3 steps plus 2 assertions
Then the API returns 201 with the new ATC, its steps, and its assertions
And the slug is "{module-slug}/{atc-id-padded}"
And an atc.created event is emitted
```

```gherkin
Scenario: Reject ATC when acceptance criteria belong to a different user story
Given an authenticated member
And AC-9 belongs to user story US-200 (not US-100)
When the user POSTs /atcs with user*story*id US-100 and acceptance*criterion*ids [AC-9]
Then the API returns 422 with error code "ac*outside*user_story"
And no row is inserted in atcs, atc*steps, or atc*assertions
```

```gherkin
Scenario: Reject ATC when module is not in the user story's project subtree
Given a User Story US-100 belongs to project P-1
And module M-99 belongs to project P-2
When the user POSTs /atcs with user*story*id US-100 and module_id M-99
Then the API returns 422 with error code "module*outside*project_subtree"
```

```gherkin
Scenario: Step positions must be strictly increasing from 1
Given an authenticated member
When the user POSTs /atcs with steps positions [1, 3, 2]
Then the API returns 422 with error code "steps*position*invalid"
And the response body lists the offending positions
```

```gherkin
Scenario: PATCH /atcs/{id} updates fields and cascade-replaces steps and assertions atomically
Given an existing ATC at version 1 with 3 steps and 1 assertion
When the user PATCHes /atcs/{id} with a new title and a replacement steps array of 2 steps
Then the API returns 200 with version 2
And the old steps and assertions are deleted in the same transaction as the new inserts
And an atc.updated event is emitted with affected*test*ids
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:47.905Z_
