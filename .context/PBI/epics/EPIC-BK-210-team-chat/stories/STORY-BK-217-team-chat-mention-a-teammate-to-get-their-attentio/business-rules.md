# BK-217 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-217)

- ***Mentionable set = channel audience***: only members who can read the channel can be mentioned in it — the workspace member list for the general channel, project-access members for a project channel.
- ***One notification per mention***: mentioning the same member several times in one message produces a single notification; delivery, read-state, and preferences are owned by the Notifications Center.
- ***No self-notification***: mentioning yourself does not create a notification.
- ***Former members***: a member who leaves the workspace disappears from autocomplete immediately; existing mentions of them keep rendering, marked as a former member, and never break old messages.
- ***Viewers can be mentioned***: read-only members can still be mentioned and notified — write access governs sending, not being referenced.

### Design intent

- Autocomplete opens as a compact popover above the composer as soon as "@" is typed, filtering as the member keeps typing; keyboard up/down + Enter to pick.
- Mentions render as pill-style highlights inside the message body, tinted with the accent color; the mentioned member sees their own mentions slightly stronger.
- Hovering a mention shows a small member card (name, role, online presence).
- The notification in the inbox shows channel name, author, and a snippet of the message.

---
_Synced from Jira by sync-jira-issues_
