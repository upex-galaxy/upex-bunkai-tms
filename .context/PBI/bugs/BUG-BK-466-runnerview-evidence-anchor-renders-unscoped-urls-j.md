# BUG: RunnerView evidence anchor renders unscoped URLs — javascript:/data: schemes accepted

**Jira Key:** [BK-466](https://jira.upexgalaxy.com/browse/BK-466)
**Priority:** High
**Status:** Ready For QA
**Components:** None
**Severity:** Mayor
**Error Type:** Security
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

The evidence-link anchor rendered for a run step in the Runner view accepts any URL scheme, including `javascript:` and `data:`, and opens it as a live hyperlink with no client-side guard.

## Steps to Reproduce

1. As a workspace member with write access, mark a run step and set its evidence URL to a `javascript:` or `data:` payload.
2. As any workspace member (including a viewer), open that run and view the step's evidence link.
3. Click the evidence link.

## Impact

Confirmed during the BK-337 Tech Lead review (Scenario G5): the write gate is `bunkai*can*write_workspace`, so any member, admin or owner can plant one, and every workspace member including a viewer can read and click it. RLS bounds the blast radius to one tenant, making this a co-worker session-theft vector rather than a cross-tenant breach. Privilege escalation inside a tenant with zero guards is not minor, which is the basis for the priority and severity below.

## Fix scope

The fix has to cover both ends: the render guard on the anchor and the write-time validation that lets a hostile value reach storage in the first place. The scheme allowlist should live in one shared place rather than being pasted at each call site.

## Status update since filing

BK-337 has since shipped its own version of this fix, scoped to the defect detail page only: `isHttpUrl` in `lib/utils/url.ts` and a tightened `evidenceUrlsSchema` in `lib/bugs/validation.ts`. The remaining work here is applying that same shared helper to the RunnerView anchor (`components/runs/RunnerView.tsx:811-818`) and its write-time counterpart (`lib/runs/mark-step-view.ts:157`, still calling the unguarded `isValidUrl` in `lib/utils/url.ts`) — not inventing a second, narrower version of the rule.

## Sequencing note

The Product Owner's original ruling asked to sequence this Bug ahead of BK-337, so BK-337 would not have to write its own narrower version of the same rule. BK-337 shipped first, so that sequencing did not hold — it shipped `isHttpUrl` and used it on its own surface. This ticket is filed after the fact; the ordering instruction is moot, and that is stated here rather than left implicit.

## Origin

Raised during the BK-337 Shift-Left review. Quoting the Product Owner's ruling:

> File it as a Bug, not a Defect: the runner is live above Staging, so the feature's lifecycle stage decides the type. It is not BK-337's to fix. BK-337's evidence-scheme criterion covers the defect detail page only; this anchor is separate shipped code on a different screen.

P2, Major. Not P1: exploiting it needs an authenticated member of the workspace with write access to mark a step, plus a deliberate click by the victim, and RLS bounds the blast radius to one tenant. Not P3: a member can plant it and an owner can click it, the script would run on the app origin inside the victim's authenticated session, this product issues personal access tokens that such a session could mint, and there is no mitigating control at any point in the path.

— Product Owner, BK-337, 2026-08-11

See [BK-337](https://jira.upexgalaxy.com/browse/BK-337) for the originating story and its full Shift-Left rulings.

---

## 🐞 Actual Result

The evidence anchor at `components/runs/RunnerView.tsx:811-818` renders `s.evidence*url` directly as `<a href={s.evidence*url} target="_blank" rel="noreferrer">`, with no scheme check. The only upstream gate is `isValidUrl` (`lib/runs/mark-step-view.ts:157`, defined in `lib/utils/url.ts`), a bare `new URL(value)` check that accepts `javascript:` and `data:` without complaint. `rel="noreferrer"` alone does nothing against either.

---

## ✅ Expected Result

Only `http:` and `https:` evidence URLs should render as a clickable anchor. Any other scheme should still be visible and readable as text, never silently dropped, consistent with the allowlist BK-337 already applies to the defect detail page's own evidence rows via `isHttpUrl` (`lib/utils/url.ts`).

---

## Related Issues

- relates to: [BK-337](https://jira.upexgalaxy.com/browse/BK-337) - TMS-Defect Detail | Open a defect and read its full record

---

## Metadata

- **Created:** 8/14/2026
- **Updated:** 8/14/2026
- **Reporter:** Ely
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
