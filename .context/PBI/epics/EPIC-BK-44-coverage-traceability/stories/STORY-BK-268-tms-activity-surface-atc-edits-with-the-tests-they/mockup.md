# BK-268 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-268)

No new screen or mockup. This story adds a new entry kind to the existing standalone Activity feed shipped by BK-49 (`/activity`), which is itself spec-only per `.context/design/master-design-plan.md` §4.16 (Ratified Departure D15) — built against `DESIGN.md`'s frozen §2 tokens only, with Run History's list + load-older pattern as structural precedent, no dedicated mockup file. The ATC-edit entry this story adds follows the same row grammar (`components/activity/ActivityView.tsx`) already used for `atc.created`, `test.created`, and the other tracked event kinds — same card, same actor/action/entity anatomy — extended to also convey the affected Tests. No new colors, radii, fonts, spacing, or components.

---
_Synced from Jira by sync-jira-issues_
