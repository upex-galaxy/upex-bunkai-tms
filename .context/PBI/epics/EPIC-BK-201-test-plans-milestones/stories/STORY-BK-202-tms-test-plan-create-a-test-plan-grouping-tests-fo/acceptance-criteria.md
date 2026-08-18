# BK-202 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-202)

## Phase 3 — Refined Acceptance Criteria

### Original AC1 — Create a test plan with full details

#### Scenario 1.1: Should create a test plan with name, description, and goal (Type: Positive, Priority: High)

- ***Given***: Mateo (member role) is signed in and viewing project "Bunkai Web" > Test Plans
- ***When***: he submits name `"Release 2.4 regression"`, description `"Full regression before the 2.4 cut"`, goal `"Release 2.4"`
- ***Then***:

### Original AC2 — Create a minimal test plan with only a name

#### Scenario 1.2: Should create a minimal test plan with name only (Type: Positive, Priority: High)

- ***Given***: Mateo is viewing the Test Plans section of a project
- ***When***: he submits name `"Smoke pass"`, leaving description and goal empty
- ***Then***: plan is created, listed with status "Open" and 0 tests; description/goal render as empty in the detail view without breaking layout

#### Scenario 1.3: Should accept a test plan name at exactly the 100-character boundary (Type: Boundary, Priority: Medium)

- ***Given***: Mateo is creating a plan
- ***When***: he submits a name of exactly 100 characters
- ***Then***: plan is created successfully — the business rule's stated "1 to 100 characters" upper bound is inclusive

#### Scenario 1.4: Should reject a test plan name exceeding the 100-character boundary (Type: Boundary/Negative, Priority: High)

- ***Given***: Mateo is creating a plan
- ***When***: he submits a name of exactly 101 characters
- ***Then***: plan is not created; a length-validation message is shown; no DB row is created

#### Scenario 1.5: Should accept a test plan name that trims to exactly 1 character (Type: Boundary, Priority: Medium)

- ***Given***: Mateo is creating a plan
- ***When***: he submits `" A "` (single character padded with spaces)
- ***Then***: plan is created with name `"A"` — proves both the 1-char lower bound and the trim rule

### Original AC3 — Duplicate plan name in the same project is rejected

#### Scenario 2.1: Should reject a duplicate plan name differing only by case (Type: Negative, Priority: Critical)

- ***Given***: a plan named `"Release 2.4 regression"` already exists in project "Bunkai Web"
- ***When***: Mateo submits `"release 2.4 regression"`
- ***Then***: plan is not created; message states a plan with that name already exists in the project; no new DB row; original plan unaffected

#### Scenario 2.2: Should reject a duplicate name padded with leading/trailing spaces (Type: Boundary/Negative, Priority: High)

- ***Given***: a plan named `"Smoke pass"` already exists
- ***When***: Mateo submits `"  Smoke pass  "`
- ***Then***: rejected as a duplicate — proves the trim rule applies to the uniqueness check itself, not only to the min-length check

#### Scenario 2.3: Should allow the same plan name to be reused in a different project (Type: Positive, Priority: Medium)

- ***Given***: a plan named `"Smoke pass"` exists in project "Bunkai Web"
- ***When***: a member creates a plan named `"Smoke pass"` in a different project, "Bunkai Mobile"
- ***Then***: plan is created successfully — uniqueness is scoped per project, not global (per business rule)

#### Scenario 2.4: Should reject a duplicate name padded with a tab or non-breaking space — ***NEEDS PO/DEV CONFIRMATION*** (Type: Boundary/Negative, Priority: Medium)

- ***Given***: a plan named `"Smoke pass"` already exists
- ***When***: a member submits `"Smoke pass\t"` (trailing tab) or a name padded with U+00A0
- ***Then***: inferred — still rejected as a duplicate if "trimming spaces" is whitespace-generic; behavior depends on Ambiguity #4

#### Scenario 2.5: Should reject a plan rename that collides with another existing plan's name — ***NEEDS PO/DEV CONFIRMATION*** (Type: Negative, Priority: High)

