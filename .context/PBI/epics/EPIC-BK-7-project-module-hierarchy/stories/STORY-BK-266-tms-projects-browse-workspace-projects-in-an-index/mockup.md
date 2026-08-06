# BK-266 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-266)

> ***NOTE:**** ****NO MOCKUP EXISTS FOR THIS SCREEN.*** This story is a spec-only departure, same path BK-49 took.

***Why there is no mockup.**** The Master Design Plan's §4.3 "Projects" section specs the project ****detail**** screen (`project.jsx` — explorer, toolbar, tabs, detail pane). There is no authored mockup of a projects ****index***: the closest activity-shaped surface, the Home dashboard, is unbuilt and owned by a different epic.

***What it is built against instead.***

- `DESIGN.md` §2 frozen tokens — colour, type, radii, spacing, motion, focus. No new token, no re-picked value, no new design-system primitive.
- The closest existing live list pattern already shipped in this codebase, reused for structure and rhythm only — not visually copy-pasted. Per Critical Rule #14 the live UI is the fidelity source of truth here, not a mockup.

***Paper trail.**** Registered as a §5 spec-only divergence in `.context/design/master-design-plan.md` (with its §8 US→Screen row) when implementation starts. ****No ADR*** — this touches no schema, no auth model, and no cross-cutting invariant; it is a screen-composition and routing decision, fully reversible.

---
_Synced from Jira by sync-jira-issues_
