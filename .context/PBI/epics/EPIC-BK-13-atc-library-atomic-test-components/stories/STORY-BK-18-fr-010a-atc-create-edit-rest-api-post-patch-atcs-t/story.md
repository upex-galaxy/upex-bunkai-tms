# TMS-ATC API | Create and edit ATCs with steps and assertions

**Jira Key:** [BK-18](https://jira.upexgalaxy.com/browse/BK-18)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Atomic Test Components))
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## Overview

**Source spec:** FR-010a

## User Story

Como ingeniero de automatización o consumidor de la API, quiero una REST API para crear y editar ATCs (Atomic Test Components) con sus steps y assertions en una sola llamada transaccional, para que pueda componer bloques de prueba reutilizables desde herramientas de CLI, scripts y el cliente de UI.

## Context

Ancla PRD US 4.1 y US 4.2 e implementa SRS FR-010 (superficie de servidor). El formulario de UI (Story FR-010b, [BK-19](https://jira.upexgalaxy.com/browse/BK-19)) y la composición de Test posterior (EPIC-BK-5) dependen ambos de este contrato.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-05-27

> El ATP DRAFT completo vive en el custom field 🧪 Acceptance Test Plan (ATP) y está reflejado como comentario en este issue. Esta sección captura los slices que el PO y el Dev necesitan antes de la estimación.

### 🔍 Refined Acceptance Criteria — resumen

Se produjeron 13 Gherkin scenarios (Happy 2 / Negative 7 / Boundary 2 / Integration 2). Decisiones clave de contrato:

1. **Slug format**: `{module-slug}/atc-{id-first-8-chars}` (prefijo de UUID en minúsculas) — determinista, sin dependencia de secuencia.
2. **Semántica de PATCH**: cuerpo de reemplazo total (estilo PUT), NO merge parcial. Lo omitido = se limpia.
3. **Version conflict**: optimistic locking vía header `If-Match: <version>`. 409 si hay mismatch.
4. **Error codes**: agregar `ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid` al mapa `API*ERROR*CODES`.
5. **Auth**: `requireBearerToken` + `requireScope('atc:write')` en ambos endpoints.
6. RPC `bunkai*create*atc`: nuevo RPC que devuelve uuid (separado de `bunkai*save*atc`, que es solo UPDATE).
7. **affected*********test*********ids**: array vacío en el MVP (la tabla `test_steps` todavía no existe).
8. **user*********story*********id en PATCH**: inmutable — se ignora silenciosamente si se provee.

### ⚠️ Edge Cases Identified

14 edge cases: 6 Alta, 5 Media, 3 Baja. Las de mayor severidad:

- POST con PAT inválido (401), scope insuficiente (403), PATCH a un id inexistente (404)
- Version conflict en PATCH concurrente (409), slug collision (409)
- POST con module fuera del subtree del project

### ❓ Open Questions — con decisiones de Senior PO/DEV

1. **Manejo de slug collision**: devolver 409 — el cliente debe reintentar con distinto module/title. (Senior PO)
2. **Consumidores de event en el MVP**: registrar en la tabla event_log — BK-20/21 consumen después. (Senior PO)
3. **Naming de scope**: un único `atc:write` cubre tanto POST como PATCH. (Senior PO)
4. **Firma de bunkai*********create*********atc**: devuelve uuid, recibe `p*project*id`. El slug se computa en PL/pgSQL. (Senior DEV)
5. **Registro de error codes**: agregar al mapa `API*ERROR*CODES` (no inline). (Senior DEV)
6. **affected*********test*********ids**: array vacío `[]` — la tabla test_steps todavía no está migrada. (Senior DEV)
7. **PATCH con body vacío**: aceptar como no-op → 200, sin incremento de version, sin event. (Senior DEV)

### 📐 Scope — IN vs OUT

**IN**: endpoints POST/PATCH, RPC bunkai*create*atc, validación cross-entity, computación de slug, incremento de version, auth+scope, optimistic locking, emisión de event, nuevos error codes, OpenAPI spec, integration tests.
**OUT**: GET (BK-20), DELETE (futuro), formulario de UI (BK-19), expansión de used*in (BK-20), idempotency (futuro), webhooks (futuro), scopes granulares (futuro), affected*test_ids con datos reales (EPIC-BK-5).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (7)

- [BK-15](https://jira.upexgalaxy.com/browse/BK-15): TMS-AC | Manage criteria under a user story _(Ready For QA)_
- [BK-19](https://jira.upexgalaxy.com/browse/BK-19): TMS-ATC Builder | Build an ATC with ordered steps and assertions _(Estimation)_
- [BK-20](https://jira.upexgalaxy.com/browse/BK-20): TMS-ATC Search | Search and autocomplete ATCs _(Ready For Dev)_
- [BK-23](https://jira.upexgalaxy.com/browse/BK-23): TMS-ATC Duplicate | Duplicate an ATC with steps and assertions _(Estimation)_
- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Ready For Dev)_
- [BK-21](https://jira.upexgalaxy.com/browse/BK-21): TMS-ATC Propagation | Cascade ATC edits to all tests _(Shift-Left QA)_
- [BK-22](https://jira.upexgalaxy.com/browse/BK-22): TMS-ATC Usage | See a "Used in N tests" report _(Ready For Dev)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 6/8/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** api, atc, backend, mvp, shift-left-2026-05-27, shift-left-reviewed, wave-2

---

_Synced from Jira by sync-jira-issues_
