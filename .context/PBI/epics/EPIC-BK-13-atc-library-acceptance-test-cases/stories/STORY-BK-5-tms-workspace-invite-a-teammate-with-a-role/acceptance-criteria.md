# BK-5 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-5)

```gherkin
Scenario: Owner invites a member successfully
Given an authenticated owner of Workspace W
When they POST /api/v1/workspaces/W/invites with { email: "alice@example.com", role: "member" }
Then the system inserts a workspace*invites row with a signed token, expires*at = now + 24h
And dispatches an invitation email to alice@example.com
And returns 201 with { invite*id, expires*at }

Scenario: Admin invites a viewer
Given an authenticated admin of Workspace W
When they POST an invite with role "viewer"
Then the invite is created successfully
And the admin can invite anyone with role <= admin

Scenario: Member cannot invite
Given an authenticated member (not admin) of Workspace W
When they POST an invite
Then the system returns 403 with code INSUFFICIENT_ROLE

Scenario: Admin cannot invite an owner
Given an authenticated admin of Workspace W
When they POST an invite with role "owner"
Then the system returns 403 with code ROLE*ABOVE*CALLER

Scenario: Inviting an existing member rejected
Given alice@example.com is already a member of Workspace W
When the owner POSTs an invite to that email
Then the system returns 409 with code ALREADY*A*MEMBER

Scenario: Invite accepted within TTL
Given a valid invite with a signed token
When the invitee clicks the link within 24h and signs in
Then the system promotes them to workspace_members with the assigned role
And marks the invite as accepted
And redirects to the workspace home

Scenario: Invite expired
Given an invite older than 24h
When the invitee clicks the link
Then the system rejects with code INVITE_EXPIRED
And shows "Ask {inviter_email} for a new invite"
```

---
_Synced from Jira by sync-jira-issues_
