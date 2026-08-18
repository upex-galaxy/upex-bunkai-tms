# BK-232 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-232)

- The approaching-limit threshold is 80% of a plan-limited resource's cap; at 100% the action that would exceed the cap is blocked.
- Approaching-limit warnings never block or interrupt the action that triggered them, and are dismissible.
- The block message is role-aware: workspace owners get a direct route to the upgrade flow; members and viewers get the workspace owner's name — non-payers are never shown a checkout.
- Existing data is never touched by a limit: limits gate creation of new resources only.
- An upgrade lifts the block immediately, within the same session.

### Design intent

- Approaching-limit: a warning banner using the existing semantic warning tokens, shown in the flow where the resource was created.
- Limit hit: a paywall-style modal reusing the current design-system dialog — title, plain-language explanation, usage figure (10 of 10), and one role-appropriate action.
- Both patterns are shared components so every plan-limited resource surfaces them consistently.

---
_Synced from Jira by sync-jira-issues_
