# BK-18 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-18)

- Endpoint POST /atcs con validación completa del body (title, module*id, user*story_id, AC ids, layer, steps[], assertions[], tags[])
- Endpoint PATCH /atcs/{id} con actualización parcial + reemplazo en cascada de steps/assertions
- Insert/update transaccional de las tablas atcs + atc*steps + atc*assertions
- Computación de slug "{module-slug}/{atc-id-padded}"
- Validación cross-entity (AC pertenece a US, module en project subtree, layer enum, posiciones de steps)
- Emisión de event: atc.created en POST, atc.updated en PATCH (con conteo de affected*test*ids)
- Entradas en OpenAPI spec para ambos endpoints con schemas de request/response
- Unit + integration tests (reglas cross-entity, rollback de la transaction al fallar)

---
_Synced from Jira by sync-jira-issues_
