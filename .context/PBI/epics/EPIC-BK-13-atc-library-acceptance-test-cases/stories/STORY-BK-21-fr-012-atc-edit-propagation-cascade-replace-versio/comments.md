# Comments for BK-21

[View in Jira](https://jira.upexgalaxy.com/browse/BK-21)

---

### Ely - 5/19/2026, 9:57:30 PM

1. 🧱 Architect Annotation

1. 

- DB tables touched: `atcs` (UPDATE + version increment), `atc*steps`/`atc*assertions` (cascade replace within transaction), READ from `test*steps` to compute `affected*test*ids`. Existing index on `test*steps(atc_id)` is required — verify or add.
- API surface: extends `PATCH /atcs/{id}` from [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18). Adds `If-Match: <version>` header support for optimistic concurrency. Returns 200 `{ atc, version, affected*test*count }` plus `affected*test*ids` in the emitted event payload.
- Transaction shape: BEGIN → `SELECT ... FROM atcs WHERE id = $1 FOR UPDATE` → check `If-Match` version matches → validate cross-entity rules (reuse [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) logic) → if layer changed, run policy check against referencing Tests → UPDATE atcs SET ... , version = version + 1 → DELETE FROM atc*steps WHERE atc*id = $1 → DELETE FROM atc*assertions WHERE atc*id = $1 → INSERT new steps/assertions → SELECT array*agg(test*id) FROM test*steps WHERE atc*id = $1 → COMMIT.
- Propagation guarantee: Tests reference ATCs by `atc*id` in `test*steps`. Step content is NEVER copied into `test_steps` at composition time. This is the architectural invariant that makes propagation automatic.
- Event emission: `atc.updated` published after commit with `{ atc*id, version, affected*test_ids[] }`. Consumers (notifications, search index refresh, etc.) subscribe.
- Layer-policy check: query `SELECT t.id, t.layer*policy FROM tests t JOIN test*steps ts ON ts.test*id = t.id WHERE ts.atc*id = $1 AND $new*layer NOT MATCHING t.layer*policy`. If any rows return, abort with 422.
- Role check uses existing session helper; minimum role is `member`.

1. 

- Upstream: ****BK-18 (FR-010a)**** — this story extends the PATCH endpoint defined there. The base validation, transaction shape, and event bus integration come from [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18).
- Upstream: EPIC-BK-5 must define the `test*steps(atc*id)` foreign key and any layer-policy column on `tests` before propagation can be tested end-to-end.
- Downstream: Notifications epic (out-of-scope) will subscribe to `atc.updated` to email affected Test authors. Search index refresh ([https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20)) listens to the same event to update `search_tsv` if title/tags changed.
- External: event bus (same as [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18)).

1. 

- [ ] PATCH endpoint accepts `If-Match` header and returns 409 on mismatch
- [ ] `affected*test*ids` computed inside the same transaction (read consistency)
- [ ] Event payload includes `affected*test*ids[]` — schema documented in `.context/business/events.md`
- [ ] Integration test: edit an ATC and verify a referencing Test sees the change on next GET WITHOUT any test_steps row being modified
- [ ] Integration test: layer change rejected when referencing Test has incompatible policy
- [ ] Unit tests for version skew (409) and insufficient role (403)
- [ ] OpenAPI updated for `If-Match` header and new error codes (`version*conflict`, `layer*breaks*test*policy`)
- [ ] `bun run api:sync` passes
- [ ] PR description references each AC by Gherkin scenario name

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.4)
- SRS: `.context/SRS/functional-specs.md` § FR-012
- Business map: `.context/business/business-data-map.md` § atcs (version column) / test_steps (FK to atcs)
- API contract: `.context/SRS/api-contracts.yaml` § paths./atcs/{id}.patch

---

### Ramiro Majdalani - 6/2/2026, 9:15:48 PM

Shift-Left QA review for [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) - TMS-ATC Propagation

I reviewed [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) against the local product context, SRS, architect annotation, business data map, and OpenAPI contract. Recommendation: refine before sprint planning.

Key findings:

