# BK-497 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-497)

```gherkin
Scenario: A token scoped only for reads is rejected creating an invite
  Given Karim holds a valid Personal Access Token scoped exactly atc:read
  When Karim sends a request to invite a new member to the workspace using that token
  Then Karim receives an authorization error with 403
  And no invite is created
```

```gherkin
Scenario: A token with unrelated scopes is rejected on a workspace-admin action
  Given Karim holds a valid Personal Access Token scoped atc:write and run:execute, without workspace:admin
  When Karim sends a request to revoke a pending invite using that token
  Then Karim receives an authorization error with 403
  And the invite is unchanged
```

```gherkin
Scenario: A token with no resolvable workspace context is rejected on a workspace-admin action
  Given Karim holds a valid Personal Access Token scoped workspace:admin that is not bound to any workspace
  When Karim sends a request to update workspace settings using that token
  Then Karim receives an error indicating the workspace could not be resolved
  And no action is taken
```

***Note******:*** these three scenarios (AC-04, AC-05, AC-06 in BK-262's original numbering) already pass against today's code. They are non-regression guards on the all-call-site migration this Story performs, not new behaviour — this is the only Story that touches all 87 call sites, so it is the only one that can break them. They must not be removed as "already green."

---
_Synced from Jira by sync-jira-issues_
