# Authentication | Sign up and sign in with email and password

**Jira Key:** [BK-166](https://jira.upexgalaxy.com/browse/BK-166)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** -

---

## Overview

***Source spec******:*** FR-001

## User story

As a Full-Stack Developer (Sara Iglesias), I want to sign up and sign in with my email and a password through a single email-first screen so that I can get into Bunkai with the login method I already use everywhere, without waiting for a magic-link email or depending on a third-party identity provider.

This adds password as the ***third*** sign-in method on the login screen, alongside the email magic-link (BK-2) and OAuth (BK-3). Password is the primary method on the screen; magic-link stays visible as a secondary fallback; OAuth buttons remain below. The same account can also be used from automation: an API/CLI consumer (Karim) signs in over the API and receives a personal access token, while a browser session keeps its own cookie — the two coexist without revoking each other.

## Definition of done

- Implementation complete
- Unit tests written (including the cookie-session / token coexistence invariant)
- Code reviewed
- Documentation updated

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

### Story (1)

- [BK-2](https://jira.upexgalaxy.com/browse/BK-2): Authentication | Sign up and sign in with email magic-link _(Ready For Release)_

---

## Metadata

- **Created:** 6/21/2026
- **Updated:** 6/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** auth, mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