- The business goal is clear: one ATC edit should update every Test that chains that ATC.
- Main risk: Tests must reference ATCs through `test*steps.atc*id`; Tests must not copy ATC step/assertion content. If content is copied, propagation fails.
- [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) is more complex than a normal edit story because it touches versioning, optimistic concurrency, transaction safety, affected Test counting, layer compatibility, eventing, and historical Run behavior.
- Contract mismatch: SRS/architect notes expect `PATCH /atcs/{atc*id`} to return {{200 { atc, version, affected*test_count }}}, but OpenAPI currently documents `200 ATC`.
- Architect notes require `If-Match: <version>` for optimistic concurrency, but OpenAPI does not document this header.
- Architect notes mention 409 version conflict and 422 layer-policy failures, but OpenAPI only documents 200.
- Scope says Module / Story / Acceptance Criteria anchors are editable, but [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) notes suggest User Story anchor mutability may be risky or disallowed.
- "Immediately shows updated content" is ambiguous: next GET, UI refresh, realtime update, or a defined latency target.
- Historical Runs should preserve execution snapshots even when live Tests render updated ATC content; this should be explicit in ACs.

Critical PO/Dev decisions needed:

1. What does "immediate propagation" mean: next read, UI refresh, realtime update, or latency target?
2. Is `If-Match` required for every PATCH?
3. Final response: `ATC` or {{{ atc, version, affected*test*count }}}?
4. Can `user*story*id` be changed after ATC creation?
5. What are the layer-policy compatibility rules?
6. Do archived Tests count in `affected*test*count`?
7. Does one Test count once if it references the same ATC multiple times?
8. Can archived ATCs be edited?
9. Should no-op saves increment version?
10. What happens if `atc.updated` event emission fails after commit?

Suggested refined ACs:

```
Scenario: Editing an ATC propagates to referencing Tests
  Given an authenticated workspace member
  And an ATC is chained into three active Tests through test*steps.atc*id
  When the member edits one ATC step and saves
  Then all three Tests render the updated step on their next Test detail read
  And no test_steps row is modified to copy step content
  And the Tests continue referencing the same ATC id

Scenario: Saving an edit increments version
  Given an ATC at version 1
  When a valid edit is saved
  Then the ATC version becomes 2
  And the response includes the new version

Scenario: Optimistic concurrency prevents stale overwrite
  Given user A and user B both opened ATC version 1
  When user A saves with If-Match 1
  Then the ATC becomes version 2
  When user B tries to save with stale If-Match 1
  Then the request is rejected with version conflict
  And user B's stale changes do not overwrite version 2

Scenario: Affected Test count is returned
  Given an ATC is chained into seven active Tests
  When a valid edit is saved
  Then the response includes affected*test*count = 7
  And the UI reports that seven Tests were affected

Scenario: Unused ATC saves with zero affected Tests
  Given an ATC is not chained into any active Test
  When a valid edit is saved
  Then the ATC is updated to a new version
  And affected*test*count = 0

Scenario: Cascade replace is transactional
  Given an ATC edit changes steps and assertions
  When any parent, step, assertion, or anchor update fails
  Then the full transaction rolls back
  And the previous ATC version, steps, assertions, and anchors remain unchanged

Scenario: Invalid anchors are rejected
  Given an ATC edit changes Module, User Story, or Acceptance Criteria anchors
  When the new combination violates provenance rules
  Then the edit is rejected
  And the ATC remains unchanged

Scenario: Layer changes cannot break referencing Tests
  Given an ATC is referenced by Tests with a layer policy
  When the ATC layer is changed to an incompatible value
  Then the edit is rejected
  And the ATC remains unchanged

Scenario: Historical Runs keep snapshots
  Given a Run already executed a Test containing an ATC
  When the ATC is edited later
  Then live Tests render updated ATC content
  And the historical Run still shows the content captured during execution

Scenario: ATC update event is emitted after commit
  Given a valid ATC edit succeeds
  When the transaction commits
  Then atc.updated is emitted
  And the event includes atc*id, version, and affected*test_ids
```

Draft test focus:

- Integration: editing ATC updates all referencing Tests on next read.
- DB/integration: `test_steps` stores ATC references, not copied content.
- API: version increments on save.
- API: stale `If-Match` returns conflict and preserves latest version.
- API: affected Test count for 0, 1, and many Tests.
- API/DB: step/assertion replace rolls back on failure.
- API: invalid Module/User Story/AC anchors rejected.
- API: incompatible layer change rejected.
- Authorization: viewer and cross-workspace edits rejected.
- Event: `atc.updated` emits new version and affected Test ids.
- Integration: historical Run snapshots remain unchanged after ATC edit.
- Contract: OpenAPI documents `If-Match`, response shape, 403, 409, and 422.
- UI: save confirmation and stale-version conflict are user-readable.

Recommendation: keep [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) in Shift-Left QA until PATCH contract, `If-Match` rules, User Story anchor mutability, layer policy, affected Test counting, historical Run behavior, and event schema are clarified.

---


_Synced from Jira by sync-jira-issues_
