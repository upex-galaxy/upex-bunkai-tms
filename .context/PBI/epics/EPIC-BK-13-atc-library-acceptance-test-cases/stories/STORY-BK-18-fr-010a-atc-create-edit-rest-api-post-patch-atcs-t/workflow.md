# BK-18 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-18)

Un miembro llama a POST /atcs con un payload completamente formado. La capa de API valida el schema (zod/openapi) y luego realiza checks cross-entity contra las tablas user*stories, acceptance*criteria y modules. Dentro de una sola transaction de SQL el servicio inserta la fila de atcs, luego hace bulk-insert de atc*steps y atc*assertions referenciando el nuevo atc*id, y después computa y persiste el slug. Al hacer commit, el event bus emite atc.created con el payload completo. PATCH /atcs/{id} sigue el mismo camino pero comienza cargando la fila actual, aplica la actualización parcial, hace delete-then-insert de steps y assertions en la misma transaction, incrementa version, y emite atc.updated con la lista de test*ids que referencian este ATC.

---
_Synced from Jira by sync-jira-issues_
