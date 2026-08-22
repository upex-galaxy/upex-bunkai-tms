# BK-213 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-213)

- Preferences are personal: they belong to the user and apply across every workspace they are a member of.
- Turning a channel off stops future deliveries only; notifications already in the inbox remain untouched.
- The in-app and email channels toggle independently per event type; no combination is invalid.
- The mentions event type is declared from day one but locked until the Team Chat epic ships — visible so users discover it, immutable so it promises nothing yet.
- Every role (viewer, member, admin, owner) manages their own preferences; no role can edit another user's preferences.

## Design intent

- Renders as a Settings hub sub-view following the hub's navigation pattern ([https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87)): section title, short description, then the toggle grid.
- Grid rows are event types with an icon and a one-line description; columns are channels with toggle switches, reusing the app's existing switch component.
- The locked mentions row is visually dimmed with a "coming soon" tag.
- Saves are instant with a subtle confirmation, matching the live-update feel of the rest of Settings.

---
_Synced from Jira by sync-jira-issues_
