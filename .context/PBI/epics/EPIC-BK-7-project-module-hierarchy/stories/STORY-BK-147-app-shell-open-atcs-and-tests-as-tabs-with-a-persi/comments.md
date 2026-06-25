# Comments for BK-147

[View in Jira](https://jira.upexgalaxy.com/browse/BK-147)

---

### Automation for Jira - 6/19/2026, 6:50:17 PM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 6/19/2026, 7:02:41 PM

✅ Pull Request is successfully MERGED. Task is Done.

---

### Ely - 6/19/2026, 7:03:58 PM

Merged to staging via PR #43 (https://github.com/upex-galaxy/upex-bunkai-tms/pull/43). Deployed to https://staging-upexbunkai.vercel.app — ready for QA.

***Scope delivered******:*** persistent project explorer + toolbar on every project route; ATCs and Tests open as route-driven workbench tabs (multi-tab, dedup, close→adjacent, close-last→index); deep-link opens an item as a tab; safe in-shell not-found for deleted/invisible items; app-shell search wired to ⌘K palette.

All 10 acceptance scenarios validated live on the "Rocket" project; quality gates green (types/lint/tests). Bundled fix: BK-28 Test-detail hydration mismatch.

@Ely ready for QA verification on staging.

---

### Nahuel Gomez - 6/23/2026, 11:45:08 PM

## BK-147 — QA Report

Tested: 2026-06-23 · Environment: Staging · Result: PASSED (4/11) · BLOCKED (7/11 — data gap)

App shell verified: persistent sidebar, account block, workspace switcher, global search, breadcrumb navigation, toolbar (New ATC/Test), workbench index state all working correctly.

Tab behavior (open, multi-tab, close, deep-link, not-found, cross-project isolation) could not be fully exercised — no modules/ATCs/Tests exist in the qa-headless workspace to open as tabs. Requires test data seeding.

ATP: customfield*10067 · ATR: customfield*10147

---

### Nahuel Gomez - 6/24/2026, 12:09:07 AM

App shell with persistent sidebar + workbench index



---

### Nahuel Gomez - 6/24/2026, 12:09:16 AM

TC10: In-shell not-found for deleted/invisible item



---

### Nahuel Gomez - 6/24/2026, 12:09:26 AM

TC4+TC9: Multi-tab with ATC deep link loaded in workbench



---

### Nahuel Gomez - 6/24/2026, 12:09:38 AM

## BK-147 — QA Final Report

Result: PASSED (10/11) — App shell tab workbench verified.

Transitions: Ready For QA → In Test → ready for QA Approved.

### Evidence attached:

- bk147-app-shell-with-sidebar.png — Persistent sidebar + workbench index
- bk147-tc10-not-found.png — In-shell not-found for deleted items
- bk147-multi-tab.png — Multi-tab with ATC deep link in workbench

Note: TC6 (close tab adjacent activation) not explicitly tested. All other ACs pass.

---


_Synced from Jira by sync-jira-issues_
