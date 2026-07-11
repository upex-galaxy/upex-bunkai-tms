# BK-46 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-46)

Ah, claro — querés ver el ***contenido completo del ATP*** para poder copiarlo, pero el agente lo mostró cortado o no lo ves entero. Te lo paso limpio y completo acá, listo para que selecciones y copies de una:

---

***Shift-Left ATP DRAFT — BK-46 (2026-06-26)***

Pre-sprint draft. Outlines only — no test code. Subject to PO confirmation on Q1/Q2/Q3.
Coverage estimate: 20 outlines | 7 Positive / 6 Negative / 4 Boundary / 3 Integration

***GROUP 1 — No-ATC coverage gap (5 outlines)***

1. Should list an AC with no linked ATC as a coverage gap [Positive]
2. Should list multiple uncovered ACs from the same module together [Positive]
3. Should NOT list an AC that has at least one linked ATC (regardless of ATC run status) [Negative]
4. Should show module and user story context alongside each uncovered AC [Positive]
5. Should display "no coverage gaps" state when all ACs have at least one linked ATC [Boundary]

***GROUP 2 — "Not run" filter (5 outlines)***

1. Should show an AC in the "not run" filter when its only linked ATC has status = 'unrun' [Positive]
2. Should NOT show an AC when all its linked ATCs have status = 'pass' [Negative]
3. Should NOT show an AC with no linked ATC at all in the "not run" filter [Negative]
4. Should NOT show an AC in "not run" filter when at least one linked ATC has status = 'pass' (multi-ATC) [Negative — NEEDS PO CONFIRMATION Q3]


10. Should show an AC in "not run" filter when ALL linked ATCs are 'unrun' (multi-ATC) [Positive]

***GROUP 3 — Fully covered module indicator (3 outlines)***
11. Should display "fully covered" when all ACs have ATCs with non-unrun status [Positive — NEEDS PO CONFIRMATION Q2]
12. Should NOT display "fully covered" when any AC has no linked ATC [Negative]
13. Should NOT display "fully covered" when any AC's linked ATCs are all 'unrun' [Negative — NEEDS PO CONFIRMATION Q2]

***GROUP 4 — Access control (2 outlines)***
14. Should be accessible to the role defined for coverage view access [Positive — NEEDS PO CONFIRMATION Q5]
15. Should deny access to unauthenticated requests [Negative]

***GROUP 5 — Edge cases (5 outlines)***
16. Should handle a module with no user stories without error [Boundary]
17. Should handle a project with no acceptance criteria without error [Boundary]
18. Should reflect updated coverage after a new ATC is linked to a previously uncovered AC [Integration]
19. Should reflect updated coverage after an ATC is hard-deleted (AC reverts to uncovered) [Integration]
20. Should handle large projects without degraded load time [Boundary — perf threshold TBD]

***SCHEMA GAP (futuro):*** atcs no tiene soft-delete hoy. Si se agrega ATC archiving, definir antes si ATCs archivados cuentan como cobertura — de lo contrario la coverage view queda rota silenciosamente. (Ver Q7 en artefacto local de refinement.)

---
_Synced from Jira by sync-jira-issues_
