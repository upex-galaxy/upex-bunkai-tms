# BK-268 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-268)

- The workspace activity feed shows an entry whenever an ATC is edited, regardless of which surface produced the edit — the app's own ATC editor or the product's API. Both surfaces must be covered by this story; shipping visibility for only one of them (for example, only widening what the feed allows through, without also making the in-app editor itself report an edit) leaves the other invisible and does not satisfy this story.
- Each ATC-edit entry names the actor who made the edit and the ATC that changed.
- Each ATC-edit entry conveys which Tests the edit affects, using the affected-Tests data that ATC edits already compute today.
- An ATC edit that affects zero Tests still produces a feed entry that renders sensibly, not a broken or empty-looking row.
- ATC creation keeps producing its own single feed entry, and an edit entry is never mistaken for or merged with a creation entry.
- Workspace isolation for the activity feed is preserved: an ATC edit in one workspace is never visible in another workspace's feed.
- A caller that asks the feed for a specific set of event types and does not include ATC edits in that set still does not see them — this story only changes what the feed shows by default, not the caller's ability to filter explicitly.

---
_Synced from Jira by sync-jira-issues_