- ***Given***: plans `"Release 2.4 regression"` and `"Smoke pass"` both exist in the project
- ***When***: a member edits `"Smoke pass"` and renames it to `"release 2.4 regression"`
- ***Then***: inferred — rename rejected with the same duplicate-name message; edit not persisted

#### Scenario 2.6: Should reject one of two concurrent create requests for the same plan name (race condition) — ***NEEDS PO/DEV CONFIRMATION*** (Type: Negative/Edge, Priority: High)

- ***Given***: no plan named `"Regression X"` exists yet in the project
- ***When***: two members submit create requests for `"Regression X"` within the same request window
- ***Then***: inferred — exactly one create succeeds; the other fails with the duplicate-name error even if it passed client-side validation first (requires a DB-level unique constraint, not an app-level check alone)

### Original AC4 — Blank name is rejected

#### Scenario 3.1: Should reject a whitespace-only plan name (Type: Negative, Priority: Critical)

- ***Given***: Mateo is creating a test plan
- ***When***: he submits `"   "` (spaces only)
- ***Then***: plan is not created; validation message asks for a name; no DB row created

#### Scenario 3.2: Should reject an empty-string plan name (Type: Negative/Boundary, Priority: Critical)

- ***Given***: Mateo is creating a test plan
- ***When***: he submits `""` (the field is never touched)
- ***Then***: same rejection as Scenario 3.1 — collapsed as a data row of the same partition (identical expected behavior), not a separate outline

#### Scenario 3.3: Should reject a name made only of tab/newline whitespace — ***NEEDS PO/DEV CONFIRMATION*** (Type: Negative/Boundary, Priority: Medium)

- ***Given***: Mateo is creating a test plan
- ***When***: he submits `"\t\n"`
- ***Then***: inferred — also rejected as blank if trim treats all whitespace as blank-equivalent; depends on Ambiguity #4

### Original AC5 — Viewer cannot create a plan

#### Scenario 4.1: Should hide the create-plan option from a viewer-role user (Type: Negative/Permissions, Priority: Critical)

- ***Given***: Lucia has the viewer role in the workspace/project
- ***When***: she opens the Test Plans section of the project
- ***Then***: the "New plan" option is not available/rendered to her

#### Scenario 4.2: Should reject a direct API create-plan request from a viewer-role user — ***NEEDS PO/DEV CONFIRMATION*** (Type: Negative/Security, Priority: Critical)

- ***Given***: Lucia (viewer role) holds a valid session
- ***When***: she calls the create-plan API endpoint directly, bypassing the UI
- ***Then***: inferred — 403 Forbidden, no plan created; server enforces the role gate independent of the hidden button (AC5 as written only describes the UI affordance)

#### Scenario 4.3: Should allow a member-role user to edit an existing plan they did not create (Type: Positive, Priority: High)

- ***Given***: Elena has member role in the project; plan "Smoke pass" was created by Mateo
- ***When***: Elena edits the plan's description to `"Updated for sprint 12"`
- ***Then***: plan updated (200, DB row updated) — the business rule states "member role or higher" with no owner qualifier, so editing is not restricted to the original creator (ties to Ambiguity #1 — confirm this reading)

#### Scenario 4.4: Should reject a viewer's inline-edit attempt on an existing plan (Type: Negative/Permissions, Priority: Critical)

- ***Given***: Lucia (viewer) opens an existing plan's detail tab
- ***When***: she attempts the inline edit affordance on name/description/goal
- ***Then***: edit controls are not available to her — explicitly covered by business rule T2 ("creating and editing plans stays member role and above"), so content is not inferred, only the concrete Given/When/Then framing is derived

#### Scenario 4.5: Should re-verify role server-side even with a stale client-cached role — ***NEEDS PO/DEV CONFIRMATION*** (Type: Negative/Security, Priority: High)

- ***Given***: a user held member role when their client last loaded, but has just been demoted to viewer server-side
- ***When***: they submit a create or edit request using the stale client state
- ***Then***: inferred — server rejects with 403 based on the live role, not the cached client role

---
_Synced from Jira by sync-jira-issues_
