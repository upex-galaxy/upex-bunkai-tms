# BK-50 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-50)

### AC1 — Export an evidence chain

#### Scenario 1.1: Should produce a downloaded self-contained HTML document containing the full assembled chain when the QA Lead exports a populated user story (Type: Positive, Priority: High)

- ***Given***: a user story with an assembled evidence chain (AC -> ATC -> Test -> Run -> Defect, mixed pass/fail)
- ***When***: the QA Lead triggers the export action
- ***Then***: the browser downloads a self-contained HTML document containing every chain entity and field visible on screen, plus the export timestamp and the workspace/project/story identity

#### Scenario 1.2: Should reject export of a user story the requesting user has no read access to (Type: Negative, Priority: High)

- ***Given***: a user story belonging to a different workspace than the requesting user's
- ***When***: the user attempts to export it (e.g. via a crafted story ID)
- ***Then***: the export request is rejected with 404, no snapshot is created

### AC2 — Snapshot reflects the moment of export

#### Scenario 2.1: Should preserve the chain state at export time when the live chain changes afterward (Type: Positive, Priority: Critical)

- ***Given***: a user story exported at time T0 with a specific chain state
- ***When***: after export, the live chain changes, and the QA Lead later re-opens the downloaded file
- ***Then***: the file still displays the chain exactly as at T0

#### Scenario 2.2: Should produce independent snapshots when the same story is exported concurrently (Type: Positive, Priority: Medium)

- ***Given***: a user story with stable chain state
- ***When***: the QA Lead exports twice in quick succession
- ***Then***: two independent downloaded files exist

### AC3 — Export an empty chain

#### Scenario 3.1: Should produce a snapshot stating the story had no coverage when exporting a story with zero chain entities (Type: Negative/Edge, Priority: High)

- ***Given***: a user story with no ACs, ATCs, Tests, Runs, or Defects
- ***When***: the QA Lead exports it
- ***Then***: the downloaded document renders prose stating the story had no coverage as of the export timestamp (not an empty structure)

### E1 — Snapshot survives source-story deletion

- ***Given***: a downloaded snapshot exported from story X
- ***When***: story X is deleted/archived
- ***Then***: the downloaded file remains readable, with no dependency on Bunkai

### E2 — No anonymous retrieval path

- ***Given***: the export endpoint (the same authenticated `GET /api/v1/projects/{id}/traceability` route the screen already uses)
- ***When***: an unauthenticated caller attempts to reach it
- ***Then***: the request is rejected — redirect to login for a browser session, 401 for an API caller — and no anonymous retrieval path for an exported snapshot exists anywhere in the product (v1 ships no hosted artifact, no public link, no signed URL)

### E3 — Clear error when chain assembly is unavailable

- ***Given***: the chain assembly endpoint returns an error (e.g. 500)
- ***When***: the QA Lead attempts to export
- ***Then***: a clear error message is shown and no partial or corrupt file is downloaded

---

***Scope note (ratified 2026-08-08, comments 12238/12239)******:**** v1 is a client-initiated download of a self-contained HTML document, rendered synchronously from the existing authenticated traceability route. No object storage, no hosted artifact, no public link, no signed URL, no anonymous access path, no `export_jobs` table, no background worker, no cron, no new SDK, no migration. A `snapshots` table is explicitly out of scope — the downloaded file **is* the snapshot. Anonymous link-sharing is a reserved-for-human follow-up, not part of this story.

---
_Synced from Jira by sync-jira-issues_
