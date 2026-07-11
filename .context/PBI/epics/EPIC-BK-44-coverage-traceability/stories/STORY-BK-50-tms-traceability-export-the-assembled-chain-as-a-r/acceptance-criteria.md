# BK-50 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-50)

### Original AC1 — Export an evidence chain

#### Scenario 1.1: Should produce a read-only snapshot containing the full assembled chain when the QA Lead exports a populated user story (Type: Positive, Priority: High)

- ********NEEDS PO/DEV CONFIRMATION****: artifact format inferred — confirm before sprint planning
- ***Given***: a user story with an assembled evidence chain (AC → ATC → Test → Run → Defect, mixed pass/fail)
- ***When***: the QA Lead triggers the export action
- ***Then***: a snapshot artifact is produced containing every chain entity and field visible on screen

#### Scenario 1.2: Should reject export of a user story the requesting user has no read access to (Type: Negative, Priority: High)

- ***Given***: a user story belonging to a different workspace than the requesting user's
- ***When***: the user attempts to export it (e.g. via a crafted story ID)
- ***Then***: the export is rejected with 403/404, no snapshot is created

### Original AC2 — Snapshot reflects the moment of export

#### Scenario 2.1: Should preserve the chain state at export time when the live chain changes afterward (Type: Positive, Priority: Critical)

- ***Given***: a user story exported at time T0 with a specific chain state
- ***When***: after export, the live chain changes, and the QA Lead later opens the previously exported snapshot
- ***Then***: the snapshot still displays the chain exactly as at T0

#### Scenario 2.2: Should produce independent snapshots when the same story is exported concurrently (Type: Positive, Priority: Medium)

- ***Given***: a user story with stable chain state
- ***When***: the QA Lead exports twice in quick succession
- ***Then***: two independent snapshots exist

### Original AC3 — Export an empty chain

#### Scenario 3.1: Should produce a snapshot stating the story had no coverage when exporting a story with zero chain entities (Type: Negative/Edge, Priority: High)

- ***Given***: a user story with no ACs, ATCs, Tests, Runs, or Defects
- ***When***: the QA Lead exports it
- ***Then***: a snapshot is produced stating the story had no coverage as of the export timestamp

### New scenarios — NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should keep a previously exported snapshot accessible after its source user story is deleted/archived (Type: Edge, Priority: High)

- ***Given***: a snapshot exported from story X
- ***When***: story X is deleted/archived
- ***Then***: the snapshot remains retrievable

#### Scenario E2: Should reject unauthenticated snapshot view via direct link (Type: Negative, Priority: High)

- ***Given***: a snapshot with its URL/ID known by an unauthorized user
- ***When***: that user attempts to retrieve it
- ***Then***: access is rejected 403/404

#### Scenario E3: Should display clear error when chain assembly is unavailable (Type: Negative, Priority: Medium)

- ***Given***: chain assembly endpoint returns 500
- ***When***: QA Lead attempts to export
- ***Then***: clear error message, no partial snapshot

---
_Synced from Jira by sync-jira-issues_
