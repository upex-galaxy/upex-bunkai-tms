# TMS-Workspace | Delete a workspace I own

**Jira Key:** [BK-512](https://jira.upexgalaxy.com/browse/BK-512)
**Epic:** [BK-85](https://jira.upexgalaxy.com/browse/BK-85) (Account & Settings)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

***As a*** QA Lead / Quality Engineering Manager who owns a workspace
***I want to*** delete a workspace I own from Settings, after confirming its exact name
***So that*** I can honour an erasure request, or retire a workspace we no longer use, without asking anyone at Bunkai to do it for me

## Definition of done

- [ ] A Delete workspace action exists on the Settings workspaces screen, on rows the caller owns and nowhere else
- [ ] Deleting is gated by typing the workspace's exact name, the same idiom Leave already uses
- [ ] Confirming removes the workspace and everything inside it, immediately and irreversibly, and the confirmation said so before it happened
- [ ] The flow offers a data export first, so the Owner is never forced to choose between keeping the data and erasing it
- [ ] Every other member loses access at once, and anyone pointed at the deleted workspace is re-pointed at one they still belong to
- [ ] An Owner who deletes their only workspace lands somewhere coherent rather than on a broken shell
- [ ] Deleting a workspace never touches any other workspace
- [ ] Deleting is visibly a different act from leaving, and leaving still works exactly as it did

## Context

`.context/SRS/non-functional-specs.md` §9 (Compliance) commits to it in one sentence: "GDPR: Workspace owners can request data export + deletion via Settings." The export half is ticketed as BK-508. ***The deletion half has never been ticketed at all*** — this story is it.

Verified absent at `origin/staging`: `app/api/v1/workspaces/[id]/route.ts` exports `GET` and `PATCH` only, with no `DELETE`; a search for workspace-deletion or erasure code across `app`, `lib` and `components` returns nothing; the single occurrence of "danger zone" anywhere in the product is a code comment in `components/settings/IdentityCard.tsx`.

***This is not BK-90, and the two must never be read as duplicates.**** BK-90 ships **leaving* a workspace: the caller removes their own membership row and the workspace carries on without them, with a deliberate sole-owner block that refuses the leave precisely so a workspace is never orphaned. This story is the opposite act — the Owner removes the workspace itself, for everyone. Leave is a membership operation on one person; delete is a lifecycle operation on the tenant. Both live on the same screen and both must stay separately reachable and separately labelled.

The screen that hosts it already exists (`/settings/workspaces`, rendering `WorkspacesList`), and so does the confirmation idiom: `LeaveWorkspaceModal` already ships a type-the-exact-name gate over an `alertdialog`. Reusing it is the Critical Rule #14 live-UI-first path, not a new invention.

## Design note — for the implementing run

No mockup draws workspace deletion. The `bk-85-account-settings` suite draws two adjacent destructive idioms this story derives from: ***delete account**** (`settings-account.html`, Danger zone, `alertdialog` + typed-email confirm) and ****leave workspace**** (`settings-workspaces.html`, `alertdialog` + typed-name confirm, sole-owner row locked with a visible reason). Deriving from those two is a ****spec-only departure*** under Critical Rule #15 and must be ratified as a §5 row in `.context/design/master-design-plan.md` before implementation, together with the story's §8 US-to-Screen row. Do not invent a new destructive pattern; do not re-pick tokens.

## Provenance

Authored 2026-08-18 by the AI Product Owner profile, from `.context/SRS/non-functional-specs.md` §9 (Compliance) and the exclusion BK-508 recorded in its own Out Of Scope field, which named this story's three open questions and deferred them here.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Storys (2)

- [BK-508](https://jira.upexgalaxy.com/browse/BK-508): Settings | Request an export of my workspace data _(Backlog)_
- [BK-90](https://jira.upexgalaxy.com/browse/BK-90): TMS-Workspace | Leave a workspace _(Ready For QA)_

---

## Metadata

- **Created:** 8/18/2026
- **Updated:** 8/18/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
