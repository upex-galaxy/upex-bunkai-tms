# TMS-Projects | Switch between Tree, Table & Mind map views in a hardened explorer

**Jira Key:** [BK-98](https://jira.upexgalaxy.com/browse/BK-98)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** 1

---

## Overview

## User Story

***As a*** QA engineer working inside a project,
***I want*** to switch the project workbench between Tree, Table, and Mind map views and navigate a hardened, scalable module/story/ATC explorer,
***so that*** I can browse large projects without drowning in a flat list, jump straight from a story or acceptance criterion into authoring an ATC, and visualize project topology at a glance.

## What shipped

This story documents a Projects-explorer design overhaul + a Tree / Table / Mind map view switcher that shipped to the `staging` branch as a hotfix. It hardens the explorer behind existing stories ***BK-9**** (module creation) and ****BK-10*** (module rename/delete) and adds the view switcher. Captured here for tracking + QA.

Delivered:

- ***View switcher**** in the project toolbar — ****Tree**** (explorer + ATC table), ****Table**** (full-width ATC table), ****Mind map**** (SVG topology module -> US -> ATC). Mind map ships with ****Topology**** mode live; ****Coverage**** and ****Bug-density*** modes render disabled ("soon") because they need run/bug data that does not exist yet.
- ***Status filter chips*** in the explorer ([https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9)): `all` / `fail` / `blocked` / `unrun` with live counts, hidden when a project has 0 ATCs.
- ***Right-click context menu*** on module / story / ATC rows ([https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10)): Open, New sub-module, New story, Rename, Move, Duplicate ("soon"), Copy ID, Delete.
- ***User-story rows are accordions**** — AC and ATC children collapse until toggled; ATCs nest under their US showing the ****slug*** (not UUID); the US issue key no longer wraps.
- ***AC rows are clickable**** (open criteria panel) with a ****Create ATC*** shortcut on story/AC rows that deep-links to `/atcs/new?story=&ac=` and pre-anchors module + story + AC in the editor.
- ***Collapsible + drag-resizable explorer panel*** — Jira-style divider, collapse to a rail, resize 220-520px.

## Design reference

Renders into the ***Projects**** screen — master-design-plan §4.3, mockup `screens/project.jsx`. The accordion / collapse-resize / Create-ATC additions are ratified in §5 as divergence ****D8*** (additive UI, zero schema/API change).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Metadata

- **Created:** 6/9/2026
- **Updated:** 7/24/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** design-fidelity, hotfix-documented, projects-explorer, view-switcher

---

_Synced from Jira by sync-jira-issues_
