# BK-499 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-499)

- `POST /invites/accept` stays out of scope, carried forward from BK-262: the shift-left review put it out of scope with a sound rationale — the caller is not yet a workspace member when accepting an invite, so no capability-in-that-workspace check can apply (the same bootstrap shape as `POST /workspaces`) — and recorded it as follow-up debt. It is deliberately not filed as a ticket now: its posture question is genuinely open and has never been through a shift-left QA pass; filing it would create an unrefined ticket. Recorded here so aborting BK-262 does not erase the only place this debt was written down.
- Everything delivered by "PAT | Require every API route to declare its capability posture" (the posture-declaration machinery) and "PAT | Enforce capability scopes on the authoring domain" (the authoring-domain routes).
- Redefining or expanding the set of capability scopes a token can be minted with.
- Any new UI for managing or displaying token scopes.

---
_Synced from Jira by sync-jira-issues_
