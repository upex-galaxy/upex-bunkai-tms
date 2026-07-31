# Comments for BK-90

[View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

---

### Andrés Daniel Cumare Morales - 6/10/2026, 6:40:00 AM

=== Shift-Left Refinement: BK-90 ===

## Summary

The 2 existing Gherkin scenarios in the `acceptance_criteria` field were used as the baseline (not discarded or replaced):

- ***Scenario 1**** ("Leaving a workspace asks for confirmation") and ****Scenario 2*** ("A user cannot leave a workspace they solely own") were refined in place — tightened wording so they become deterministically assertable (e.g. "falls back to Acme QA" → pinned to a named, reusable active-workspace resolution rule; "the only owner" → a count-based "no other member has role owner" condition).
- ***3 new scenarios**** were added to fill gaps the original 2 leave open: leaving the user's only workspace (routes to onboarding), a no-cascade guarantee on authored content, and a co-owner leave when other owners remain. Each is explicitly flagged ****NEEDS PO/DEV CONFIRMATION*** in the field — every new scenario is QA's inference, not a stated requirement.

The merged set (5 scenarios total) now lives in the `acceptance*criteria` field. The ATP DRAFT (6 test outlines across 4 categories, with a coverage estimate) lives in the `acceptance*test_plan` field.

## Central finding

Scenario 2 only describes the SOLE-owner block. It does not say whether the gate is "you are AN owner" or "you are the LAST remaining owner" — the schema does not prevent multiple `owner` rows per workspace. This refinement assumes a count-based "last owner" gate (New Scenario C); if the team intends no co-owner can ever leave without an explicit ownership-transfer step first, this scenario is invalid and a "transfer ownership" sub-flow becomes new, unscoped work.

## Open questions blocking full estimation

1. ***Can a workspace have more than one ****`role = 'owner'`**** member, and if so, can any of them leave freely as long as one owner remains?*** Blocks New Scenario C.
2. ***What happens when a user leaves their only workspace*** — blocked, or routed to onboarding? Blocks New Scenario A.
3. ***(Dev)*** Should workspace-scoped PATs be auto-revoked when the user leaves the workspace they're scoped to?

Action requested: PO + Dev review the merged scenarios and the 3 open questions above before this moves past Estimation. Local working copy of the full refinement: `.context/PBI/epics/EPIC-BK-85-account-settings/stories/STORY-BK-90-tms-workspace-leave-a-workspace/shift-left-refinement.md`

Refined on: 2026-06-10 — QA Shift-Left session

---

### Andrés Daniel Cumare Morales - 6/10/2026, 6:48:18 AM

=== Shift-Left Follow-up: PO / Dev / Design Responses to Open Questions (BK-90) ===

> ***Practice-exercise disclaimer****: This QA engineering practice exercise uses AI to role-play the PO, Dev, and Design perspectives so the shift-left loop can be demonstrated end-to-end. The responses below are AI-authored recommendations grounded in the existing schema, flows, and product docs (`business-data-map.md`, `business-model.md`) — they are ****not*** real confirmations from the actual PO, Dev, or Design stakeholders. Treat them as a confident starting proposal to validate or override before this Story leaves Estimation.

---

## Responding as PO

**(role-played for this exercise — answering the 2 Critical Questions raised in the Shift-Left refinement)**

### Q1 — Multi-owner gate: can a workspace have >1 owner, and can any of them leave freely?

***Decision******:****** YES — the gate is count-based ("are you the LAST remaining owner"), not identity-based ("are you AN owner").***

- The schema does not prevent multiple `workspace*members` rows with `role = 'owner'` for the same workspace — `bunkai*is*workspace*owner(ws*id)` checks `status = 'active' AND role = 'owner'`, a row-level role check, not a comparison against `workspaces.owner*user_id`.
- "Leave workspace" should be available to ANY member with `role = 'owner'` as long as at least one OTHER `role = 'owner', status = 'active'` row remains for that workspace after the leave.
- ***No ownership-transfer sub-flow is in scope for BK-90.*** That's a separate, larger feature (assigning/promoting an owner) — if/when we want to support a workspace ending up with zero owners, that's a follow-up story, not a blocker here.
- ***New Scenario C is CONFIRMED as written*** — a co-owner can leave when other owners remain, no extra steps.
- One nuance for Dev to be aware of (not a new requirement, just a note): `workspaces.owner*user*id` is a single FK set at creation time. It does not need to be updated when a co-owner leaves — it remains a "creator of record" / audit field, decoupled from the RBAC `role = 'owner'` set. If `owner*user*id` itself ever needs reassignment, that's the same future ownership-transfer story mentioned above.

### Q2 — What happens when a user leaves their only workspace?

***Decision******:****** Route to ****`/onboarding`**** — do NOT block.***

- This is the existing, already-handled state per Flow 2 (`business-data-map.md` §3): "no active memberships → redirect to `/onboarding`" is exactly what a brand-new user without any workspace experiences today.
- Reusing this flow means ***zero new UI and zero new business rule*** — lower effort, and it avoids inventing a second "you can't leave" gate alongside the sole-owner gate (which would make the two gates easy to confuse in testing and in the UI copy).
- ***New Scenario A is CONFIRMED as written*** — leaving your only workspace removes the membership row and routes to onboarding, same entry point as a new signup.

---

## Responding as Dev

**(role-played for this exercise — answering the 1 Technical Question raised in the Shift-Left refinement)**

### Should workspace-scoped PATs be auto-revoked when the user leaves that workspace?

***Decision******:****** YES — auto-revoke as part of the same transaction.***

- `access*tokens` already has a `revoked*at` soft-delete column and a documented lifecycle (`active → revoked` via `UPDATE SET revoked_at = now()`, no hard delete — `business-data-map.md` §4.3). This is an existing, well-understood mechanism — no new state or column needed.
- Implementation: the "leave workspace" RPC/Server Action should, in the same transaction that deletes the caller's `workspace*members` row, run `UPDATE access*tokens SET revoked*at = now() WHERE user*id = auth.uid() AND workspace*id = <left*ws*id> AND revoked*at IS NULL` — mirroring the atomic, single-transaction pattern already used by `bunkai*bootstrap*workspace` (migration `0006`).
- ***Rationale over "leave as-is"***: yes, RLS would block the token regardless once membership is gone — but leaving it "active" in the PAT management UI is misleading (looks usable, isn't) and pollutes the audit trail. Auto-revoke gives a clean, honest record with one extra `UPDATE` we already know how to write.
- ***Effect on New Scenario B***: the "no cascade" framing stays correct for AUTHORED CONTENT (ATCs, stories, modules, projects remain untouched — workspace-scoped via FK, per `business-data-map.md` §2.3). PAT revocation is a CONFIRMED, in-scope side effect, not part of the "no cascade" guarantee — worth splitting into its own AC line so QA doesn't conflate "content untouched" with "tokens untouched."

---

## Responding as Design

**(role-played for this exercise — answering Gap #2****:**** confirmation-dialog UX, "names the workspace explicitly" vs. type-to-confirm)**

### Should "Leave workspace" require type-to-confirm, or a simple confirm/cancel dialog?

***Decision******:****** Simple confirm/cancel dialog naming the workspace — no type-to-confirm.***

- Type-to-confirm is the right pattern for the HIGHEST-blast-radius destructive actions — ones that are irreversible AND affect data shared with others (e.g., deleting an entire workspace, or a project with all its ATCs/stories).
- "Leave workspace" is self-scoped: only the leaving user's own `workspace_members` row is affected, the workspace's data is fully intact (per New Scenario B), and the action is reversible via re-invite (per BK-90's own EC-4). The blast radius is "this user loses access to one workspace," not "this workspace's data is gone."
- Bunkai's stated design philosophy is "information density first... developer-first, opinionated about quality" (`business-model.md` / `DESIGN.md` §1) — an extra typed-confirmation step adds friction disproportionate to the actual risk for this action, and QA leads (the primary persona, per BK-90's user story) move between client workspaces often enough that this should stay low-friction.
- ***Recommended copy**** for the confirmation dialog (Scenario 1, as already refined): a modal naming the workspace explicitly, e.g. **"Leave 'Fintech Audit'? You'll lose access to its projects and ATCs. A workspace owner can re-invite you later."** with ****Cancel**** / ****Leave workspace*** buttons.
- This resolves Gap #2 from the refinement: reserve type-to-confirm for workspace/project deletion (a future story), not for self-scoped membership changes like this one.

---

## Net effect on the refined Acceptance Criteria

With the above, all 3 ***NEEDS PO/DEV CONFIRMATION*** scenarios in the `acceptance*criteria` field (New Scenarios A, B, C) are CONFIRMED as written, with one addition recommended for New Scenario B: split out a PAT-revocation assertion as its own clause (or its own scenario) per the Dev answer above. Recommend the team review this comment and, if these recommendations are accepted, ask QA to update `acceptance*criteria` to remove the "NEEDS PO/DEV CONFIRMATION" flags and add the PAT-revocation clause before this Story leaves Estimation.

— Posted as part of a QA shift-left practice exercise, 2026-06-10

---

### Ely - 7/30/2026, 1:28:59 PM

Mockup — Settings — Workspaces (leave flow + sole-owner guard). Source: .context/designs/bunkai-test-management-tool/bk-85-account-settings/settings-workspaces.html · spec: master-design-plan §4.10



---

### Ely - 7/31/2026, 1:07:35 PM

## Open questions ratified before Stage 1 planning (2026-07-31)

The 3 shift-left questions (role-played PO/Dev/Design answers from 2026-06-10, explicitly disclaimed as practice-exercise recommendations, never formally accepted) were confirmed by the product owner before implementation:

1. ***Multi-owner gate****: count-based ("are you the LAST remaining owner"), not identity-based. Any member with `role='owner'` can leave as long as at least one other active owner remains. No ownership-transfer sub-flow in this story's scope. ****New Scenario C confirmed as written.***
2. ***Leaving your only workspace****: routes to `/onboarding` (reuses the existing no-workspace flow), does not block. ****New Scenario A confirmed as written.***
3. ***Workspace-scoped PATs on leave***: auto-revoked in the same transaction as the membership delete (`UPDATE access*tokens SET revoked*at = now() WHERE user*id = auth.uid() AND workspace*id = <left*ws*id> AND revoked_at IS NULL`). Split out as its own assertion, distinct from New Scenario B's "no cascade on authored content" guarantee.

All 3 `NEEDS PO/DEV CONFIRMATION` flags in `acceptance_criteria` are now resolved. Proceeding to implementation.

---

### Ely - 7/31/2026, 1:11:15 PM

## Correction to the previous comment — mockup takes precedence (2026-07-31)

The shipped mockup (`settings-workspaces.html`, delivered 2026-07-30 — more recent than the 2026-06-10 role-played comment) directly contradicts 2 of the answers just posted:

1. ***Leaving your only workspace****: the mockup's `state:single-workspace` reference panel explicitly says **"The Leave action doesn't render — leaving your only workspace would strand the account."** This is a ****block**** (hide the action entirely), not a redirect to `/onboarding`. Per Critical Rule #15 (the mockup is the design contract; the more recent, shipped artifact outranks an earlier, explicitly-disclaimed practice-exercise comment), ****following the mockup: block, not redirect.*** New Scenario A is superseded by this — leaving is simply not offered when it's the user's only membership.
2. ***Confirmation UX****: the mockup uses a ****type-to-confirm*** pattern (the user must type the exact workspace name to enable the "Leave" button), not the simple confirm/cancel dialog the role-played "Design" answer recommended. Following the mockup: type-to-confirm, matching its tested implementation exactly.

The multi-owner gate (count-based) and PAT auto-revoke decisions from the previous comment stand unchanged — the mockup doesn't address either (no co-owner state or PAT-cascade behavior is depicted).

Net effect: implementation follows the shipped mockup wherever it speaks, and the earlier role-played comment only where the mockup is silent.

---


_Synced from Jira by sync-jira-issues_
